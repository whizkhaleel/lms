'use strict';

const express      = require('express');
const router       = express.Router({ mergeParams: true });
const controller   = require('./announcements.controller');
const authenticate = require('../../shared/middleware/authenticate');
const authorize    = require('../../shared/middleware/authorize');

router.use(authenticate);

router.get  ('/',                                    controller.list);
router.post ('/', authorize('instructor','admin'),   controller.create);
router.patch('/:id', authorize('instructor','admin'), controller.update);
router.delete('/:id', authorize('instructor','admin'), controller.remove);

module.exports = router;
