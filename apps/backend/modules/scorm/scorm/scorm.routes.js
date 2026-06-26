'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const router  = express.Router({ mergeParams: true });

const controller   = require('./scorm.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const storage      = require('../../config/storage');

const upload = multer({
  dest: path.join(storage.lmsdataPath, 'temp'),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      return cb(new Error('Only .zip files are allowed'));
    }
    cb(null, true);
  },
});

// All SCORM routes require auth
router.use(authenticate);

// ── Package CRUD ──────────────────────────────
// Upload: POST /api/v1/scorm/courses/:courseId/lessons/:lessonId/package
router.post('/courses/:courseId/lessons/:lessonId/package',
  authorize('instructor', 'admin'),
  upload.single('package'),
  controller.uploadPackage
);

router.get('/packages/:packageId', controller.getPackage);

// Get package by lesson
router.get('/courses/:courseId/lessons/:lessonId/package',
  controller.getPackageByLesson
);

router.delete('/packages/:packageId/courses/:courseId',
  authorize('instructor', 'admin'),
  controller.deletePackage
);

// ── SCORM Runtime API (called by bridge) ──────
router.post('/packages/:packageId/sco-data', controller.saveScoData);
router.get('/packages/:packageId/sco-data',  controller.getScoData);

// ── Serve SCORM package files ──────────────────
// This must be the LAST route — it's a catch-all for file serving
router.get('/packages/:packageId/serve/*', controller.serveFile);
router.get('/packages/:packageId/serve',    controller.serveFile);

module.exports = router;
