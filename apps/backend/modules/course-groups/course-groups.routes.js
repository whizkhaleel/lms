'use strict';

const express      = require('express');
const router       = express.Router({ mergeParams: true });
const controller   = require('./course-groups.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);
router.use(authorize('instructor','admin','super_admin'));

// ── Groups ────────────────────────────────────
router.get   ('/',                      controller.listGroups);
router.get   ('/:groupId',              controller.getGroup);
router.post  ('/',                      controller.createGroup);
router.patch ('/:groupId',              controller.updateGroup);
router.delete('/:groupId',              controller.removeGroup);

// ── Members ──────────────────────────────────
router.get   ('/:groupId/members',          controller.listMembers);
router.post  ('/:groupId/members',          controller.addMember);
router.delete('/:groupId/members/:userId',  controller.removeMember);

// ── Enrolled students ────────────────────────
router.get('/enrolled-students', controller.listEnrolledStudents);

module.exports = router;
