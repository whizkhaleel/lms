'use strict';

const db          = require('../../config/db');
const ApiError    = require('../../shared/utils/apiError');
const eventBus    = require('../../shared/events/eventBus');
const fileService = require('../files/files.service');

function isCourseManager(user, instructorId) {
  return user.role === 'admin' || user.role === 'super_admin' || user.id === instructorId;
}

// ── Slug generator ────────────────────────────
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(title, excludeId = null) {
  const base = slugify(title);
  let slug = base;
  let i = 1;

  while (true) {
    const q = excludeId
      ? 'SELECT id FROM courses WHERE slug = $1 AND id != $2 AND deleted_at IS NULL'
      : 'SELECT id FROM courses WHERE slug = $1 AND deleted_at IS NULL';
    const params = excludeId ? [slug, excludeId] : [slug];
    const { rows } = await db.query(q, params);

    if (rows.length === 0) {
      return slug;
    }

    slug = `${base}-${i++}`;
  }
}

// ── List published courses (public catalog) ───
async function listCourses({ page = 1, limit = 20, category, search, level, isFree, sort = 'newest' }) {
  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);
  const offset = (parsedPage - 1) * parsedLimit;
  const conditions = ["c.status = 'published'", 'c.deleted_at IS NULL'];
  const params = [];
  let i = 1;

  if (category) {
    conditions.push(`cat.slug = $${i++}`);
    params.push(category);
  }

  if (level) {
    conditions.push(`c.level = $${i++}`);
    params.push(level);
  }

  if (isFree !== undefined) {
    conditions.push(`c.is_free = $${i++}`);
    params.push(isFree === true || isFree === 'true');
  }

  if (search) {
    conditions.push(`to_tsvector('english', c.title || ' ' || COALESCE(c.description, '')) @@ plainto_tsquery('english', $${i++})`);
    params.push(search);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const orderBy = sort === 'popular' ? 'c.student_count DESC'
    : sort === 'rating' ? 'c.rating_average DESC'
      : sort === 'price_asc' ? 'c.price ASC'
        : 'c.published_at DESC';

  const [countRes, coursesRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FROM courses c
       LEFT JOIN categories cat ON cat.id = c.category_id
       ${where}`,
      params
    ),
    db.query(
      `SELECT c.id, c.title, c.slug, c.short_description,
              c.is_free, c.price, c.discount_price, c.level,
              c.duration_seconds, c.lesson_count, c.student_count,
              c.rating_average, c.rating_count, c.published_at,
              u.first_name || ' ' || u.last_name AS instructor_name,
              cat.name AS category_name,
              f.storage_path AS thumbnail_path
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
       LEFT JOIN categories cat ON cat.id = c.category_id
       LEFT JOIN files f ON f.id = c.thumbnail_file_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, parsedLimit, offset]
    ),
  ]);

  return {
    courses: coursesRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    page: parsedPage,
    limit: parsedLimit,
  };
}

