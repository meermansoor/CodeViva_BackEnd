import { Router } from 'express';
import { authTeacher } from '../middleware/authMiddleware.js';
import {
  getDashboardData,
  getSessions,
  getSessionById,
  exportExcel,
  createExamRoom,
  getExamRooms,
  endExamRoom
} from '../controllers/teacherController.js';

const router = Router();
router.use(authTeacher); // Protect all teacher routes

router.get('/dashboard', getDashboardData);
router.get('/sessions', getSessions);
router.get('/session/:id', getSessionById);
router.get('/export/excel', exportExcel);
router.post('/exam-rooms', createExamRoom);
router.get('/exam-rooms', getExamRooms);
router.put('/exam-rooms/:id/end', endExamRoom);

export default router;
