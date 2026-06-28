'use strict';

const service     = require('./instructor.service');
const ApiResponse = require('../../shared/utils/apiResponse');

async function listStudents(req, res, next) {
  try {
    const students = await service.listStudents(req.user.id);
    ApiResponse.success(res, { students });
  } catch (err) { next(err); }
}

module.exports = { listStudents };
