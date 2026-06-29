'use strict';

const db          = require('../../config/db');
const cache       = require('../../shared/utils/cache');
const ApiError    = require('../../shared/utils/apiError');
const fileService = require('../files/files.service');

const ANALYTICS_CACHE_KEY  = 'admin:analytics';
const ANALYTICS_CACHE_TTL  = 300; // 5 minutes

async function getPlatformAnalytics() {
  const fetchFn = async () => {
    const [
      { rows: engRow },
      { rows: activeRow },
      { rows: dailyActive },
      { rows: userStats },
      { rows: courseStats },
      { rows: topCourses },
    ] = await Promise.all([
      db.query(
        `SELECT COUNT(*) FILTER (WHERE is_completed) AS completed_courses,
                COUNT(*) AS total_enrollments,
                COALESCE(AVG(percent_complete), 0) AS avg_completion_pct
         FROM course_progress`
      ),
      db.query(
        `SELECT COUNT(DISTINCT user_id) AS active_last_30d
         FROM lesson_progress
         WHERE updated_at >= NOW() - INTERVAL '30 days'`
      ),
      db.query(
        `SELECT TO_CHAR(updated_at, 'YYYY-MM-DD') AS date,
                COUNT(DISTINCT user_id) AS users
         FROM lesson_progress
         WHERE updated_at >= NOW() - INTERVAL '30 days'
         GROUP BY date ORDER BY date`
      ),
      db.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE role = 'student') AS students,
                COUNT(*) FILTER (WHERE role = 'instructor') AS instructors,
                COUNT(*) FILTER (WHERE role = 'admin') AS admins,
                COUNT(*) FILTER (WHERE status = 'active') AS active_users,
                COUNT(*) FILTER (WHERE status = 'suspended') AS suspended_users
         FROM users WHERE deleted_at IS NULL`
      ),
      db.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'published' AND deleted_at IS NULL) AS published,
                COUNT(*) FILTER (WHERE status = 'draft' AND deleted_at IS NULL) AS drafts,
                COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
         FROM courses`
      ),
      db.query(
        `SELECT c.id, c.title, c.student_count,
                COUNT(cp.id) FILTER (WHERE cp.is_completed) AS completions,
                COALESCE(AVG(cp.percent_complete), 0) AS avg_completion
         FROM courses c
         LEFT JOIN course_progress cp ON cp.course_id = c.id
         WHERE c.deleted_at IS NULL
         GROUP BY c.id ORDER BY c.student_count DESC LIMIT 10`
      ),
    ]);

    return {
      engagement: {
        completedCourses: parseInt(engRow[0].completed_courses),
        totalEnrollments: parseInt(engRow[0].total_enrollments),
        avgCompletionPct: Math.round(parseFloat(engRow[0].avg_completion_pct) * 100) / 100,
        activeLast30d: parseInt(activeRow[0].active_last_30d),
        dailyActiveUsers: dailyActive.map(r => ({ date: r.date, users: parseInt(r.users) })),
      },
      users: userStats[0],
      courses: {
        ...courseStats[0],
      },
      topCourses: topCourses.map(c => ({
        id: c.id,
        title: c.title,
        studentCount: parseInt(c.student_count) || 0,
        completions: parseInt(c.completions) || 0,
        avgCompletion: Math.round(parseFloat(c.avg_completion) * 100) / 100,
      })),
    };
  };

  return cache.getOrSet(ANALYTICS_CACHE_KEY, fetchFn, ANALYTICS_CACHE_TTL);
}

async function listAuditLogs({ page, limit, action, entityType, actorId }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (action) { conditions.push(`a.action ILIKE $${idx++}`); params.push(`%${action}%`); }
  if (entityType) { conditions.push(`a.entity_type = $${idx++}`); params.push(entityType); }
  if (actorId) { conditions.push(`a.actor_id = $${idx++}`); params.push(actorId); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const { rows: totalRows } = await db.query(
    `SELECT COUNT(*) AS count FROM audit_logs a ${where}`, params
  );
  const total = parseInt(totalRows[0].count);

  const { rows } = await db.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.before_data, a.after_data,
            a.ip_address, a.user_agent, a.created_at,
            u.first_name || ' ' || u.last_name AS actor_name, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return { rows, total };
}

async function getSettings() {
  const { rows } = await db.query(
    'SELECT setting_key, setting_value FROM institution_settings ORDER BY setting_key'
  );
  const settings = {};
  for (const row of rows) {
    settings[row.setting_key] = row.setting_value;
  }
  return settings;
}

async function updateSettings(body, userId) {
  const allowedKeys = [
    'institution_name', 'institution_tagline', 'institution_email',
    'institution_phone', 'institution_address', 'institution_website',
    'institution_logo_url', 'academic_year', 'default_timezone',
  ];

  const updated = {};
  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.includes(key)) {
      await db.query(
        `INSERT INTO institution_settings (setting_key, setting_value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(value), userId]
      );
      updated[key] = String(value);
    }
  }
  return updated;
}

async function uploadLogo(uploadedFile, requestingUser) {
  const file = await fileService.saveFile({
    uploadedFile,
    context: 'institution_logo',
    ownerId: requestingUser.id,
    uploadedBy: requestingUser.id,
    isPublic: true,
  });

  const logoUrl = `/api/v1/files/public/${file.id}`;

  // Save the logo URL to institution settings
  await db.query(
    `INSERT INTO institution_settings (setting_key, setting_value, updated_by)
     VALUES ('institution_logo_url', $1, $2)
     ON CONFLICT (setting_key)
     DO UPDATE SET setting_value = $1, updated_by = $2, updated_at = NOW()`,
    [logoUrl, requestingUser.id]
  );

  return { fileId: file.id, logoUrl };
}

async function bulkUserAction({ userIds, action, value, actorId }) {
  let query;
  let label;

  switch (action) {
    case 'suspend':
      query = `UPDATE users SET status = 'suspended' WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, email`;
      label = 'suspended';
      break;
    case 'activate':
      query = `UPDATE users SET status = 'active' WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, email`;
      label = 'activated';
      break;
    case 'delete':
      query = `UPDATE users SET deleted_at = NOW() WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, email`;
      label = 'deleted';
      break;
    case 'change_role':
      if (!['student', 'instructor', 'admin'].includes(value)) {
        throw Object.assign(new Error('Invalid role value'), { statusCode: 400 });
      }
      query = {
        text: `UPDATE users SET role = $2 WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, email`,
        values: [userIds, value],
      };
      label = `role changed to ${value}`;
      break;
    default:
      throw Object.assign(new Error(`Unknown action: ${action}`), { statusCode: 400 });
  }

  const { rows } = query.text
    ? await db.query(query.text, query.values)
    : await db.query(query, [userIds]);

  // Audit log entries
  for (const user of rows) {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, 'user', $3, $4)`,
      [actorId, `user.bulk_${action}`, user.id, JSON.stringify({ email: user.email }) ]
    );
  }

  await invalidateAnalyticsCache();

  return { affected: rows.length, action: label, users: rows.map(r => r.email) };
}

async function invalidateAnalyticsCache() {
  await cache.invalidate(ANALYTICS_CACHE_KEY);
}

module.exports = { getPlatformAnalytics, listAuditLogs, getSettings, updateSettings, uploadLogo, bulkUserAction, invalidateAnalyticsCache };
