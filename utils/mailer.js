import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.emailUser,
    pass: config.emailPass,
  },
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP Connection Error:", error);
  } else {
    console.log("✅ SMTP Server Connected! Ready to send emails.");
  }
});

export const sendEmail = async (to, subject, htmlContent) => {
  if (!config.emailUser || !config.emailPass) {
    console.warn("⚠️ SMTP Credentials missing! Ensure EMAIL_USER and EMAIL_PASS are set in .env");
    return false;
  }

  try {
    const mailOptions = {
      from: `"CodeViva System" <${config.emailUser}>`,
      to,
      subject,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
};
