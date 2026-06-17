'use strict';

const express      = require('express');
const router       = express.Router({ mergeParams: true }); // inherits :courseId
const controller   = require('./forums.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

// ── Threads ───────────────────────────────────
router.get   ('/',                                    controller.listThreads);
router.post  ('/',                                    controller.createThread);
router.get   ('/:threadId',                           controller.getThread);
router.patch ('/:threadId',                           controller.updateThread);
router.delete('/:threadId',                           controller.deleteThread);

// Instructor / Admin only — pin, lock, mark answered
router.patch ('/:threadId/pin',    authorize('instructor','admin'), controller.pinThread);
router.patch ('/:threadId/lock',   authorize('instructor','admin'), controller.lockThread);

// ── Posts (replies inside a thread) ──────────
router.get   ('/:threadId/posts',                     controller.listPosts);
router.post  ('/:threadId/posts',                     controller.createPost);
router.patch ('/:threadId/posts/:postId',             controller.updatePost);
router.delete('/:threadId/posts/:postId',             controller.deletePost);

// Mark post as accepted answer (instructor / admin)
router.patch ('/:threadId/posts/:postId/answer',
  authorize('instructor','admin'),
  controller.markAsAnswer
);

// ── Reactions ────────────────────────────────
router.post('/:threadId/posts/:postId/react',         controller.toggleReaction);

module.exports = router;