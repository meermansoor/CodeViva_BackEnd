import mongoose from 'mongoose';

const examRoomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  questionBankId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionBank',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },

  allowedStudents: [{
    rollNo: String,
    name: String,
    email: String
  }],
  courseDetails: {
    courseName: { type: String, default: '' },
    courseCode: { type: String, default: '' },
    department: { type: String, default: '' },
    batch: { type: String, default: '' },
    section: { type: String, default: '' },
    semester: { type: String, default: '' },
    academicYear: { type: String, default: '' },
  },
  timeLimitSec: {
    type: Number,
    default: 1800,
  },
  questionsPerStudent: {
    type: Number,
    default: 5,
  },
  totalMarks: {
    type: Number,
    default: 15.0,
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

export default mongoose.model('ExamRoom', examRoomSchema);
