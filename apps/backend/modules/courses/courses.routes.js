'use strict';

const express      = require('express');
const multer       = require('multer');
const path         = require('path');
const router       = express.Router();

const controller   = require('./courses.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const storage      = require('../../config/storage');

const upload = multer({
  dest: path.join(storage.lmsdataPath, 'temp'),
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── Public routes (no auth needed) ───────────
router.get('/',           controller.listCourses);
router.get('/categories', controller.listCategories);
router.get('/:slug',      controller.getCourse);

// ── Protected routes ─────────────────────────
router.use(authenticate);

// Instructor / Admin — course management
router.post('/',
  authorize('instructor', 'admin'),
  controller.createCourse);

router.patch('/:id',
  authorize('instructor', 'admin'),
  controller.updateCourse);

router.patch('/:id/publish',
  authorize('instructor', 'admin'),
  controller.publishCourse);

router.patch('/:id/unpublish',
  authorize('instructor', 'admin'),
  controller.unpublishCourse);

router.delete('/:id',
  authorize('instructor', 'admin'),
  controller.deleteCourse);

// Thumbnail upload
router.post('/:id/thumbnail',
  authorize('instructor', 'admin'),
  upload.single('thumbnail'),
  controller.uploadThumbnail);

// ── Sections ─────────────────────────────────
router.post('/:courseId/sections',
  authorize('instructor', 'admin'),
  controller.createSection);

router.patch('/:courseId/sections/:sectionId',
  authorize('instructor', 'admin'),
  controller.updateSection);

router.delete('/:courseId/sections/:sectionId',
  authorize('instructor', 'admin'),
  controller.deleteSection);

router.patch('/:courseId/sections/reorder',
  authorize('instructor', 'admin'),
  controller.reorderSections);

module.exports = router;
