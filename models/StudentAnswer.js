import mongoose from 'mongoose';

const studentAnswerSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  examRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamRoom', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  studentInfo: {
    rollNo: { type: String, required: true },
    name: { type: String, required: true },
  },
  answers: [{
    questionId: String,
    questionText: String,
    transcript: String,
    score: Number,
    maxMarks: Number,
    feedback: String,
    matchedConcepts: [String],
    missedConcepts: [String],
    confidence: Number,
    teacherReviewRequired: Boolean,
    reviewReason: String,
    gradingRoute: String,
    evaluationDetails: mongoose.Schema.Types.Mixed,
    isAnswered: Boolean,
    isReviewed: { type: Boolean, default: false },
    teacherNotes: { type: String, default: '' }
  }]
}, { timestamps: true });

export default mongoose.model('StudentAnswer', studentAnswerSchema);
