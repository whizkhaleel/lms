'use strict';

const env = require('../../config/env');

// ─────────────────────────────────────────────
//  EMAIL TEMPLATES
//  Plain inline-styled HTML — works reliably across
//  Gmail, Outlook, and most clients without a build step.
// ─────────────────────────────────────────────

const wrapper = (innerHtml) => `
<div style="font-family: Arial, sans-serif; background:#0D1B2A; padding:32px 16px;">
  <div style="max-width:480px; margin:0 auto; background:#112236; border-radius:16px;
              border:1px solid rgba(59,158,232,0.2); overflow:hidden;">
    <div style="background:#1A6FBF; padding:24px 32px;">
      <h1 style="color:#fff; font-size:20px; margin:0; font-weight:700;">
        ${env.APP_NAME || 'LMS Platform'}
      </h1>
    </div>
    <div style="padding:32px; color:#E2EBF5;">
      ${innerHtml}
    </div>
    <div style="padding:20px 32px; border-top:1px solid rgba(59,158,232,0.15);">
      <p style="color:#7A9BBF; font-size:12px; margin:0;">
        This is an automated message from ${env.APP_NAME || 'LMS Platform'}.
        Please do not reply directly to this email.
      </p>
    </div>
  </div>
</div>`;

/**
 * Sent when a student's payment is approved and their
 * account is auto-created.
 */
function welcomeCredentialsEmail({ firstName, email, tempPassword, courseTitle }) {
  const loginUrl = `${env.APP_URL}/login`;
  return wrapper(`
    <p style="font-size:15px; line-height:1.6;">Hi ${firstName},</p>
    <p style="font-size:15px; line-height:1.6;">
      Your payment for <strong>${courseTitle}</strong> has been confirmed and your account
      has been created. You can now log in and start learning right away.
    </p>

    <div style="background:#0D1B2A; border-radius:12px; padding:20px; margin:24px 0;
                border:1px solid rgba(59,158,232,0.2);">
      <p style="margin:0 0 10px; font-size:12px; color:#7A9BBF; text-transform:uppercase; letter-spacing:1px;">
        Your Account Details
      </p>
      <p style="margin:0 0 6px; font-size:14px;">
        <strong style="color:#3B9EE8;">LMS Website:</strong> <a href="${env.APP_URL}" style="color:#E2EBF5; text-decoration:underline;">${env.APP_URL}</a>
      </p>
      <p style="margin:0 0 6px; font-size:14px;">
        <strong style="color:#3B9EE8;">Email:</strong> ${email}
      </p>
      <p style="margin:0; font-size:14px;">
        <strong style="color:#3B9EE8;">Temporary Password:</strong>
        <code style="background:#1e3a5f; padding:2px 8px; border-radius:6px; color:#fff;">${tempPassword}</code>
      </p>
    </div>

    <p style="font-size:13px; line-height:1.6; color:#FCD34D;">
      ⚠️ For security, you'll be asked to set a new password the first time you log in.
    </p>

    <div style="text-align:center; margin:28px 0 12px;">
      <a href="${loginUrl}"
         style="display:inline-block; background:#1A6FBF; color:#fff; text-decoration:none;
                padding:12px 32px; border-radius:10px; font-weight:600; font-size:14px;">
        Log In to Your Course
      </a>
    </div>
  `);
}

/**
 * Sent to an existing student when they're enrolled in an
 * additional paid course (no new account needed).
 */
function enrollmentConfirmedEmail({ firstName, courseTitle }) {
  const loginUrl = `${env.APP_URL}/login`;
  return wrapper(`
    <p style="font-size:15px; line-height:1.6;">Hi ${firstName},</p>
    <p style="font-size:15px; line-height:1.6;">
      Your payment has been confirmed and you've been enrolled in
      <strong>${courseTitle}</strong>. Log in with your existing account to start learning.
    </p>
    
    <div style="background:#0D1B2A; border-radius:12px; padding:20px; margin:24px 0;
                border:1px solid rgba(59,158,232,0.2);">
      <p style="margin:0; font-size:14px;">
        <strong style="color:#3B9EE8;">LMS Website:</strong> <a href="${env.APP_URL}" style="color:#E2EBF5; text-decoration:underline;">${env.APP_URL}</a>
      </p>
    </div>

    <div style="text-align:center; margin:28px 0 12px;">
      <a href="${loginUrl}"
         style="display:inline-block; background:#1A6FBF; color:#fff; text-decoration:none;
                padding:12px 32px; border-radius:10px; font-weight:600; font-size:14px;">
        Go to Your Course
      </a>
    </div>
  `);
}

/** Sent when a webhook payment is rejected. */
function paymentRejectedEmail({ firstName, courseTitle, reason }) {
  return wrapper(`
    <p style="font-size:15px; line-height:1.6;">Hi ${firstName || 'there'},</p>
    <p style="font-size:15px; line-height:1.6;">
      We were unable to verify your payment for <strong>${courseTitle}</strong>.
    </p>
    ${reason ? `<p style="font-size:14px; color:#FB7185;">Reason: ${reason}</p>` : ''}
    <p style="font-size:14px; line-height:1.6; color:#7A9BBF;">
      If you believe this is a mistake, please contact our support team with your
      payment reference for assistance.
    </p>
  `);
}

/** Sent on registration — confirms the email address. */
function verifyEmailEmail({ firstName, verificationUrl }) {
  return wrapper(`
    <p style="font-size:15px; line-height:1.6;">Hi ${firstName},</p>
    <p style="font-size:15px; line-height:1.6;">
      Thanks for signing up! Please verify your email address to activate your account.
    </p>
    <div style="text-align:center; margin:28px 0 12px;">
      <a href="${verificationUrl}"
         style="display:inline-block; background:#1A6FBF; color:#fff; text-decoration:none;
                padding:12px 32px; border-radius:10px; font-weight:600; font-size:14px;">
        Verify Email
      </a>
    </div>
    <p style="font-size:12px; color:#7A9BBF;">This link expires in 24 hours.</p>
  `);
}

/** Sent on "forgot password" request. */
function passwordResetEmail({ firstName, resetUrl }) {
  return wrapper(`
    <p style="font-size:15px; line-height:1.6;">Hi ${firstName},</p>
    <p style="font-size:15px; line-height:1.6;">
      We received a request to reset your password. Click below to choose a new one.
    </p>
    <div style="text-align:center; margin:28px 0 12px;">
      <a href="${resetUrl}"
         style="display:inline-block; background:#1A6FBF; color:#fff; text-decoration:none;
                padding:12px 32px; border-radius:10px; font-weight:600; font-size:14px;">
        Reset Password
      </a>
    </div>
    <p style="font-size:12px; color:#7A9BBF;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

module.exports = {
  welcomeCredentialsEmail,
  enrollmentConfirmedEmail,
  paymentRejectedEmail,
  verifyEmailEmail,
  passwordResetEmail,
};