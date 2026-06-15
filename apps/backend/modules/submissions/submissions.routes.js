'use strict';

const express      = require('express');
const multer       = require('multer');
const path         = require('path');
const router       = express.Router();
const controller   = require('./submissions.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');
const storage      = require('../../config/storage');

const upload = multer({
  dest: path.join(storage.lmsdataPath, 'temp'),
  limits: { fileSize: 100 * 1024 * 1024, files: 5 },
});

router.use(authenticate);

// ── Assignment CRUD (Instructor / Admin) ──────
router.post  ('/assignments',                   authorize('instructor','admin'), controller.createAssignment);
router.get   ('/assignments/:assignmentId',     controller.getAssignment);
router.patch ('/assignments/:assignmentId',     authorize('instructor','admin'), controller.updateAssignment);

// ── Submissions (Student) ─────────────────────
router.post  ('/assignments/:assignmentId/submit',
  upload.array('files', 5),
  controller.submitAssignment
);
router.get   ('/assignments/:assignmentId/my-submission', controller.getMySubmission);

// ── Grading (Instructor / Admin) ──────────────
router.get   ('/assignments/:assignmentId/submissions',  authorize('instructor','admin'), controller.listSubmissions);
router.get   ('/submissions/:submissionId',              controller.getSubmissionDetail);
router.patch ('/submissions/:submissionId/grade',        authorize('instructor','admin'), controller.gradeSubmission);

// ── Gradebook ─────────────────────────────────
router.get   ('/gradebook/:courseId',           controller.getGradebook);
router.get   ('/gradebook/:courseId/user/:userId',
  authorize('instructor','admin'),
  controller.getGradebookForUser
);

module.exports = router;