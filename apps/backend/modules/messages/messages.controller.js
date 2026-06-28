'use strict';

const Joi         = require('joi');
const service     = require('./messages.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const ApiError    = require('../../shared/utils/apiError');
const paginate    = require('../../shared/utils/pagenate');

async function getConversations(req, res, next) {
  try {
    const conversations = await service.getConversations(req.user.id);
    ApiResponse.success(res, { conversations });
  } catch (err) { next(err); }
}

async function getMessages(req, res, next) {
  try {
    const { limit, pagination } = paginate(req.query);
    const result = await service.getMessages(
      req.params.conversationId, req.user.id,
      { page: req.query.page, limit }
    );
    ApiResponse.paginated(res, result.messages, pagination(result.total));
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const schema = Joi.object({
      recipientId: Joi.string().uuid().required(),
      content:     Joi.string().trim().min(1).max(5000).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) throw ApiError.badRequest('Validation failed', error.details.map(d => d.message));

    const io     = req.app.get('io');
    const result = await service.sendMessage(
      req.user.id, req.user.role, value.recipientId, value.content, io
    );
    ApiResponse.created(res, result, 'Message sent');
  } catch (err) { next(err); }
}

async function deleteMessage(req, res, next) {
  try {
    await service.deleteMessage(req.params.messageId, req.user.id);
    ApiResponse.success(res, {}, 'Message deleted');
  } catch (err) { next(err); }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await service.getUnreadCount(req.user.id);
    ApiResponse.success(res, { count });
  } catch (err) { next(err); }
}

async function getContacts(req, res, next) {
  try {
    const contacts = await service.getContacts(req.user.id, req.user.role);
    ApiResponse.success(res, { contacts });
  } catch (err) { next(err); }
}

module.exports = {
  getConversations, getMessages, sendMessage,
  deleteMessage, getUnreadCount, getContacts,
};