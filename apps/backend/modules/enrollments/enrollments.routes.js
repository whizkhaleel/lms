'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./enrollments.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

// ── Student ───────────────────────────────────
router.post('/enroll',                          controller.enroll);
router.get ('/my',                              controller.myEnrollments);

// ── Admin — enrollments ───────────────────────
router.get   ('/',                              authorize('admin'), controller.listEnrollments);
router.post  ('/manual',                        authorize('admin'), controller.manualEnroll);
router.patch ('/:enrollmentId/revoke',          authorize('admin'), controller.revokeEnrollment);

// ── Instructor / Admin ────────────────────────
router.get('/course/:courseId', authorize('instructor','admin'), controller.courseEnrollments);

// ── Admin — manual payment records ───────────
router.get   ('/payments',                      authorize('admin'), controller.listPayments);
router.post  ('/payments',                      authorize('admin'), controller.recordPayment);
router.patch ('/payments/:paymentId/confirm',   authorize('admin'), controller.confirmPayment);
router.patch ('/payments/:paymentId/reject',    authorize('admin'), controller.rejectPayment);

// ── Admin — external payment gateway ─────────
router.get   ('/payments/gateway',                       authorize('admin'), controller.listGatewayPayments);
router.patch ('/payments/gateway/:paymentId/approve',    authorize('admin'), controller.approveGatewayPayment);
router.patch ('/payments/gateway/:paymentId/reject',     authorize('admin'), controller.rejectGatewayPayment);

module.exports = router;