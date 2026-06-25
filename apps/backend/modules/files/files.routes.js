'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const router  = express.Router();

const controller   = require('./files.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const storage      = require('../../config/storage');

// Multer config - files land in lmsdata/temp first
const tempDir = path.join(storage.lmsdataPath, 'temp');

const upload = multer({
  dest: tempDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB hard cap (per-context limits in service)
    files: 1,
  },
  // Don't filter here - let the service validate MIME types properly
});

// All file routes require authentication
router.use(authenticate);

router.post('/upload', authorize('instructor', 'admin'), upload.single('file'), controller.upload);
router.get('/:id', controller.serve);
router.delete('/:id', authorize('instructor', 'admin'), controller.remove);

module.exports = router;
