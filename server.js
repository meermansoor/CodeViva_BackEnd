/**
 * Viva Examination System - Express Backend Server
 * Connects to MongoDB, exposes REST API + WebSocket for live audio
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { config } from './config/index.js';
import vivaRoutes from './routes/vivaRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { setupAudioSocket } from './socket/audioHandler.js';
import { checkBridgeHealth } from './services/pythonBridge.js';

const app = express();
const server = createServer(app);
const io = new SocketIO(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB for audio chunks
});

app.set('io', io);

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/api/audio/file', express.static(path.resolve('./uploads/audio')));
app.use(express.static(path.resolve('./testing')));

// ----------------------------------------------------------------
// REST Routes
// ----------------------------------------------------------------
// Root endpoint
app.get('/', (req, res) => {
  res.send('Welcome to the CodeViva BackEnd');
});

app.use('/api/auth', authRoutes);
app.use('/api/viva', vivaRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/questions', questionRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const bridgeStatus = await checkBridgeHealth();
  res.json({
    status: 'ok',
    service: 'viva-express-backend',
    port: config.port,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    pythonBridge: bridgeStatus,
  });
});

// ----------------------------------------------------------------
// WebSocket for live audio
// ----------------------------------------------------------------
setupAudioSocket(io);

// ----------------------------------------------------------------
// MongoDB + Server Startup
// ----------------------------------------------------------------
async function start() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log(`MongoDB connected: ${config.mongoUri}`);

    server.listen(config.port, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log('  VIVA EXAMINATION SYSTEM - EXPRESS BACKEND');
      console.log('='.repeat(60));
      console.log(`  REST API:        http://localhost:${config.port}`);
      console.log(`  WebSocket:       ws://localhost:${config.port}`);
      console.log(`  Python Bridge:   ${config.pythonBridgeUrl}`);
      console.log(`  MongoDB:         ${config.mongoUri}`);
      console.log('');
      console.log('  Endpoints:');
      console.log('    GET  /                              - Welcome message');
      console.log('    POST /api/questions                 - Create question bank');
      console.log('    GET  /api/questions                 - List question banks');
      console.log('    POST /api/viva/session/start        - Start student viva');
      console.log('    POST /api/viva/session/:id/action   - Submit action');
      console.log('    POST /api/viva/session/:id/complete - Finalize session');
      console.log('    GET  /api/teacher/dashboard         - Class analytics');
      console.log('    GET  /api/teacher/export/excel      - Download Excel');
      console.log('    GET  /api/health                    - System health');
      console.log('='.repeat(60));
      console.log('');
    });

    // Check Python bridge connectivity
    const bridgeStatus = await checkBridgeHealth();
    if (bridgeStatus.connected) {
      console.log('[Python Bridge] Connected successfully');
    } else {
      console.warn('[Python Bridge] WARNING - Not reachable. Start it with:');
      console.warn('  cd python_bridge && python bridge_server.py');
    }
  } catch (err) {
    console.error('Startup failed:', err.message);
    process.exit(1);
  }
}

start();
