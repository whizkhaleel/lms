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

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────
const io = new Server(server, {
  cors: { origin: env.APP_URL, methods: ['GET', 'POST'] }
});
app.set('io', io);

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
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { database: 'up', redis: 'up' }
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});

// ── API Routes ────────────────────────────────
app.use('/api/v1/auth',                      authRoutes);
app.use('/api/v1/users',                     userRoutes);
app.use('/api/v1/files',                     fileRoutes);
app.use('/api/v1/courses',                   courseRoutes);
app.use('/api/v1/courses/:courseId/lessons', lessonRoutes);
app.use('/api/v1/enrollments',               enrollmentRoutes);
app.use('/api/v1/progress',                  progressRoutes);
app.use('/api/v1/assessments',               assessmentRoutes);
app.use('/api/v1/submissions',               submissionRoutes);

// ── 404 ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ── Error handler ─────────────────────────────
app.use(errorHandler);

// ── Socket.io ─────────────────────────────────
io.on('connection', (socket) => {
  socket.on('join_room', (userId) => socket.join(`user_${userId}`));
});

// ── Event listeners ───────────────────────────

// Phase 3 — progress
eventBus.on('lesson.completed', ({ userId, lessonId, courseId }) => {
  io.to(`user_${userId}`).emit('lesson_completed', { lessonId, courseId });
});
eventBus.on('course.completed', ({ userId, courseId }) => {
  io.to(`user_${userId}`).emit('course_completed', { courseId });
  console.log(`[Events] Course completed — user:${userId} course:${courseId}`);
});
eventBus.on('enrollment.created', async ({ userId }) => {
  try { await redisClient.del(`dashboard_${userId}`); } catch {}
});

// Phase 4 — assessments
eventBus.on('quiz.submitted', ({ userId, quizId, courseId, passed, scorePct }) => {
  io.to(`user_${userId}`).emit('quiz_result', { quizId, courseId, passed, scorePct });
  console.log(`[Events] Quiz submitted — user:${userId} score:${scorePct}% passed:${passed}`);
});
eventBus.on('assignment.submitted', ({ userId, submissionId, courseId }) => {
  // Notify instructors in the course that a submission is pending review
  io.to(`course_${courseId}_instructors`).emit('submission_pending', { submissionId, userId });
  console.log(`[Events] Assignment submitted — user:${userId}`);
});
eventBus.on('assignment.graded', ({ userId, submissionId, score, passed }) => {
  io.to(`user_${userId}`).emit('assignment_graded', { submissionId, score, passed });
  console.log(`[Events] Assignment graded — user:${userId} score:${score} passed:${passed}`);
});

// ── Start ─────────────────────────────────────
const PORT = env.BACKEND_PORT || 5000;

(async () => {
  try {
    await Promise.all([
      db.checkConnection(),
      redisClient.connectWithRetry(),
    ]);
  } catch (err) {
    console.error('[Startup] Failed to connect to services:', err.message);
    process.exit(1);
  }
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
})();

process.on('SIGTERM', async () => {
  server.close(async () => {
    try { await db.end(); } catch { /* ignore */ }
    try { if (redisClient.isOpen) await redisClient.quit(); } catch { /* ignore */ }
    process.exit(0);
  });
});

module.exports = { app, io };