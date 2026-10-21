// Environment Configuration
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT,
  socketPort: process.env.SOCKET_PORT,
  ragServerUrl: process.env.RAG_SERVER_URL,
  mongoUri: process.env.MONGO_URI,
  pythonBridgeUrl: process.env.PYTHON_BRIDGE_URL,
  jwtSecret: process.env.JWT_SECRET,
  uploadDir: process.env.UPLOAD_DIR,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
};