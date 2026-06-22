'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./enrollments.controller');

// ─────────────────────────────────────────────
//  EXTERNAL PAYMENT WEBHOOK
//
//  Called by the separate payment website — NOT a logged-in user.
//  No `authenticate` middleware here. Trust is established via
//  HMAC signature verification inside the controller/service.
//
//  IMPORTANT: this route requires the RAW request body (not
//  JSON-parsed) to verify the HMAC signature correctly.
//  The raw-body middleware is applied in server.js, scoped to
//  this exact path, before the global express.json() runs.
// ─────────────────────────────────────────────
router.post('/', controller.paymentWebhook);

module.exports = router;