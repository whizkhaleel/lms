'use strict';

const express      = require('express');
const multer       = require('multer');
const path         = require('path');
const router       = express.Router({ mergeParams: true }); // inherit :courseId

const controller   = require('./lessons.controller');
const availCon     = require('./availability.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const storage      = require('../../config/storage');

const upload = multer({
  dest: path.join(storage.lmsdataPath, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Routes order matters: more specific before generic ──

// Public preview (no auth)
router.get('/:lessonId/preview', controller.getPreview);

// ── All routes below require auth ──────────────
router.use(authenticate);

// Bulk availability (must be BEFORE /:lessonId to avoid conflict)
router.get('/availability', availCon.evaluateCourse);

// Availability / conditional access on a specific lesson
router.get('/:lessonId/availability/check', availCon.evaluateLesson);
router.get('/:lessonId/availability',       availCon.getAvailability);
router.put('/:lessonId/availability',
  authorize('instructor', 'admin'),
  availCon.setAvailability);

// Student — view lesson content (must be enrolled)
router.get('/:lessonId', controller.getLesson);

// Instructor / Admin — lesson CRUD
router.post('/',        authorize('instructor', 'admin'), controller.createLesson);
router.patch('/reorder', authorize('instructor', 'admin'), controller.reorderLessons);
router.patch('/:lessonId', authorize('instructor', 'admin'), controller.updateLesson);
router.delete('/:lessonId', authorize('instructor', 'admin'), controller.deleteLesson);

// Video upload
router.post('/:lessonId/video',
  authorize('instructor', 'admin'),
  upload.single('video'),
  controller.uploadVideo);

// Resource upload (PDF, docs)
router.post('/:lessonId/resources',
  authorize('instructor', 'admin'),
  upload.single('resource'),
  controller.uploadResource);

router.delete('/:lessonId/resources/:resourceId',
  authorize('instructor', 'admin'),
  controller.deleteResource);

module.exports = router;
