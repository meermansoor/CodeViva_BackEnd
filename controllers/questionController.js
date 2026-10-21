import QuestionBank from '../models/QuestionBank.js';
import { processSyllabusAndGenerateQuestions } from '../services/ragService.js';

export const createQuestionBank = async (req, res) => {
  try {
    const { title, subject, questions, totalMarks, timeLimitSec } = req.body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'Title and at least one question are required' });
    }

    const formattedQuestions = questions.map(q => ({
      id: q.id,
      question: q.question || q.text,
      keywords: (q.expected_keywords && q.expected_keywords.length > 0) ? q.expected_keywords : (q.answer_keywords || q.keywords || []),
      concepts: q.concepts || [],
      audio_file: q.audio_file || null,
      topic: q.topic || 'General',
      difficulty: q.difficulty || 'medium',
      model_answer: q.model_answer || ''
    }));

    const bank = await QuestionBank.create({
      title,
      subject: subject || '',
      questions: formattedQuestions,
      totalMarks: totalMarks || 15.0,
      timeLimitSec: timeLimitSec || 600,
    });

    res.status(201).json({ success: true, data: bank });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const generateQuestionBank = async (req, res) => {
  try {
    const { title, subject, courseCode, numQuestions, totalMarks, timeLimitSec } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Syllabus file is required' });
    }

    const courseName = subject || title || 'Unknown Course';
    const code = courseCode || 'N/A';
    const count = parseInt(numQuestions) || 5;

    const ragResponse = await processSyllabusAndGenerateQuestions(
      req.file.buffer,
      req.file.originalname,
      courseName,
      code,
      count
    );

    const formattedQuestions = ragResponse.questions.map((q, index) => ({
      id: q.id || String(index + 1),
      question: q.question || q.text,
      keywords: (q.expected_keywords && q.expected_keywords.length > 0) ? q.expected_keywords : (q.answer_keywords || []),
      concepts: q.concepts || [],
      audio_file: q.audio_file || null,
      topic: q.topic || 'General',
      difficulty: q.difficulty || 'medium',
      model_answer: q.model_answer || ''
    }));

    const bank = await QuestionBank.create({
      title: title || `${courseName} - Auto Generated`,
      subject: subject || courseName,
      questions: formattedQuestions,
      totalMarks: totalMarks || 15.0,
      timeLimitSec: timeLimitSec || 600,
      syllabusId: ragResponse.syllabus_id || ''
    });

    res.status(201).json({ success: true, data: bank });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


export const getQuestionBanks = async (req, res) => {
  try {
    const banks = await QuestionBank.find().sort({ createdAt: -1 });
    res.json({ success: true, data: banks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getQuestionBankById = async (req, res) => {
  try {
    const bank = await QuestionBank.findById(req.params.id);
    if (!bank) return res.status(404).json({ success: false, error: 'Question bank not found' });
    res.json({ success: true, data: bank });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


export const updateQuestionBank = async (req, res) => {
  try {
    const bank = await QuestionBank.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!bank) return res.status(404).json({ success: false, error: 'Question bank not found' });
    res.json({ success: true, data: bank });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteQuestionBank = async (req, res) => {
  try {
    const bank = await QuestionBank.findByIdAndDelete(req.params.id);
    if (!bank) return res.status(404).json({ success: false, error: 'Question bank not found' });
    res.json({ success: true, message: 'Question bank deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const RAG_SERVER_URL = 'http://192.168.10.95:8000';

export const getUpdatedQuestionsFromRag = async (req, res) => {
  try {
    const { syllabusId } = req.params;

    // 1. Fetch updated questions from RAG server
    const response = await axios.get(`${RAG_SERVER_URL}/api/questions/${syllabusId}`);
    const ragQuestions = response.data.questions || [];

    // 2. Fetch missing audio files
    const audioDir = path.resolve('./uploads/audio', syllabusId);
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    for (const q of ragQuestions) {
      if (q.audio_file) {
        const filePath = path.join(audioDir, q.audio_file);
        if (!fs.existsSync(filePath)) {
          try {
            const audioUrl = `${RAG_SERVER_URL}/api/audio/file/${syllabusId}/${q.audio_file}`;
            const audioRes = await axios({
              method: 'GET',
              url: audioUrl,
              responseType: 'stream',
            });
            const writer = fs.createWriteStream(filePath);
            audioRes.data.pipe(writer);
            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });
            console.log(`[RAG Sync] Downloaded audio file to ${filePath}`);
          } catch (err) {
            console.error(`[RAG Sync] Failed to download audio file ${q.audio_file}:`, err.message);
          }
        }
      }
    }

    // 3. Update the local QuestionBank in MongoDB
    const bank = await QuestionBank.findOne({ syllabusId });
    if (bank) {
      const updatedQuestions = bank.questions.map(localQ => {
        const matched = ragQuestions.find(apiQ => apiQ.id === localQ.id);
        if (matched) {
          return {
            ...localQ.toObject(),
            audio_file: matched.audio_file,
            model_answer: matched.model_answer,
            keywords: (matched.expected_keywords && matched.expected_keywords.length > 0) ? matched.expected_keywords : (matched.answer_keywords || localQ.keywords || []),
            concepts: matched.concepts || localQ.concepts || [],
            topic: matched.topic || localQ.topic,
            difficulty: matched.difficulty || localQ.difficulty
          };
        }
        return localQ;
      });
      bank.questions = updatedQuestions;
      await bank.save();
    }

    res.json({ success: true, data: { questions: ragQuestions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

