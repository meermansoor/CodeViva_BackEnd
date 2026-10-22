// WebSocket Audio Handler
// Handles real-time audio streaming from browser MediaRecorder API

import fs from 'fs';
import path from 'path';
import { transcribeAudio } from '../services/pythonBridge.js';
import { config } from '../config/index.js';
import Session from '../models/Session.js';

export function setupAudioSocket(io) {
  // Ensure uploads directory exists
  const uploadDir = path.resolve(config.uploadDir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    let audioChunks = [];

    /**
     * Client starts recording
     */
    socket.on('audio:start', () => {
      audioChunks = [];
      console.log(`[Socket.IO] Recording started: ${socket.id}`);
    });

    /**
     * Client sends an audio chunk (binary data from MediaRecorder)
     */
    socket.on('audio:chunk', (chunk) => {
      audioChunks.push(Buffer.from(chunk));
    });

    /**
     * Client stops recording — process the audio
     * Payload: { sessionId }
     */
    socket.on('audio:stop', async (payload) => {
      const { sessionId } = payload || {};
      console.log(`[Socket.IO] Recording stopped: ${socket.id}, session: ${sessionId}`);

      if (audioChunks.length === 0) {
        socket.emit('audio:error', { error: 'No audio data received' });
        return;
      }

      // 1. Concatenate chunks into a single audio buffer
      const audioBuffer = Buffer.concat(audioChunks);
      audioChunks = []; // Reset for next recording

      // 2. Save to temp file
      const tempFilename = `audio_${sessionId || 'unknown'}_${Date.now()}.webm`;
      const tempPath = path.join(uploadDir, tempFilename);

      try {
        fs.writeFileSync(tempPath, audioBuffer);
        console.log(`[Socket.IO] Audio saved: ${tempPath} (${audioBuffer.length} bytes)`);

        // 3. Send to Python bridge for Whisper transcription
        const result = await transcribeAudio(tempPath);

        // 4. Emit transcript back to client for review
        socket.emit('audio:transcript', {
          text: result.text || '',
          is_authentic: result.is_authentic,
          auth_notes: result.auth_notes || '',
          sessionId,
        });

        console.log(`[Socket.IO] Transcript sent: "${result.text?.substring(0, 50)}..."`);
      } catch (err) {
        console.error(`[Socket.IO] Transcription error:`, err.message);
        socket.emit('audio:error', {
          error: 'Transcription failed: ' + err.message,
          sessionId,
        });
      } finally {
        // 5. Save audio locally instead of deleting it
        if (fs.existsSync(tempPath)) {
          // Create recordings folder if it doesn't exist
          const recordingsDir = path.resolve('./recordings');
          if (!fs.existsSync(recordingsDir)) {
            fs.mkdirSync(recordingsDir, { recursive: true });
          }
          
          // Move the file from uploads to recordings
          const permanentPath = path.join(recordingsDir, tempFilename);
          fs.renameSync(tempPath, permanentPath);
          console.log(`[Socket.IO] Audio permanently saved to: ${permanentPath}`);
        }
      }
    });

    /**
     * Client reports a proctoring violation (e.g. MediaPipe head movement, face absent, multiple faces)
     * Payload: { sessionId, type, label, durationMs, timestamp }
     */
    socket.on('proctor:violation', async (payload) => {
      const { sessionId, type, label } = payload || {};
      if (!sessionId) return;
      console.log(`[Socket.IO Proctor] Violation for session ${sessionId}: ${label} (${type})`);

      try {
        const session = await Session.findById(sessionId);
        if (!session) return;

        // Calculate increment based on severity
        const increment = type === 'OBJECT_DETECTED' ? 25 : type === 'MULTIPLE_FACES' ? 20 : type === 'GAZE_DEVIATION' ? 15 : type === 'FACE_ABSENT' ? 15 : 10;
        const currentProb = session.proctoringLogs?.cheatingProbability || 0;
        const newProb = Math.min(100, currentProb + increment);
        const newStatus = newProb >= 40 ? 'SUSPICIOUS' : 'CLEAN';

        const flagMsg = `[${new Date().toLocaleTimeString()}] ${label}`;

        if (!session.proctoringLogs) {
          session.proctoringLogs = { cheatingProbability: 0, proctoringStatus: 'CLEAN', flags: [] };
        }

        session.proctoringLogs.cheatingProbability = newProb;
        session.proctoringLogs.proctoringStatus = newStatus;
        session.proctoringLogs.flags.push(flagMsg);
        await session.save();

        // Broadcast real-time update to teacher live monitoring
        io.emit('teacher_live_update', {
          type: 'PROCTOR_ALERT',
          sessionId: session._id,
          cheatingProbability: newProb,
          flags: session.proctoringLogs.flags,
          studentInfo: session.studentInfo,
          violation: { type, label }
        });
      } catch (err) {
        console.error('[Socket.IO Proctor] Error updating proctoring logs:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      audioChunks = [];
    });
  });
}
