import Session from '../models/Session.js';
import ExamRoom from '../models/ExamRoom.js';
import { getDashboard, generateExcel } from '../services/pythonBridge.js';
import { sendEmail } from '../utils/mailer.js';
import { getVivaInvitationEmail } from '../utils/emailTemplates.js';

export const getDashboardData = async (req, res) => {
  try {
    const query = { status: 'COMPLETED', teacherId: req.teacher._id };
    if (req.query.examRoomId) {
      query.examRoomId = req.query.examRoomId;
    }
    const sessions = await Session.find(query);

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

    const batchRecords = sessions.map(s => ({
      student_info: {
        roll_no: s.studentInfo.rollNo,
        name: s.studentInfo.name,
      },
      viva_state: s.vivaState,
      proctoring_logs: {
        cheating_probability: s.proctoringLogs?.cheatingProbability || 0,
        proctoring_status: s.proctoringLogs?.proctoringStatus || 'CLEAN',
        flags: s.proctoringLogs?.flags || [],
      },
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

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        studentInfo: session.studentInfo,
        questionBank: session.questionBankId,
        answersMap: session.vivaState?.answers_map || {},
        totalScore: session.totalScore,
        scorePercentage: session.scorePercentage,
        finalGrade: session.finalGrade,
        gradePoint: session.gradePoint,
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

export const exportExcel = async (req, res) => {
  try {
    const query = { status: 'COMPLETED', teacherId: req.teacher._id };
    if (req.query.examRoomId) {
      query.examRoomId = req.query.examRoomId;
    }
    const sessions = await Session.find(query);

    if (sessions.length === 0) {
      return res.status(400).json({ success: false, error: 'No completed sessions to export' });
    }

    const batchRecords = sessions.map(s => ({
      student_info: {
        roll_no: s.studentInfo.rollNo,
        name: s.studentInfo.name,
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
    const { questionBankId, allowedStudents } = req.body;
    if (!questionBankId) return res.status(400).json({ success: false, error: 'questionBankId is required' });

    const roomCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
    const room = await ExamRoom.create({
      roomCode,
      teacherId: req.teacher._id,
      questionBankId,
      allowedStudents: allowedStudents || []
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
