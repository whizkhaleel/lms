'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./enrollments.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

// ── Telegram Integration (Unauthenticated) ──
router.post('/telegram-enroll', controller.telegramEnroll);

router.use(authenticate);

// ── Student ───────────────────────────────────
router.post('/enroll',                          controller.enroll);
router.get ('/my',                              controller.myEnrollments);

// ── Admin — enrollments ───────────────────────
router.get   ('/',                              authorize('admin'), controller.listEnrollments);
router.post  ('/manual',                        authorize('admin'), controller.manualEnroll);
router.patch ('/:enrollmentId/revoke',          authorize('admin'), controller.revokeEnrollment);

// ── Admin — pending external enrollments ──────
router.get   ('/pending',                       authorize('admin'), controller.listPending);
router.post  ('/pending/:paymentId/approve',    authorize('admin'), controller.approvePending);
router.post  ('/pending/:paymentId/reject',     authorize('admin'), controller.rejectPending);

// ── Instructor / Admin ────────────────────────
router.get('/course/:courseId', authorize('instructor','admin'), controller.courseEnrollments);

module.exports = router;
