import Session from '../models/Session.js';
import QuestionBank from '../models/QuestionBank.js';
import ExamRoom from '../models/ExamRoom.js';
import StudentAnswer from '../models/StudentAnswer.js';
import { processVivaAction, getIndividualReport } from '../services/pythonBridge.js';

export const checkRoom = async (req, res) => {
  try {
    const room = await ExamRoom.findOne({ roomCode: req.params.roomCode, isActive: true }).populate('questionBankId');
    if (!room) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive room code' });
    }
    let studentName = "Student";
    if (req.query.rollNo) {
      const student = room.allowedStudents.find(s => s.rollNo === req.query.rollNo);
      if (!student) {
        return res.status(403).json({ success: false, error: 'You are not enrolled in this exam room.' });
      }
      studentName = student.name;
    }

    res.json({
      success: true,
      valid: true,
      studentName,
      courseName: room.questionBankId?.title || "Unknown Course",
      totalQuestions: room.questionBankId?.questions?.length || 0,
      timeLimitMinutes: Math.round((room.questionBankId?.timeLimitSec || 1800) / 60)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const startSession = async (req, res) => {
  try {
    const { rollNo, name, roomCode } = req.body;

    if (!rollNo || !name || !roomCode) {
      return res.status(400).json({
        success: false,
        error: 'rollNo, name, and roomCode are required',
      });
    }

    const room = await ExamRoom.findOne({ roomCode, isActive: true });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Invalid or inactive room code' });
    }

    const bank = await QuestionBank.findById(room.questionBankId);
    if (!bank) {
      return res.status(404).json({ success: false, error: 'Question bank not found' });
    }

    const initialState = {
      question_bank: bank.questions.map(q => ({
        id: q.id,
        question: q.question,
        expected_keywords: q.keywords,
        concepts: q.concepts || [],
        audio_file: q.audio_file || null,
        topic: q.topic || 'General Topic'
      })),
      current_index: 0,
      total_questions: bank.questions.length,
      total_viva_marks: bank.totalMarks,
      start_time: Date.now() / 1000,
      total_time_limit_sec: bank.timeLimitSec,
      elapsed_time_sec: 0.0,
      sub_state: 'WAITING_FOR_ANSWER',
      pending_transcript: null,
      last_command: null,
      jump_target_index: null,
      answers_map: {},
      session_status: 'IN_PROGRESS',
    };

    const session = await Session.create({
      studentInfo: { rollNo, name },
      questionBankId: bank._id,
      examRoomId: room._id,
      teacherId: room.teacherId,
      vivaState: initialState,
      status: 'IN_PROGRESS',
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('teacher_live_update', {
        type: 'SESSION_STARTED',
        sessionId: session._id,
        roomCode,
        studentInfo: session.studentInfo,
        status: session.status
      });
    }

    const currentQ = bank.questions[0];

    res.status(201).json({
      success: true,
      data: {
        sessionId: session._id,
        studentInfo: session.studentInfo,
        currentQuestion: {
          index: 0,
          total: bank.questions.length,
          question: currentQ.question,
          id: currentQ.id,
          audio_file: currentQ.audio_file || null,
          topic: currentQ.topic || 'General Topic'
        },
        syllabusId: bank.syllabusId,
        totalMarks: bank.totalMarks,
        timeLimitSec: bank.timeLimitSec,
        status: 'IN_PROGRESS',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).populate('questionBankId');
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const state = session.vivaState;
    const currentQ = state.question_bank[state.current_index];

    const qbQuestion = session.questionBankId?.questions?.find(q => q.id === currentQ?.id);
    const actualAudio = qbQuestion?.audio_file || currentQ?.audio_file || null;

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        studentInfo: session.studentInfo,
        currentQuestion: {
          index: state.current_index,
          total: state.total_questions,
          question: currentQ?.question || null,
          id: currentQ?.id || null,
          audio_file: actualAudio,
          topic: currentQ?.topic || 'General Topic'
        },
        syllabusId: session.questionBankId?.syllabusId,
        subState: state.sub_state,
        pendingTranscript: state.pending_transcript,
        answersMap: state.answers_map,
        elapsedTime: state.elapsed_time_sec,
        timeLimitSec: state.total_time_limit_sec,
        status: state.session_status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const submitAction = async (req, res) => {
  try {
    const { command, transcript, jumpIndex } = req.body;
    const session = await Session.findById(req.params.id).populate('questionBankId');

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.status !== 'IN_PROGRESS') {
      return res.status(400).json({ success: false, error: 'Session is already completed' });
    }

    if (!command) {
      return res.status(400).json({ success: false, error: 'command is required' });
    }

    let vivaState = { ...session.vivaState };
    vivaState.last_command = command;

    if (command === 'SUBMIT_AUDIO' && transcript !== undefined) {
      vivaState.pending_transcript = transcript;
    }
    if (command === 'JUMP' && jumpIndex !== undefined) {
      vivaState.jump_target_index = jumpIndex;
    }

    const updatedState = await processVivaAction(vivaState);

    // Save/Update Answers to MongoDB StudentAnswer collection
    if (updatedState.answers_map) {
      const answersArray = [];
      for (const [idxStr, answerData] of Object.entries(updatedState.answers_map)) {
        const qIndex = parseInt(idxStr, 10);
        const qData = updatedState.question_bank[qIndex];
        if (qData && answerData.status === 'ANSWERED') {
          answersArray.push({
            questionId: qData.id,
            questionText: qData.question,
            transcript: answerData.transcript || '',
            score: answerData.score || 0,
            maxMarks: answerData.max_marks || 0,
            feedback: answerData.feedback || '',
            matchedConcepts: answerData.matched_concepts || [],
            isAnswered: true
          });
        }
      }

      if (answersArray.length > 0) {
        await StudentAnswer.findOneAndUpdate(
          { sessionId: session._id },
          {
            examRoomId: session.examRoomId,
            teacherId: session.teacherId,
            studentInfo: session.studentInfo,
            answers: answersArray
          },
          { upsert: true, new: true }
        );
      }
    }

    session.vivaState = updatedState;
    if (updatedState.session_status === 'COMPLETED' || updatedState.session_status === 'TIME_EXPIRED') {
      session.status = updatedState.session_status;
    }
    session.markModified('vivaState');
    await session.save();

    const currentQ = updatedState.question_bank[updatedState.current_index];

    const qbQuestion = session.questionBankId?.questions?.find(q => q.id === currentQ?.id);
    const actualAudio = qbQuestion?.audio_file || currentQ?.audio_file || null;

    const responseData = {
      sessionId: session._id,
      currentQuestion: {
        index: updatedState.current_index,
        total: updatedState.total_questions,
        question: currentQ?.question || null,
        id: currentQ?.id || null,
        audio_file: actualAudio,
        topic: currentQ?.topic || 'General Topic'
      },
      syllabusId: session.questionBankId?.syllabusId,
      subState: updatedState.sub_state,
      pendingTranscript: updatedState.pending_transcript,
      answersMap: updatedState.answers_map,
      elapsedTime: updatedState.elapsed_time_sec,
      timeLimitSec: updatedState.total_time_limit_sec,
      status: updatedState.session_status,
      studentInfo: session.studentInfo
    };

    const lastIdx = command === 'NEXT' ? updatedState.current_index - 1 : updatedState.current_index;
    if (command === 'NEXT' && updatedState.answers_map[lastIdx]) {
      responseData.lastEvaluation = updatedState.answers_map[lastIdx];
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('teacher_live_update', {
        type: 'SESSION_UPDATED',
        sessionId: session._id,
        sessionData: responseData
      });
    }

    res.json({ success: true, data: responseData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const completeSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const state = session.vivaState;
    const answersMap = state.answers_map || {};
    const totalMarks = state.total_viva_marks || 15.0;

    const sessionData = {
      student_info: {
        roll_no: session.studentInfo.rollNo,
        name: session.studentInfo.name,
      },
      viva_state: session.vivaState,
      proctoring_logs: {
        cheating_probability: session.proctoringLogs?.cheatingProbability || 0,
        proctoring_status: session.proctoringLogs?.proctoringStatus || 'CLEAN',
        flags: session.proctoringLogs?.flags || [],
      },
    };

    const individualReport = await getIndividualReport(sessionData);

    const scorePercentage = individualReport.score_percentage || 0;
    const finalGrade = individualReport.final_grade || 'F';
    const gradePoint = individualReport.grade_point || 0.0;

    // Parse totalScore from "marks_obtained" (e.g., "13.5 / 15.0")
    const marksObtainedStr = individualReport.marks_obtained || "0";
    const totalScore = parseFloat(marksObtainedStr.split(" / ")[0]) || 0;

    session.status = 'COMPLETED';
    session.vivaState.session_status = 'COMPLETED';
    session.totalScore = totalScore;
    session.scorePercentage = scorePercentage;
    session.finalGrade = finalGrade;
    session.gradePoint = gradePoint;
    session.markModified('vivaState');
    await session.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('teacher_live_update', {
        type: 'SESSION_COMPLETED',
        sessionId: session._id,
        finalGrade,
        totalScore,
        scorePercentage,
        studentInfo: session.studentInfo,
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        studentInfo: session.studentInfo,
        totalScore: `${totalScore} / ${totalMarks}`,
        scorePercentage,
        finalGrade,
        gradePoint,
        answersMap,
        status: 'COMPLETED',
        currentQuestion: { total: state.total_questions },
        elapsedTime: state.elapsed_time_sec,
        timeLimitSec: state.total_time_limit_sec,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
