'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./progress.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

// All progress routes require a logged-in user
router.use(authenticate);

// ── Student — dashboard ───────────────────────
router.get('/dashboard', controller.getDashboard);

// ── Student — course progress ─────────────────
router.get('/courses/:courseId', controller.getCourseProgress);

// ── Student — lesson progress (resume position) ─
router.get('/lessons/:lessonId', controller.getLessonProgress);

// ── Video player heartbeat ────────────────────
// Player calls this every 10 seconds while video is playing
router.post('/heartbeat', controller.heartbeat);

// ── Manual lesson completion ──────────────────
router.post('/lessons/:lessonId/complete',   controller.markComplete);
router.post('/lessons/:lessonId/incomplete', controller.markIncomplete);

// ── Video bookmarks ───────────────────────────
router.post ('/lessons/:lessonId/bookmarks',              controller.addBookmark);
router.get  ('/lessons/:lessonId/bookmarks',              controller.getBookmarks);
router.delete('/lessons/:lessonId/bookmarks/:bookmarkId', controller.deleteBookmark);

// ── Instructor / Admin — course analytics ─────
router.get('/analytics/courses/:courseId',
  authorize('instructor', 'admin'),
  controller.getCourseAnalytics
);

module.exports = router;