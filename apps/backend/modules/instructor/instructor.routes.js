'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./instructor.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

router.get('/students', authorize('instructor', 'admin'), controller.listStudents);

module.exports = router;
