export const getAccountCreationEmail = (name) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #2b6cb0;">Welcome to CodeViva, ${name}! 🎉</h2>
      <p>Your teacher account has been successfully created.</p>
      <p>You can now start creating exam rooms, generating AI question banks, and conducting live viva sessions for your students.</p>
      <p>Log in to your dashboard to get started.</p>
      <br />
      <p>Best regards,<br/>The CodeViva Team</p>
    </div>
  `;
};

export const getAccountVerificationEmail = (name, verificationLink) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #2b6cb0;">Verify Your CodeViva Account</h2>
      <p>Hi ${name},</p>
      <p>Thank you for signing up for CodeViva. Please verify your email address to complete your registration.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #3182ce; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
      </div>
      <p>If the button doesn't work, you can copy and paste the following link into your browser:</p>
      <p style="word-break: break-all; color: #718096;">${verificationLink}</p>
      <br />
      <p>Best regards,<br/>The CodeViva Team</p>
    </div>
  `;
};

export const getPasswordResetPinEmail = (name, pin) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #e53e3e;">CodeViva Password Reset</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Use the following 6-digit PIN to proceed:</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 15px 30px; background-color: #edf2f7; border-radius: 8px; color: #2d3748;">
          ${pin}
        </span>
      </div>
      <p>This PIN will expire in 15 minutes. If you did not request a password reset, please ignore this email.</p>
      <br />
      <p>Best regards,<br/>The CodeViva Team</p>
    </div>
  `;
};

export const getVivaInvitationEmail = (studentName, teacherName, roomCode, joinLink) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #2b6cb0;">CodeViva Session Invitation</h2>
      <p>Hi ${studentName},</p>
      <p>Your instructor, <strong>${teacherName}</strong>, has invited you to a live AI-proctored Viva session.</p>
      
      <div style="background-color: #edf2f7; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; color: #4a5568; font-size: 14px;">Your Room Code:</p>
        <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2d3748; display: block; margin-top: 5px;">
          ${roomCode}
        </span>
      </div>

      <p>You can join the session directly by clicking the button below:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${joinLink}" style="background-color: #3182ce; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Join Viva Session
        </a>
      </div>
      
      <p style="font-size: 12px; color: #718096; margin-top: 30px;">
        Make sure you are in a quiet room and your microphone is working before joining. Good luck!
      </p>
      <br />
      <p>Best regards,<br/>The CodeViva Team</p>
    </div>
  `;
};
