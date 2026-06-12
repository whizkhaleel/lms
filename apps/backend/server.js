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

// ── Route imports ─────────────────────────────
// Phase 1
const authRoutes       = require('./modules/auth/auth.routes');
const userRoutes       = require('./modules/users/users.routes');
const fileRoutes       = require('./modules/files/files.routes');
// Phase 2
const courseRoutes     = require('./modules/courses/courses.routes');
const lessonRoutes     = require('./modules/lessons/lessons.routes');
const enrollmentRoutes = require('./modules/enrollments/enrollments.routes');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────
const io = new Server(server, {
  cors: { origin: env.APP_URL, methods: ['GET', 'POST'] }
});
app.set('io', io);

// ── Raw body for Stripe webhooks ──────────────
// Must be BEFORE express.json()
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
app.use('/api/v1/auth',        authRoutes);
app.use('/api/v1/users',       userRoutes);
app.use('/api/v1/files',       fileRoutes);
app.use('/api/v1/courses',     courseRoutes);
app.use('/api/v1/courses/:courseId/lessons', lessonRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);

// ── 404 handler ───────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ── Global error handler ──────────────────────
app.use(errorHandler);

// ── Socket.io ─────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('join_room', (userId) => {
    socket.join(`user_${userId}`);
  });
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Start server ──────────────────────────────
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
  console.log('[Server] SIGTERM received — shutting down gracefully');
  server.close(async () => {
    await db.end();
    await redisClient.quit();
    process.exit(0);
  });
});

module.exports = { app, io };
