import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

const RAG_SERVER_URL = config.ragServerUrl;

export async function processSyllabusAndGenerateQuestions(fileBuffer, originalName, courseName, courseCode, count = 5) {
  // Step 1: Upload Syllabus
  const form = new FormData();
  form.append('file', fileBuffer, originalName);
  form.append('course_name', courseName);
  form.append('course_code', courseCode);

  const uploadRes = await axios.post(`${RAG_SERVER_URL}/api/syllabus/upload`, form, {
    headers: form.getHeaders(),
  });

  const syllabusId = uploadRes.data.syllabus_id;

  // Step 2: Generate Questions using the syllabus_id
  const generateRes = await axios.post(`${RAG_SERVER_URL}/api/questions/generate`, {
    syllabus_id: syllabusId,
    course_name: courseName,
    count: count
  });

  const responseData = generateRes.data;

  // Step 3: Fetch and save audio files locally
  const audioDir = path.resolve('./uploads/audio', syllabusId);
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  if (responseData.questions && Array.isArray(responseData.questions)) {
    for (const q of responseData.questions) {
      if (q.audio_file) {
        try {
          const audioUrl = `${RAG_SERVER_URL}/api/audio/file/${syllabusId}/${q.audio_file}`;
          const audioRes = await axios({
            method: 'GET',
            url: audioUrl,
            responseType: 'stream',
          });

          const filePath = path.join(audioDir, q.audio_file);
          const writer = fs.createWriteStream(filePath);

          audioRes.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          console.log(`[RAG Service] Downloaded audio file to ${filePath}`);
        } catch (err) {
          console.error(`[RAG Service] Failed to download audio file ${q.audio_file}:`, err.message);
        }
      }
    }
  }

  return { ...responseData, syllabus_id: syllabusId };
}
