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
    isAnswered: Boolean
  }]
}, { timestamps: true });

export default mongoose.model('StudentAnswer', studentAnswerSchema);
