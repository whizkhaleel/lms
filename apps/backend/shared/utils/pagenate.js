'use strict';

/**
 * Build pagination metadata for paginated queries.
 *
 * Usage:
 *   const { limit, offset, pagination } = paginate(req.query);
 *   const rows = await db.query('SELECT ... LIMIT $1 OFFSET $2', [limit, offset]);
 *   return ApiResponse.paginated(res, rows, pagination(totalCount));
 */
function paginate(query) {
  const page  = Math.max(1, parseInt(query.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const buildMeta = (total) => ({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: offset + limit < total,
    hasPrev: page > 1,
  });

  return { page, limit, offset, pagination: buildMeta };
}

module.exports = paginate;
