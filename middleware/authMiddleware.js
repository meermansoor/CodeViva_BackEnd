import jwt from 'jsonwebtoken';
import Teacher from '../models/Teacher.js';
import { config } from '../config/index.js';

const JWT_SECRET = config.jwtSecret || 'supersecretviva2026';

export const authTeacher = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const teacher = await Teacher.findById(decoded.id).select('-password');
    if (!teacher) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    req.teacher = teacher;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Unauthorized: ' + err.message });
  }
};
