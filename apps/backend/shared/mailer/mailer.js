'use strict';

const nodemailer = require('nodemailer');
const env        = require('../../config/env');

// ─────────────────────────────────────────────
//  MAILER
//
//  Single shared transport. Gmail SMTP works with
//  an "App Password" (not the regular Gmail password) —
//  SMTP_USER = the Gmail address
//  SMTP_PASS = the 16-character App Password
//  SMTP_HOST = smtp.gmail.com, SMTP_PORT = 587
// ─────────────────────────────────────────────

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn('[Mailer] SMTP not fully configured — emails will fail to send');
  }

  transporter = nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for port 465, false for 587 (STARTTLS)
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email. Throws on failure — caller decides how to handle
 * (e.g. retry via queue, or surface to admin).
 */
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  const info = await t.sendMail({
    from:    env.EMAIL_FROM,
    to,
    subject,
    html,
    text: text || stripHtml(html),
  });
  console.log(`[Mailer] Sent "${subject}" to ${to} — messageId: ${info.messageId}`);
  return info;
}

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Verify SMTP connection on startup (optional, non-fatal). */
async function verifyConnection() {
  try {
    await getTransporter().verify();
    console.log('[Mailer] SMTP connection verified');
  } catch (err) {
    console.warn('[Mailer] SMTP verification failed:', err.message);
  }
}

module.exports = { sendMail, verifyConnection };