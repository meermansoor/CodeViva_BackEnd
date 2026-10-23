import mongoose from 'mongoose';

const questionBankSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, default: '' },
  questions: [{
    id: { type: String, required: true },
    question: { type: String, required: true },
    keywords: [{ type: String }],
    concepts: [{ type: mongoose.Schema.Types.Mixed }],
    audio_file: { type: String, default: null },
    topic: { type: String, default: 'General' },
    difficulty: { type: String, default: 'medium' },
    model_answer: { type: String, default: '' },
    marks: { type: Number },
  }],
  totalMarks: { type: Number, default: 15.0 },
  timeLimitSec: { type: Number, default: 1800 },
  questionsPerStudent: { type: Number, default: 5 },
  syllabusId: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('QuestionBank', questionBankSchema);
