import axios from 'axios';
import Session from '../models/Session.js';
import QuestionBank from '../models/QuestionBank.js';
import ExamRoom from '../models/ExamRoom.js';
import StudentAnswer from '../models/StudentAnswer.js';
import { processVivaAction, getIndividualReport } from '../services/pythonBridge.js';
import { config } from '../config/index.js';

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

    const timeLimitSec = room.timeLimitSec 
      || (room.settings?.duration ? parseInt(room.settings.duration, 10) * 60 : null) 
      || room.questionBankId?.timeLimitSec 
      || 1800;
    const timeLimitMinutes = Math.round(timeLimitSec / 60);

    const bankTotalQuestions = room.questionBankId?.questions?.length || 0;
    const configuredQuestions = room.questionsPerStudent 
      || (room.settings?.questionsPerStudent ? parseInt(room.settings.questionsPerStudent, 10) : null) 
      || room.questionBankId?.questionsPerStudent 
      || bankTotalQuestions;
    const totalQuestions = Math.min(configuredQuestions, bankTotalQuestions > 0 ? bankTotalQuestions : configuredQuestions);

    res.json({
      success: true,
      valid: true,
      studentName,
      courseName: room.courseDetails?.courseName || room.questionBankId?.title || "Unknown Course",
      totalQuestions: totalQuestions,
      totalMarks: room.totalMarks || (room.settings?.totalMarks ? parseFloat(room.settings.totalMarks) : null) || room.questionBankId?.totalMarks || 15.0,
      timeLimitMinutes: timeLimitMinutes,
      timeLimitSec: timeLimitSec,
      settings: room.settings || {}
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

    // Auto-sync missing keywords or model answers from RAG server if needed
    if (bank.syllabusId && bank.questions.some(q => (!q.keywords || q.keywords.length === 0) && (!q.concepts || q.concepts.length === 0))) {
      try {
        const ragUrl = config.ragServerUrl || 'http://192.168.10.95:8000';
        const ragRes = await axios.get(`${ragUrl}/api/questions/${bank.syllabusId}`, { timeout: 3500 });
        const ragQuestions = ragRes.data?.questions || [];
        if (ragQuestions.length > 0) {
          bank.questions = bank.questions.map(localQ => {
            const matched = ragQuestions.find(rq => rq.id === localQ.id);
            if (matched) {
              const kws = (matched.answer_keywords && matched.answer_keywords.length > 0)
                ? matched.answer_keywords
                : (matched.expected_keywords && matched.expected_keywords.length > 0 ? matched.expected_keywords : (localQ.keywords || []));
              return {
                ...localQ.toObject(),
                keywords: kws,
                concepts: matched.concepts || localQ.concepts || [],
                model_answer: matched.model_answer || localQ.model_answer || '',
                audio_file: matched.audio_file || localQ.audio_file
              };
            }
            return localQ;
          });
          await bank.save();
        }
      } catch (err) {
        console.warn('Could not auto-sync questions from RAG on startSession:', err.message);
      }
    }

    // Dynamic Time Limit in Seconds
    const timeLimitSec = room.timeLimitSec 
      || (room.settings?.duration ? parseInt(room.settings.duration, 10) * 60 : null) 
      || bank.timeLimitSec 
      || 1800;

    // Dynamic Questions Count per student
    const configuredQuestionsCount = room.questionsPerStudent 
      || (room.settings?.questionsPerStudent ? parseInt(room.settings.questionsPerStudent, 10) : null) 
      || bank.questionsPerStudent 
      || bank.questions.length;
    const limitQuestions = Math.min(configuredQuestionsCount, bank.questions.length);

    // Question Selection (with randomization if enabled)
    let selectedQuestions = [...bank.questions];
    const shouldRandomize = room.settings?.randomizeQuestions !== false;
    if (shouldRandomize && selectedQuestions.length > 1) {
      for (let i = selectedQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [selectedQuestions[i], selectedQuestions[j]] = [selectedQuestions[j], selectedQuestions[i]];
      }
    }

    if (limitQuestions > 0 && limitQuestions < selectedQuestions.length) {
      selectedQuestions = selectedQuestions.slice(0, limitQuestions);
    }

    // Dynamic Total Viva Marks
    const totalVivaMarks = room.totalMarks 
      || (room.settings?.totalMarks ? parseFloat(room.settings.totalMarks) : null) 
      || bank.totalMarks 
      || 15.0;

    const marksPerQuestion = selectedQuestions.length > 0 
      ? Math.round((totalVivaMarks / selectedQuestions.length) * 100) / 100 
      : 3.0;

    const initialState = {
      question_bank: selectedQuestions.map(q => ({
        id: q.id,
        question: q.question,
        marks: (q.marks !== undefined && q.marks !== null && q.marks > 0) ? q.marks : marksPerQuestion,
        expected_keywords: (q.keywords && q.keywords.length > 0) ? q.keywords : (q.answer_keywords || []),
        concepts: q.concepts || [],
        audio_file: q.audio_file || null,
        topic: q.topic || 'General Topic',
        model_answer: q.model_answer || ''
      })),
      current_index: 0,
      total_questions: selectedQuestions.length,
      total_viva_marks: totalVivaMarks,
      start_time: Date.now() / 1000,
      total_time_limit_sec: timeLimitSec,
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

    const currentQ = selectedQuestions[0];

    res.status(201).json({
      success: true,
      data: {
        sessionId: session._id,
        studentInfo: session.studentInfo,
        currentQuestion: {
          index: 0,
          total: selectedQuestions.length,
          question: currentQ.question,
          id: currentQ.id,
          audio_file: currentQ.audio_file || null,
          topic: currentQ.topic || 'General Topic'
        },
        syllabusId: bank.syllabusId,
        totalMarks: bank.totalMarks,
        timeLimitSec: timeLimitSec,
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
      let totalCurrentScore = 0;
      let totalMaxPossibleMarks = 0;
      let hasFlaggedReview = false;

      for (const [idxStr, answerData] of Object.entries(updatedState.answers_map)) {
        const qIndex = parseInt(idxStr, 10);
        const qData = updatedState.question_bank[qIndex];
        if (qData && answerData.status === 'ANSWERED') {
          totalCurrentScore += (answerData.score || 0);
          totalMaxPossibleMarks += (answerData.max_marks || 0);
          if (answerData.teacher_review_required) {
            hasFlaggedReview = true;
          }

          answersArray.push({
            questionId: qData.id,
            questionText: qData.question,
            transcript: answerData.transcript || '',
            score: answerData.score || 0,
            maxMarks: answerData.max_marks || 0,
            feedback: answerData.feedback || '',
            matchedConcepts: answerData.matched_concepts || answerData.evaluation_details?.matched_concepts || answerData.matched_keywords || [],
            missedConcepts: answerData.missed_concepts || answerData.evaluation_details?.missed_concepts || [],
            confidence: answerData.confidence ?? answerData.evaluation_details?.confidence ?? 1.0,
            teacherReviewRequired: Boolean(answerData.teacher_review_required ?? answerData.evaluation_details?.teacher_review_required),
            reviewReason: answerData.review_reason || answerData.evaluation_details?.review_reason || null,
            gradingRoute: answerData.grading_route || answerData.evaluation_details?.grading_route || 'automatic_grade',
            evaluationDetails: answerData.evaluation_details || null,
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

    let totalScoreSoFar = 0;
    let anyReviewFlag = false;
    if (updatedState.answers_map) {
      Object.values(updatedState.answers_map).forEach(ans => {
        totalScoreSoFar += (ans.score || 0);
        if (ans.teacher_review_required) anyReviewFlag = true;
      });
    }

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
      studentInfo: session.studentInfo,
      currentScore: Math.round(totalScoreSoFar * 100) / 100,
      hasFlaggedReview: anyReviewFlag
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
        sessionData: responseData,
        currentScore: Math.round(totalScoreSoFar * 100) / 100,
        hasFlaggedReview: anyReviewFlag,
        lastEvaluation: responseData.lastEvaluation || null
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
      session_id: session._id,
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
