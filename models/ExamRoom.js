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
}, { timestamps: true });

export default mongoose.model('ExamRoom', examRoomSchema);
