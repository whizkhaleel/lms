'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./calendar.controller');
const authenticate = require('../../shared/middleware/authenticate');

router.use(authenticate);

router.get('/',               controller.listEvents);
router.post('/',              controller.createEvent);
router.patch('/:id',          controller.updateEvent);
router.delete('/:id',         controller.deleteEvent);

module.exports = router;
