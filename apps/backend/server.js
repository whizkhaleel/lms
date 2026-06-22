'use strict';

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const { Server }   = require('socket.io');

const env           = require('./config/env');
const db            = require('./config/db');
const redisClient   = require('./config/redis');
const errorHandler  = require('./shared/middleware/errorHandler');
const requestLogger = require('./shared/middleware/requestLogger');
const eventBus      = require('./shared/events/eventBus');

// ── Route imports ─────────────────────────────
const authRoutes        = require('./modules/auth/auth.routes');
const userRoutes        = require('./modules/users/users.routes');
const fileRoutes        = require('./modules/files/files.routes');
const courseRoutes      = require('./modules/courses/courses.routes');
const lessonRoutes      = require('./modules/lessons/lessons.routes');
const enrollmentRoutes  = require('./modules/enrollments/enrollments.routes');
const progressRoutes    = require('./modules/progress/progress.routes');
const assessmentRoutes  = require('./modules/assessments/assessments.routes');
const submissionRoutes  = require('./modules/submissions/submissions.routes');
const forumRoutes       = require('./modules/forums/forums.routes');
const messageRoutes     = require('./modules/messages/messages.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');
const paymentWebhookRoutes = require('./modules/enrollments/payment-webhook.routes');

const app    = express();
const server = http.createServer(app);

// Trust the nginx reverse proxy (needed for rate-limiter IP detection)
app.set('trust proxy', 1);

// ── Socket.io ─────────────────────────────────
const io = new Server(server, {
  cors: { origin: env.APP_URL, methods: ['GET', 'POST'] },
  // Ping every 25s — detects dead connections
  pingInterval: 25000,
  pingTimeout:  10000,
});
app.set('io', io);

// ── Raw body for payment gateway webhook signature verification ──
// Must be registered BEFORE express.json() — this route needs the
// untouched raw bytes to verify the HMAC signature.
app.use('/api/v1/payments/webhook', express.raw({ type: '*/*', limit: '2mb' }));

