import { Router } from 'express';
import {
  checkRoom,
  startSession,
  getSession,
  submitAction,
  completeSession
} from '../controllers/vivaController.js';

const router = Router();

router.get('/room/:roomCode', checkRoom);
router.post('/session/start', startSession);
router.get('/session/:id', getSession);
router.post('/session/:id/action', submitAction);
router.post('/session/:id/complete', completeSession);

export default router;
