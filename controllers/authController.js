import jwt from 'jsonwebtoken';
import Teacher from '../models/Teacher.js';
import { config } from '../config/index.js';
import { sendEmail } from '../utils/mailer.js';
import { getAccountCreationEmail } from '../utils/emailTemplates.js';

const JWT_SECRET = config.jwtSecret || 'supersecretviva2026';

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await Teacher.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    
    const teacher = await Teacher.create({ name, email, password });
    const token = jwt.sign({ id: teacher._id }, JWT_SECRET, { expiresIn: '7d' });
    
    // Send Welcome Email asynchronously
    sendEmail(
      teacher.email,
      'Welcome to CodeViva!',
      getAccountCreationEmail(teacher.name)
    );
    
    res.status(201).json({ success: true, token, teacher: { id: teacher._id, name: teacher.name, email: teacher.email } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const isMatch = await teacher.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: teacher._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, teacher: { id: teacher._id, name: teacher.name, email: teacher.email } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
