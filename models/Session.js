import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  // Student Information
  studentInfo: {
    rollNo: { type: String, required: true },
    name: { type: String, required: true },
  },

  // Reference to question bank used
  questionBankId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank' },

  // Reference to exam room and teacher
  examRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamRoom' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },

  // Full LangGraph VivaState (stored as flexible Mixed type)
  vivaState: { type: mongoose.Schema.Types.Mixed, required: true },

  // Proctoring / Integrity Logs
  proctoringLogs: {
    cheatingProbability: { type: Number, default: 0 },
    proctoringStatus: { type: String, default: 'CLEAN' },
    flags: [{ type: String }],
  },

  // Session Status
  status: {
    type: String,
    enum: ['IN_PROGRESS', 'COMPLETED', 'TIME_EXPIRED'],
    default: 'IN_PROGRESS',
  },

  // Final Results (populated on completion)
  finalGrade: { type: String },
  gradePoint: { type: Number },
  totalScore: { type: Number },
  scorePercentage: { type: Number },

}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);
