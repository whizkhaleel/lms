'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./certificates.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

router.get('/my',                  controller.myCertificates);
router.get('/my/xp',               controller.myXp);
router.get('/leaderboard',         controller.leaderboard);
router.get('/courses/:courseId',   authorize('instructor', 'admin'), controller.courseCertificates);

module.exports = router;
