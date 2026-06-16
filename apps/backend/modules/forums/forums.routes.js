'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./forums.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

// ── Threads ───────────────────────────────────
router.get   ('/courses/:courseId/threads',              controller.listThreads);
router.post  ('/threads',                                 controller.createThread);
router.get   ('/threads/:threadId',                       controller.getThread);
router.patch ('/threads/:threadId',                       controller.updateThread);
router.delete('/threads/:threadId',                       controller.deleteThread);

// ── Instructor thread actions ──────────────────
router.patch ('/threads/:threadId/pin',    authorize('instructor','admin'), controller.pinThread);
router.patch ('/threads/:threadId/lock',   authorize('instructor','admin'), controller.lockThread);

// ── Posts ─────────────────────────────────────
router.post  ('/threads/:threadId/posts',                controller.createPost);
router.patch ('/posts/:postId',                          controller.updatePost);
router.delete('/posts/:postId',                          controller.deletePost);

// ── Instructor post actions ────────────────────
router.patch ('/posts/:postId/mark-answer', authorize('instructor','admin'), controller.markAnswer);

// ── Reactions ──────────────────────────────────
router.post  ('/posts/:postId/react',                    controller.toggleReaction);

module.exports = router;
