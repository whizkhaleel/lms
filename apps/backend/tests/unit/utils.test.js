'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const paginate = require('../../shared/utils/pagenate');
const ApiError = require('../../shared/utils/apiError');

test('paginate builds sane defaults and metadata', () => {
  const { page, limit, offset, pagination } = paginate({});

  assert.equal(page, 1);
  assert.equal(limit, 20);
  assert.equal(offset, 0);

  const meta = pagination(57);
  assert.deepEqual(meta, {
    total: 57,
    page: 1,
    limit: 20,
    totalPages: 3,
    hasNext: true,
    hasPrev: false,
  });
});

test('paginate clamps invalid query values', () => {
  const { page, limit, offset, pagination } = paginate({ page: '-4', limit: '250' });

  assert.equal(page, 1);
  assert.equal(limit, 100);
  assert.equal(offset, 0);

  assert.deepEqual(pagination(15), {
    total: 15,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
});

test('ApiError factory helpers set status and defaults', () => {
  const err = ApiError.notFound('Course not found');

  assert.ok(err instanceof Error);
  assert.equal(err.name, 'ApiError');
  assert.equal(err.statusCode, 404);
  assert.equal(err.message, 'Course not found');
  assert.equal(err.isOperational, true);
  assert.deepEqual(err.errors, []);
});