// ── Get single course (with full structure) ───
async function getCourse(slug, requestingUserId = null) {
  const { rows } = await db.query(
    `SELECT c.*,
            u.first_name || ' ' || u.last_name AS instructor_name,
            u.headline AS instructor_headline,
            cat.name AS category_name,
            f.storage_path AS thumbnail_path
     FROM courses c
     JOIN users u ON u.id = c.instructor_id
     LEFT JOIN categories cat ON cat.id = c.category_id
     LEFT JOIN files f ON f.id = c.thumbnail_file_id
     WHERE c.slug = $1 AND c.deleted_at IS NULL`,
    [slug]
  );

  const course = rows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (course.status !== 'published') {
    const isOwner = requestingUserId && requestingUserId === course.instructor_id;
    if (!isOwner) {
      throw ApiError.notFound('Course not found');
    }
  }

  const { rows: sections } = await db.query(
    `SELECT s.id, s.title, s.description, s.sort_order,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', l.id,
                  'title', l.title,
                  'type', l.type,
                  'duration_seconds', l.duration_seconds,
                  'is_free_preview', l.is_free_preview,
                  'sort_order', l.sort_order,
                  'is_published', l.is_published
                ) ORDER BY l.sort_order
              ) FILTER (WHERE l.id IS NOT NULL),
              '[]'::json
            ) AS lessons
     FROM sections s
     LEFT JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL
     WHERE s.course_id = $1
     GROUP BY s.id
     ORDER BY s.sort_order`,
    [course.id]
  );

  let isEnrolled = false;
  if (requestingUserId) {
    const { rows: enrRows } = await db.query(
      `SELECT id FROM enrollments
       WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
      [requestingUserId, course.id]
    );
    isEnrolled = enrRows.length > 0;
  }

  return { ...course, sections, isEnrolled };
}

// ── Create course ─────────────────────────────
async function createCourse({
  title,
  description,
  shortDescription,
  categoryId,
  isFree,
  price,
  level,
  language,
  tags,
  requirements,
  objectives,
  instructorId,
}) {
  const slug = await uniqueSlug(title);

  const { rows } = await db.query(
    `INSERT INTO courses
       (title, slug, description, short_description, category_id,
        is_free, price, level, language, tags, requirements, objectives,
        instructor_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft')
     RETURNING *`,
    [
      title,
      slug,
      description,
      shortDescription,
      categoryId,
      isFree ?? false,
      isFree ? 0 : (price ?? 0),
      level ?? 'beginner',
      language ?? 'English',
      tags ?? [],
      requirements ?? [],
      objectives ?? [],
      instructorId,
    ]
  );

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
     VALUES ($1, 'course.created', 'course', $2, $3)`,
    [instructorId, rows[0].id, JSON.stringify({ title, slug })]
  );

  eventBus.emit('course.created', { courseId: rows[0].id, instructorId });
  return rows[0];
}

// ── Update course ─────────────────────────────
async function updateCourse(courseId, updates, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id, slug, status FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to update this course');
  }

  const slug = updates.title
    ? await uniqueSlug(updates.title, courseId)
    : course.slug;

  const { rows: updated } = await db.query(
    `UPDATE courses SET
       title             = COALESCE($1, title),
       slug              = $2,
       description       = COALESCE($3, description),
       short_description = COALESCE($4, short_description),
       category_id       = COALESCE($5, category_id),
       is_free           = COALESCE($6, is_free),
       price             = COALESCE($7, price),
       discount_price    = COALESCE($8, discount_price),
       level             = COALESCE($9, level),
       language          = COALESCE($10, language),
       tags              = COALESCE($11, tags),
       requirements      = COALESCE($12, requirements),
       objectives        = COALESCE($13, objectives),
       updated_at        = NOW()
     WHERE id = $14
     RETURNING *`,
    [
      updates.title,
      slug,
      updates.description,
      updates.shortDescription,
      updates.categoryId,
      updates.isFree,
      updates.price,
      updates.discountPrice,
      updates.level,
      updates.language,
      updates.tags ?? null,
      updates.requirements ?? null,
      updates.objectives ?? null,
      courseId,
    ]
  );

  return updated[0];
}

// ── Publish course ────────────────────────────
async function publishCourse(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id, lesson_count FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to publish this course');
  }

  if (course.lesson_count === 0) {
    throw ApiError.badRequest('Cannot publish a course with no lessons');
  }

  const { rows: updated } = await db.query(
    `UPDATE courses SET status = 'published', published_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING id, title, status, published_at`,
    [courseId]
  );

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
     VALUES ($1, 'course.published', 'course', $2)`,
    [requestingUser.id, courseId]
  );

  eventBus.emit('course.published', { courseId, instructorId: course.instructor_id });
  return updated[0];
}

// ── Unpublish course ──────────────────────────
async function unpublishCourse(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to unpublish this course');
  }

  const { rows: updated } = await db.query(
    `UPDATE courses SET status = 'draft', updated_at = NOW()
     WHERE id = $1 RETURNING id, title, status`,
    [courseId]
  );

  return updated[0];
}

// ── Soft delete course ────────────────────────
async function deleteCourse(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to delete this course');
  }

  await db.query(
    'UPDATE courses SET deleted_at = NOW() WHERE id = $1',
    [courseId]
  );
}

// ── Upload thumbnail ──────────────────────────
async function uploadThumbnail(courseId, uploadedFile, uploadedBy, requestingUser = null) {
  const { rows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (requestingUser && !isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to update this course');
  }

  const file = await fileService.saveFile({
    uploadedFile,
    context: 'course_thumbnail',
    ownerId: courseId,
    uploadedBy,
    isPublic: true,
  });

  await db.query(
    'UPDATE courses SET thumbnail_file_id = $1, updated_at = NOW() WHERE id = $2',
    [file.id, courseId]
  );

  return file;
}

// ── Categories ────────────────────────────────
async function listCategories() {
  const { rows } = await db.query(
    'SELECT id, name, slug, description, icon, sort_order FROM categories ORDER BY sort_order, name'
  );
  return rows;
}

// ── Create Section ────────────────────────────
async function createSection(courseId, { title, description }, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = courseRows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }

  const { rows: orderRows } = await db.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM sections WHERE course_id = $1',
    [courseId]
  );

  const { rows } = await db.query(
    `INSERT INTO sections (course_id, title, description, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [courseId, title, description, orderRows[0].next]
  );

  return rows[0];
}

// ── Update Section ────────────────────────────
async function updateSection(courseId, sectionId, updates, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = courseRows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }

  const { rows } = await db.query(
    `UPDATE sections
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         updated_at = NOW()
     WHERE id = $3 AND course_id = $4
     RETURNING *`,
    [updates.title, updates.description, sectionId, courseId]
  );

  if (!rows[0]) {
    throw ApiError.notFound('Section not found');
  }

  return rows[0];
}

// ── Delete Section ────────────────────────────
async function deleteSection(courseId, sectionId, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = courseRows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }

  const { rows } = await db.query(
    'DELETE FROM sections WHERE id = $1 AND course_id = $2 RETURNING id',
    [sectionId, courseId]
  );

  if (!rows[0]) {
    throw ApiError.notFound('Section not found');
  }
}

// ── Reorder Sections ──────────────────────────
async function reorderSections(courseId, orderedIds, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = courseRows[0];
  if (!course) {
    throw ApiError.notFound('Course not found');
  }

  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }

  await db.transaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE sections SET sort_order = $1 WHERE id = $2 AND course_id = $3',
        [i, orderedIds[i], courseId]
      );
    }
  });
}

// ── Instructor: My Courses ────────────────────
async function getMyCourses(instructorId) {
  const { rows } = await db.query(
    `SELECT c.id, c.title, c.slug, c.status, c.is_free, c.price,
            c.lesson_count, c.student_count, c.rating_average,
            c.created_at, c.published_at,
            f.storage_path AS thumbnail_path
     FROM courses c
     LEFT JOIN files f ON f.id = c.thumbnail_file_id
     WHERE c.instructor_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    [instructorId]
  );

  return rows;
}

module.exports = {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  publishCourse,
  unpublishCourse,
  deleteCourse,
  uploadThumbnail,
  listCategories,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  getMyCourses,
};