// ── Global Middleware ─────────────────────────
app.use(helmet());
app.use(cors({ origin: env.APP_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use(requestLogger);

// ── Health Check ──────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redisClient.ping();
    res.json({
      status:    'ok',
      timestamp: new Date().toISOString(),
      services:  { database: 'up', redis: 'up' },
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ── API Routes ────────────────────────────────
app.use('/api/v1/auth',                        authRoutes);
app.use('/api/v1/users',                       userRoutes);
app.use('/api/v1/files',                       fileRoutes);
app.use('/api/v1/courses',                     courseRoutes);
app.use('/api/v1/courses/:courseId/lessons',   lessonRoutes);
app.use('/api/v1/courses/:courseId/forums',    forumRoutes);   // ← Phase 6
app.use('/api/v1/enrollments',                 enrollmentRoutes);
app.use('/api/v1/progress',                    progressRoutes);
app.use('/api/v1/assessments',                 assessmentRoutes);
app.use('/api/v1/submissions',                 submissionRoutes);
app.use('/api/v1/messages',                    messageRoutes);        // ← Phase 6
app.use('/api/v1/notifications',               notificationRoutes);   // ← Phase 6
app.use('/api/v1/payments/webhook',             paymentWebhookRoutes); // ← External payment gateway

// ── 404 ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Global error handler ──────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────────
//  SOCKET.IO — Room Management
//
//  Rooms used:
//    user_{userId}               → personal notifications, DM badge
//    course_{courseId}_instructors → new submission alerts
//    dm_{conversationId}         → real-time DM messages
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Client joins their personal room on login
  socket.on('join_user', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`[Socket] user_${userId} joined personal room`);
  });

  // Instructor joins their course room (for submission alerts)
  socket.on('join_course', ({ courseId }) => {
    socket.join(`course_${courseId}_instructors`);
    console.log(`[Socket] Joined course_${courseId}_instructors`);
  });

  // Both parties join a DM conversation room
  socket.on('join_dm', ({ conversationId }) => {
    socket.join(`dm_${conversationId}`);
    console.log(`[Socket] Joined dm_${conversationId}`);
  });

  socket.on('leave_dm', ({ conversationId }) => {
    socket.leave(`dm_${conversationId}`);
  });

  // Typing indicator for DMs
  socket.on('dm_typing', ({ conversationId, userId, isTyping }) => {
    socket.to(`dm_${conversationId}`).emit('dm_typing', { userId, isTyping });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ─────────────────────────────────────────────
//  EVENT BUS LISTENERS
// ─────────────────────────────────────────────
const { notify } = require('./modules/notifications/notifications.service');

// Phase 3 — progress
eventBus.on('lesson.completed', ({ userId, lessonId, courseId }) => {
  io.to(`user_${userId}`).emit('lesson_completed', { lessonId, courseId });
});

eventBus.on('course.completed', async ({ userId, courseId }) => {
  io.to(`user_${userId}`).emit('course_completed', { courseId });
  // Fetch course title for notification
  try {
    const { rows } = await db.query('SELECT title FROM courses WHERE id=$1', [courseId]);
    await notify(io, {
      userId,
      type:  'certificate_issued',
      title: '🎉 Course Completed!',
      body:  `You have completed "${rows[0]?.title}". Your certificate is being generated.`,
      data:  { courseId },
    });
  } catch (err) {
    console.error('[Events] course.completed notify error:', err.message);
  }
});

eventBus.on('enrollment.created', async ({ userId, courseId }) => {
  try {
    await redisClient.del(`dashboard_${userId}`);
    const { rows } = await db.query('SELECT title FROM courses WHERE id=$1', [courseId]);
    await notify(io, {
      userId,
      type:  'enrollment',
      title: 'Successfully Enrolled!',
      body:  `You are now enrolled in "${rows[0]?.title}". Start learning!`,
      data:  { courseId },
    });
  } catch (err) {
    console.error('[Events] enrollment.created notify error:', err.message);
  }
});

// Phase 4 — assessments
eventBus.on('quiz.submitted', async ({ userId, courseId, passed, scorePct }) => {
  io.to(`user_${userId}`).emit('quiz_result', { courseId, passed, scorePct });
  try {
    await notify(io, {
      userId,
      type:  'quiz_graded',
      title: passed ? '✅ Quiz Passed!' : '❌ Quiz Failed',
      body:  `You scored ${scorePct}%. ${passed ? 'Well done!' : 'Review the material and try again.'}`,
      data:  { courseId, passed, scorePct },
    });
  } catch (err) {
    console.error('[Events] quiz.submitted notify error:', err.message);
  }
});

eventBus.on('assignment.submitted', ({ userId, submissionId, courseId }) => {
  io.to(`course_${courseId}_instructors`).emit('submission_pending', { submissionId, userId });
});

eventBus.on('assignment.graded', async ({ userId, submissionId, score, passed }) => {
  io.to(`user_${userId}`).emit('assignment_graded', { submissionId, score, passed });
  try {
    await notify(io, {
      userId,
      type:  'assignment_graded',
      title: 'Assignment Graded',
      body:  `Your assignment has been graded. Score: ${score}. ${passed ? 'Passed ✅' : 'Not passed ❌'}`,
      data:  { submissionId, score, passed },
    });
  } catch (err) {
    console.error('[Events] assignment.graded notify error:', err.message);
  }
});

// Phase 6 — enrollment revoked
eventBus.on('enrollment.revoked', async ({ userId, courseId }) => {
  try {
    const { rows } = await db.query('SELECT title FROM courses WHERE id=$1', [courseId]);
    await notify(io, {
      userId,
      type:  'system',
      title: 'Enrollment Revoked',
      body:  `Your access to "${rows[0]?.title}" has been revoked. Contact the administrator for details.`,
      data:  { courseId },
    });
  } catch (err) {
    console.error('[Events] enrollment.revoked notify error:', err.message);
  }
});

// ── Auth emails (verification + password reset) ──
const { sendMail } = require('./shared/mailer/mailer');
const { verifyEmailEmail, passwordResetEmail } = require('./shared/mailer/templates');

eventBus.on('user.registered', async ({ email, firstName, verificationToken }) => {
  try {
    const verificationUrl = `${env.APP_URL}/verify-email?token=${verificationToken}`;
    await sendMail({
      to:      email,
      subject: 'Verify your email address',
      html:    verifyEmailEmail({ firstName, verificationUrl }),
    });
  } catch (err) {
    console.error('[Events] user.registered email error:', err.message);
  }
});

eventBus.on('user.forgot_password', async ({ email, firstName, resetToken }) => {
  try {
    const resetUrl = `${env.APP_URL}/reset-password?token=${resetToken}`;
    await sendMail({
      to:      email,
      subject: 'Reset your password',
      html:    passwordResetEmail({ firstName, resetUrl }),
    });
  } catch (err) {
    console.error('[Events] user.forgot_password email error:', err.message);
  }
});

// ── Connect DB and Redis before accepting traffic ────
(async () => {
  try {
    await db.checkConnection();
    await redisClient.connectWithRetry();

    const { verifyConnection } = require('./shared/mailer/mailer');
    verifyConnection(); // non-fatal — logs a warning if SMTP isn't reachable

    const PORT = env.BACKEND_PORT || 5000;
    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════╗
║       LMS Backend — Running          ║
║  Port    : ${PORT}                       ║
║  Env     : ${env.NODE_ENV}            ║
║  DB      : ${env.POSTGRES_DB}          ║
╚══════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err.message);
    process.exit(1);
  }
})();

// ── Graceful shutdown ─────────────────────────
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM — shutting down gracefully');
  server.close(async () => {
    await db.end();
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  });
});

module.exports = { app, io };