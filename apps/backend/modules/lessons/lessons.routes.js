'use strict';

const express      = require('express');
const multer       = require('multer');
const path         = require('path');
const router       = express.Router({ mergeParams: true }); // inherit :courseId

const controller   = require('./lessons.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const storage      = require('../../config/storage');

const upload = multer({
  dest: path.join(storage.lmsdataPath, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Public preview ────────────────────────────
router.get('/:lessonId/preview', controller.getPreview);

// ── All other routes require auth ─────────────
router.use(authenticate);

// Student — view lesson content (must be enrolled)
router.get('/:lessonId', controller.getLesson);

// Instructor / Admin — manage lessons
router.post('/',
  authorize('instructor', 'admin'),
  controller.createLesson);

router.patch('/reorder',
  authorize('instructor', 'admin'),
  controller.reorderLessons);

router.patch('/:lessonId',
  authorize('instructor', 'admin'),
  controller.updateLesson);

router.delete('/:lessonId',
  authorize('instructor', 'admin'),
  controller.deleteLesson);

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
