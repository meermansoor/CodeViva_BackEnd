// Python Bridge Service
// HTTP client that calls the FastAPI bridge wrapping the Python agents

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { config } from '../config/index.js';

const bridge = axios.create({
  baseURL: config.pythonBridgeUrl,
  timeout: 30000,
});

// Add an interceptor to extract the FastAPI error detail
bridge.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.data && error.response.data.detail) {
      error.message = error.response.data.detail; // Extract Python FastAPI detail string
    } else if (error.response && error.response.data && error.response.data.error) {
      error.message = error.response.data.error;
    }
    return Promise.reject(error);
  }
);

/**
 * Agent 1: Send audio file to Python Whisper for transcription + authenticity check
 */
export async function transcribeAudio(audioFilePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(audioFilePath));
  const { data } = await bridge.post('/api/transcribe', form, {
    headers: form.getHeaders(),
  });
  return data;
}

/**
 * Agent 2: Evaluate a student transcript against question keywords
 */
export async function evaluateAnswer(transcript, questionData, totalMarks = 15.0, totalQuestions = 5) {
  const { data } = await bridge.post('/api/evaluate', {
    transcript,
    question_data: questionData,
    total_viva_marks: totalMarks,
    total_questions: totalQuestions,
  });
  return data;
}

/**
 * Agent 3: Process a viva state transition through the LangGraph engine
 */
export async function processVivaAction(vivaState) {
  const { data } = await bridge.post('/api/viva/action', {
    state: vivaState,
  });
  return data;
}

/**
 * Agent 4: Get dashboard analytics from batch student records
 */
export async function getDashboard(batchRecords) {
  const { data } = await bridge.post('/api/report/dashboard', {
    batch_records: batchRecords,
  });
  return data;
}

/**
 * Agent 4: Get individual student grade sheet
 */
export async function getIndividualReport(sessionData) {
  const { data } = await bridge.post('/api/report/individual', {
    session_data: sessionData,
  });
  return data;
}

/**
 * Agent 4: Generate Excel report and return the buffer
 */
export async function generateExcel(batchRecords, filename = 'muet_viva_summary.xlsx') {
  const { data } = await bridge.post('/api/report/excel', {
    batch_records: batchRecords,
    filename,
  }, {
    responseType: 'arraybuffer',
  });
  return data;
}

/**
 * Health check for the Python bridge
 */
export async function checkBridgeHealth() {
  try {
    const { data } = await bridge.get('/api/health');
    return { connected: true, ...data };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
