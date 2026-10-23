import Session from '../models/Session.js';
import ExamRoom from '../models/ExamRoom.js';
import StudentAnswer from '../models/StudentAnswer.js';
import { getDashboard, generateExcel } from '../services/pythonBridge.js';
import { sendEmail } from '../utils/mailer.js';
import { getVivaInvitationEmail } from '../utils/emailTemplates.js';

export const getDashboardData = async (req, res) => {
  try {
    const query = { status: 'COMPLETED', teacherId: req.teacher._id };
    if (req.query.examRoomId && req.query.examRoomId !== 'all') {
      query.examRoomId = req.query.examRoomId;
    }
    const sessions = await Session.find(query).sort({ createdAt: -1 });

    if (sessions.length === 0) {
      return res.json({
        success: true,
        data: {
          summary_metrics: {
            overall_average_score: 0,
            pass_rate_percentage: 0,
            passed_count: 0,
            total_students: 0,
            flagged_integrity_cases: 0,
          },
          students_table: [],
        },
      });
    }

    // Deduplicate: Keep only the latest completed session per student per exam room
    const seenStudents = new Set();
    const latestSessions = [];
    for (const s of sessions) {
      const rollNo = s.studentInfo?.rollNo;
      const key = `${s.examRoomId || ''}_${rollNo || s._id}`;
      if (!seenStudents.has(key)) {
        seenStudents.add(key);
        latestSessions.push(s);
      }
    }

    const batchRecords = latestSessions.map(s => ({
      session_id: s._id,
      exam_room_id: s.examRoomId,
      student_info: {
        roll_no: s.studentInfo?.rollNo || 'N/A',
        name: s.studentInfo?.name || 'Unknown Student',
      },
      viva_state: s.vivaState,
      proctoring_logs: {
        cheating_probability: s.proctoringLogs?.cheatingProbability || 0,
        proctoring_status: s.proctoringLogs?.proctoringStatus || 'CLEAN',
        flags: s.proctoringLogs?.flags || [],
      },
      created_at: s.createdAt,
    }));

    const dashboardData = await getDashboard(batchRecords);
    res.json({ success: true, data: dashboardData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ teacherId: req.teacher._id })
      .select('studentInfo status finalGrade gradePoint totalScore scorePercentage createdAt questionBankId')
      .populate('questionBankId')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSessionById = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).populate('questionBankId');
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const studentAnswerDoc = await StudentAnswer.findOne({ sessionId: session._id });

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        studentInfo: session.studentInfo,
        questionBank: session.questionBankId,
        answersMap: session.vivaState?.answers_map || {},
        studentAnswers: studentAnswerDoc?.answers || [],
        totalScore: session.totalScore,
        scorePercentage: session.scorePercentage,
        finalGrade: session.finalGrade,
        gradePoint: session.gradePoint,
        totalMarks: session.vivaState?.total_viva_marks || 15,
        elapsedTime: session.vivaState?.elapsed_time_sec,
        proctoringLogs: session.proctoringLogs,
        status: session.status,
        createdAt: session.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateStudentAnswerScore = async (req, res) => {
  try {
    const { id, questionIndex } = req.params;
    const { score, teacherNotes } = req.body;

    if (score === undefined || isNaN(score)) {
      return res.status(400).json({ success: false, error: 'A valid numeric score is required' });
    }

    const session = await Session.findOne({ _id: id, teacherId: req.teacher._id });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found or unauthorized' });
    }

    const idx = parseInt(questionIndex, 10);
    const vivaState = session.vivaState || {};
    const answersMap = vivaState.answers_map || {};

    if (!answersMap[idx]) {
      return res.status(404).json({ success: false, error: `No answer found at question index ${idx}` });
    }

    const maxMarks = answersMap[idx].max_marks || (vivaState.question_bank && vivaState.question_bank[idx]?.marks) || 1.0;
    const numericScore = Math.max(0, Math.min(maxMarks, parseFloat(score)));

    // Update answers_map in vivaState
    answersMap[idx].score = numericScore;
    answersMap[idx].teacher_review_required = false;
    answersMap[idx].grading_route = 'teacher_reviewed';
    answersMap[idx].is_reviewed = true;
    if (teacherNotes !== undefined) answersMap[idx].teacher_notes = teacherNotes;

    vivaState.answers_map = answersMap;
    session.vivaState = vivaState;

    // Recalculate totals
    const totalMarks = vivaState.total_viva_marks || 15.0;
    let totalObtained = 0;
    Object.values(answersMap).forEach(ans => {
      totalObtained += (ans.score || 0);
    });

    const scorePct = Math.round((totalObtained / totalMarks) * 10000) / 100;
    const roundedPct = Math.round(scorePct);

    // Official MUET grading scheme
    let grade = 'F';
    let gpa = 0.0;
    if (roundedPct >= 90) { grade = 'A+'; gpa = 4.0; }
    else if (roundedPct >= 81) { grade = 'A'; gpa = 3.5; }
    else if (roundedPct >= 73) { grade = 'B+'; gpa = 3.0; }
    else if (roundedPct >= 65) { grade = 'B'; gpa = 2.5; }
    else if (roundedPct >= 60) { grade = 'C+'; gpa = 2.0; }
    else if (roundedPct >= 55) { grade = 'C'; gpa = 1.5; }
    else if (roundedPct >= 50) { grade = 'C-'; gpa = 1.0; }
    else { grade = 'F'; gpa = 0.0; }

    session.totalScore = Math.round(totalObtained * 100) / 100;
    session.scorePercentage = scorePct;
    session.finalGrade = grade;
    session.gradePoint = gpa;
    session.markModified('vivaState');
    await session.save();

    // Also update StudentAnswer collection
    const qData = vivaState.question_bank ? vivaState.question_bank[idx] : null;
    const qId = qData ? qData.id : null;

    if (qId) {
      await StudentAnswer.findOneAndUpdate(
        { sessionId: session._id, 'answers.questionId': qId },
        {
          $set: {
            'answers.$.score': numericScore,
            'answers.$.teacherReviewRequired': false,
            'answers.$.isReviewed': true,
            'answers.$.teacherNotes': teacherNotes || ''
          }
        }
      );
    }

    res.json({
      success: true,
      message: 'Score successfully updated',
      data: {
        sessionId: session._id,
        updatedIndex: idx,
        score: numericScore,
        totalScore: session.totalScore,
        scorePercentage: session.scorePercentage,
        finalGrade: session.finalGrade,
        gradePoint: session.gradePoint,
        totalMarks: totalMarks,
        answersMap
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const exportExcel = async (req, res) => {
  try {
    const query = { status: 'COMPLETED', teacherId: req.teacher._id };
    if (req.query.examRoomId && req.query.examRoomId !== 'all') {
      query.examRoomId = req.query.examRoomId;
    }
    const sessions = await Session.find(query).sort({ createdAt: -1 });

    if (sessions.length === 0) {
      return res.status(400).json({ success: false, error: 'No completed sessions to export' });
    }

    // Deduplicate: Keep only the latest completed session per student per exam room
    const seenStudents = new Set();
    const latestSessions = [];
    for (const s of sessions) {
      const rollNo = s.studentInfo?.rollNo;
      const key = `${s.examRoomId || ''}_${rollNo || s._id}`;
      if (!seenStudents.has(key)) {
        seenStudents.add(key);
        latestSessions.push(s);
      }
    }

    const batchRecords = latestSessions.map(s => ({
      session_id: s._id,
      student_info: {
        roll_no: s.studentInfo?.rollNo || 'N/A',
        name: s.studentInfo?.name || 'Unknown Student',
      },
      viva_state: s.vivaState,
      proctoring_logs: {
        cheating_probability: s.proctoringLogs?.cheatingProbability || 0,
        proctoring_status: s.proctoringLogs?.proctoringStatus || 'CLEAN',
        flags: s.proctoringLogs?.flags || [],
      },
    }));

    const excelBuffer = await generateExcel(batchRecords);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=muet_viva_summary.xlsx');
    res.send(Buffer.from(excelBuffer));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createExamRoom = async (req, res) => {
  try {
    const { 
      questionBankId, 
      allowedStudents,
      courseDetails,
      timeLimitSec,
      questionsPerStudent,
      totalMarks,
      settings 
    } = req.body;
    if (!questionBankId) return res.status(400).json({ success: false, error: 'questionBankId is required' });

    const calculatedTimeLimit = timeLimitSec 
      ? Number(timeLimitSec) 
      : (settings?.duration ? Number(settings.duration) * 60 : 1800);

    const calculatedQuestionsPerStudent = questionsPerStudent 
      ? Number(questionsPerStudent) 
      : (settings?.questionsPerStudent ? Number(settings.questionsPerStudent) : 5);

    const calculatedTotalMarks = totalMarks
      ? Number(totalMarks)
      : (settings?.totalMarks ? Number(settings.totalMarks) : 15.0);

    const roomCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
    const room = await ExamRoom.create({
      roomCode,
      teacherId: req.teacher._id,
      questionBankId,
      allowedStudents: allowedStudents || [],
      courseDetails: courseDetails || {},
      timeLimitSec: calculatedTimeLimit,
      questionsPerStudent: calculatedQuestionsPerStudent,
      totalMarks: calculatedTotalMarks,
      settings: settings || {}
    });

    // Send email invitations asynchronously
    if (allowedStudents && allowedStudents.length > 0) {
      const teacherName = req.teacher.name || 'Your Teacher';
      // Use the origin from the request to build the join link
      const origin = req.headers.origin || 'http://localhost:5173';

      allowedStudents.forEach(student => {
        if (student.email) {
          const joinLink = `${origin}/login?room=${roomCode}&roll=${student.rollNo}`;
          sendEmail(
            student.email,
            'CodeViva Session Invitation',
            getVivaInvitationEmail(student.name, teacherName, roomCode, joinLink)
          );
        }
      });
    }

    res.status(201).json({ success: true, roomCode: room.roomCode });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getExamRooms = async (req, res) => {
  try {
    const rooms = await ExamRoom.find({ teacherId: req.teacher._id })
      .populate('questionBankId')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const endExamRoom = async (req, res) => {
  try {
    const room = await ExamRoom.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.teacher._id },
      { isActive: false },
      { new: true }
    );
    if (!room) {
      return res.status(404).json({ success: false, error: 'Exam room not found or unauthorized' });
    }
    const io = req.app.get('io');
    if (io) {
      io.emit('ROOM_CLOSED', { roomCode: room.roomCode });
    }
    res.json({ success: true, message: 'Exam room ended successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
