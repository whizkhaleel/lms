'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./enrollments.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

// Student — enroll in free course / initiate payment
router.post('/enroll',              controller.enroll);

// Student — my enrollments
router.get('/my',                   controller.myEnrollments);

// Stripe webhook (no auth — verified by Stripe signature)
router.post('/webhook/stripe',      controller.stripeWebhook);

// Admin — all enrollments
router.get('/',                     authorize('admin'), controller.listEnrollments);

// Admin — enroll a user manually (free override)
router.post('/manual',              authorize('admin'), controller.manualEnroll);

// Admin / Instructor — enrollments for a specific course
router.get('/course/:courseId',     authorize('instructor', 'admin'), controller.courseEnrollments);

// Admin — revoke enrollment
router.patch('/:enrollmentId/revoke', authorize('admin'), controller.revokeEnrollment);

module.exports = router;
