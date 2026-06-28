'use strict';

const express      = require('express');
const router       = express.Router();
const controller   = require('./messages.controller');
const authenticate = require('../../shared/middleware/authenticate');

router.use(authenticate);

// ── Conversations ─────────────────────────────
router.get ('/',                                      controller.getConversations);
router.get ('/contacts',                              controller.getContacts);
router.get ('/unread-count',                          controller.getUnreadCount);

// ── Messages inside a conversation ───────────
router.get ('/:conversationId/messages',              controller.getMessages);
router.delete('/:conversationId/messages/:messageId', controller.deleteMessage);

// ── Start / send (creates conversation if needed) ──
router.post('/send',                                  controller.sendMessage);

module.exports = router;