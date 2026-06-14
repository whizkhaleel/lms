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
const authRoutes       = require('./modules/auth/auth.routes');
const userRoutes       = require('./modules/users/users.routes');
const fileRoutes       = require('./modules/files/files.routes');
const courseRoutes     = require('./modules/courses/courses.routes');
const lessonRoutes     = require('./modules/lessons/lessons.routes');
const enrollmentRoutes = require('./modules/enrollments/enrollments.routes');
const progressRoutes   = require('./modules/progress/progress.routes');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────
const io = new Server(server, {
  cors: { origin: env.APP_URL, methods: ['GET', 'POST'] }
});
app.set('io', io);

// ── Raw body for Stripe webhooks ──────────────
app.use('/api/v1/enrollments/webhook/stripe',
  express.raw({ type: 'application/json' }),
  (req, res, next) => { req.rawBody = req.body; next(); }
);

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
  socket.on('disconnect', () => {});
});

// ── Event listeners (Phase 3) ─────────────────
// lesson.completed → push real-time notification to student
eventBus.on('lesson.completed', ({ userId, lessonId, courseId }) => {
  io.to(`user_${userId}`).emit('lesson_completed', { lessonId, courseId });
});

// course.completed → push celebration notification + trigger certificate worker
eventBus.on('course.completed', ({ userId, courseId }) => {
  io.to(`user_${userId}`).emit('course_completed', { courseId });
  // Certificate worker picks this up via Redis queue (Phase 7)
  console.log(`[Events] Course completed — user:${userId} course:${courseId}`);
});

// enrollment.created → seed course_progress row for new student
eventBus.on('enrollment.created', async ({ userId, courseId }) => {
  try {
    // The DB trigger (init_course_progress) handles this automatically,
    // but we also cache it in Redis for fast dashboard loads
    await redisClient.del(`dashboard_${userId}`);
  } catch (err) {
    console.error('[EventBus] enrollment.created handler error:', err.message);
  }
});

// ── Start ─────────────────────────────────────
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

// ── Graceful shutdown ─────────────────────────
process.on('SIGTERM', async () => {
  server.close(async () => {
    await db.end();
    await redisClient.quit();
    process.exit(0);
  });
});

module.exports = { app, io };
