import { Router } from 'express';
import multer from 'multer';
import {
  getQuestionBanks,
  getQuestionBankById,
  createQuestionBank,
  generateQuestionBank,
  updateQuestionBank,
  deleteQuestionBank,
  getUpdatedQuestionsFromRag
} from '../controllers/questionController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', getQuestionBanks);
router.get('/syllabus/:syllabusId', getUpdatedQuestionsFromRag);
router.get('/:id', getQuestionBankById);
router.post('/', createQuestionBank);
router.post('/generate', upload.single('file'), generateQuestionBank);
router.put('/:id', updateQuestionBank);
router.delete('/:id', deleteQuestionBank);

export default router;
