'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true });

const controller   = require('./lti.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

// All LTI routes require auth
router.use(authenticate);

// ── Tool CRUD (instructor/admin) ──────────────
router.get('/courses/:courseId/tools',
  controller.listTools
);

router.post('/courses/:courseId/tools',
  authorize('instructor', 'admin'),
  controller.registerTool
);

router.get('/tools/:toolId', controller.getTool);

router.patch('/courses/:courseId/tools/:toolId',
  authorize('instructor', 'admin'),
  controller.updateTool
);

router.delete('/courses/:courseId/tools/:toolId',
  authorize('instructor', 'admin'),
  controller.deleteTool
);

// ── Launch endpoints ──────────────────────────
// Get the tool associated with a lesson
router.get('/courses/:courseId/lessons/:lessonId/tool',
  controller.getToolByLesson
);

// Generate LTI launch parameters (frontend auto-submits form)
router.post('/tools/:toolId/launch/:courseId/lessons/:lessonId',
  controller.launchTool
);

module.exports = router;
