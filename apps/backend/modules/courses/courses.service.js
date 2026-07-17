'use strict';

const db        = require('../../config/db');
const ApiError  = require('../../shared/utils/apiError');
const eventBus  = require('../../shared/events/eventBus');
const cache     = require('../../shared/utils/cache');
const adminService = require('../admin/admin.service');
const fileService = require('../files/files.service');

const COURSE_LIST_CACHE_TTL = 120; // 2 minutes

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
  let base = slugify(title);
  let slug = base;
  let i    = 1;
  while (true) {
    const q = excludeId
      ? 'SELECT id FROM courses WHERE slug = $1 AND id != $2 AND deleted_at IS NULL'
      : 'SELECT id FROM courses WHERE slug = $1 AND deleted_at IS NULL';
    const params = excludeId ? [slug, excludeId] : [slug];
    const { rows } = await db.query(q, params);
    if (rows.length === 0) return slug;
    slug = `${base}-${i++}`;
  }
}

// ── List published courses (public catalog) ───
async function listCourses({ page = 1, limit = 20, category, search, level, sort = 'newest' }) {
  const parts = [`page=${page}`, `limit=${limit}`];
  if (category) parts.push(`cat=${category}`);
  if (search)   parts.push(`q=${search}`);
  if (level)    parts.push(`lvl=${level}`);
  parts.push(`sort=${sort}`);
  const cacheKey = `courses:list:${parts.join(':')}`;

  return cache.getOrSet(cacheKey, async () => {
    const offset = (page - 1) * limit;
    const conditions = ["c.status = 'published'", 'c.deleted_at IS NULL'];
    const params     = [];
    let   i          = 1;

    if (category) {
      conditions.push(`cat.slug = $${i++}`);
      params.push(category);
    }
    if (level) {
      conditions.push(`c.level = $${i++}`);
      params.push(level);
    }
    if (search) {
      conditions.push(`to_tsvector('english', c.title || ' ' || COALESCE(c.description,'')) @@ plainto_tsquery('english', $${i++})`);
      params.push(search);
    }

    const where   = 'WHERE ' + conditions.join(' AND ');
    const orderBy = sort === 'popular'  ? 'c.student_count DESC'
                  : sort === 'rating'   ? 'c.rating_average DESC'
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
                c.level, c.duration_seconds, c.lesson_count, c.student_count,
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
        [...params, limit, offset]
      ),
    ]);

    return {
      courses: coursesRes.rows,
      total:   parseInt(countRes.rows[0].count, 10),
      page:    parseInt(page, 10),
      limit:   parseInt(limit, 10),
    };
  }, COURSE_LIST_CACHE_TTL);
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
  if (!course) throw ApiError.notFound('Course not found');

  // Only published courses visible to non-owners
  if (course.status !== 'published') {
    const isOwner = requestingUserId &&
      (requestingUserId === course.instructor_id);
    if (!isOwner) throw ApiError.notFound('Course not found');
  }

  // Fetch sections with lessons (include quiz/assignment IDs)
  const { rows: sections } = await db.query(
    `SELECT s.id, s.title, s.description, s.sort_order,
            json_agg(
              json_build_object(
                'id',              l.id,
                'title',           l.title,
                'type',            l.type,
                'duration_seconds',l.duration_seconds,
                'sort_order',      l.sort_order,
                'is_published',    l.is_published,
                'quiz_id',         qz.id,
                'assignment_id',   asn.id
              ) ORDER BY l.sort_order
            ) FILTER (WHERE l.id IS NOT NULL) AS lessons
     FROM sections s
     LEFT JOIN lessons l ON l.section_id = s.id AND l.deleted_at IS NULL
     LEFT JOIN quizzes qz ON qz.lesson_id = l.id
     LEFT JOIN assignments asn ON asn.lesson_id = l.id
     WHERE s.course_id = $1
     GROUP BY s.id
     ORDER BY s.sort_order`,
    [course.id]
  );

  // Check if requesting user is enrolled
  let isEnrolled = false;
  if (requestingUserId) {
    const { rows: enrRows } = await db.query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status = 'active'`,
      [requestingUserId, course.id]
    );
    isEnrolled = enrRows.length > 0;
  }

  return { ...course, sections, isEnrolled };
}

// ── Create course ─────────────────────────────
async function createCourse({ title, description, shortDescription, categoryId,
  level, language, tags, requirements, objectives, instructorId,
  startDate, endDate, enableCompletionTracking, showGradesToStudent, metadata }) {

  const slug = await uniqueSlug(title);

  const { rows } = await db.query(
    `INSERT INTO courses
       (title, slug, description, short_description, category_id,
        level, language, tags, requirements, objectives,
        instructor_id, status,
        start_date, end_date, enable_completion_tracking, show_grades_to_student,
        metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',
             $12,$13,$14,$15,$16)
     RETURNING *`,
    [
      title, slug, description, shortDescription, categoryId,
      level ?? 'beginner',
      language ?? 'English',
      tags       ? `{${tags.join(',')}}` : '{}',
      requirements ? `{${requirements.map(r => `"${r}"`).join(',')}}` : '{}',
      objectives   ? `{${objectives.map(o => `"${o}"`).join(',')}}` : '{}',
      instructorId,
      startDate || null, endDate || null,
      enableCompletionTracking ?? false,
      showGradesToStudent ?? true,
      JSON.stringify(metadata || {}),
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
    'SELECT id, instructor_id, status FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) throw ApiError.notFound('Course not found');

  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && course.instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to update this course');
  }

  const slug = updates.title
    ? await uniqueSlug(updates.title, courseId)
    : course.slug;

  const { rows: updated } = await db.query(
    `UPDATE courses SET
       title             = COALESCE($1,  title),
       slug              = $2,
       description       = COALESCE($3,  description),
       short_description = COALESCE($4,  short_description),
       category_id       = COALESCE($5,  category_id),
       level             = COALESCE($6,  level),
       language          = COALESCE($7,  language),
       tags              = COALESCE($8,  tags),
       requirements      = COALESCE($9,  requirements),
       objectives        = COALESCE($10, objectives),
       start_date        = $11,
       end_date          = $12,
       enable_completion_tracking = COALESCE($13, enable_completion_tracking),
       show_grades_to_student     = COALESCE($14, show_grades_to_student),
       metadata          = COALESCE($15, metadata),
       updated_at        = NOW()
     WHERE id = $16
     RETURNING *`,
    [
      updates.title, slug, updates.description, updates.shortDescription,
      updates.categoryId,
      updates.level, updates.language,
      updates.tags         ? `{${updates.tags.join(',')}}` : null,
      updates.requirements ? `{${updates.requirements.map(r => `"${r}"`).join(',')}}` : null,
      updates.objectives   ? `{${updates.objectives.map(o => `"${o}"`).join(',')}}` : null,
      updates.startDate || null,
      updates.endDate || null,
      updates.enableCompletionTracking,
      updates.showGradesToStudent,
      updates.metadata     ? JSON.stringify(updates.metadata) : null,
      courseId,
    ]
  );

  eventBus.emit('course.updated', { courseId, instructorId: requestingUser.id });
  return updated[0];
}

// ── Publish course ────────────────────────────
async function publishCourse(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id, lesson_count FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && course.instructor_id !== requestingUser.id) {
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
  if (!course) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && course.instructor_id !== requestingUser.id) {
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
  if (!course) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && course.instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to delete this course');
  }

  await db.query(
    'UPDATE courses SET deleted_at = NOW() WHERE id = $1',
    [courseId]
  );

  eventBus.emit('course.deleted', { courseId, instructorId: requestingUser.id });
}

// ── Clone course ──────────────────────────────
async function cloneCourse(courseId, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const source = courseRows[0];
  if (!source) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && source.instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to clone this course');
  }

  let newCourse;
  const newSlug = await uniqueSlug(`Copy of ${source.title}`);
  await db.transaction(async (client) => {
    // 1. Clone the course
    const { rows: cRows } = await client.query(
      `INSERT INTO courses
         (title, slug, description, short_description, category_id,
          level, language, tags, requirements, objectives,
          instructor_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
       RETURNING *`,
      [
        `Copy of ${source.title}`, newSlug,
        source.description, source.short_description,
        source.category_id, source.level, source.language,
        source.tags || '{}',
        source.requirements || '{}',
        source.objectives || '{}',
        source.instructor_id,
      ]
    );
    newCourse = cRows[0];

    // 2. Clone sections + lessons + quizzes + assignments
    const { rows: sections } = await client.query(
      'SELECT * FROM sections WHERE course_id = $1 ORDER BY sort_order',
      [source.id]
    );

    for (const sec of sections) {
      const { rows: newSecRows } = await client.query(
        `INSERT INTO sections (course_id, title, description, sort_order)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [newCourse.id, sec.title, sec.description, sec.sort_order]
      );
      const newSec = newSecRows[0];

      // Clone lessons in this section
      const { rows: lessons } = await client.query(
        `SELECT * FROM lessons WHERE section_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
        [sec.id]
      );

      for (const lesson of lessons) {
        const { rows: newLessonRows } = await client.query(
          `INSERT INTO lessons
             (section_id, course_id, title, type, content,
              video_file_id, duration_seconds, sort_order, is_published)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)
           RETURNING *`,
          [
            newSec.id, newCourse.id, lesson.title, lesson.type,
            lesson.content, lesson.video_file_id,
            lesson.duration_seconds, lesson.sort_order,
          ]
        );
        const newLesson = newLessonRows[0];

        // Clone quiz if exists
        const { rows: quizzes } = await client.query(
          'SELECT * FROM quizzes WHERE lesson_id = $1',
          [lesson.id]
        );
        for (const quiz of quizzes) {
          const { rows: newQuizRows } = await client.query(
            `INSERT INTO quizzes
               (lesson_id, course_id, title, description,
                max_attempts, time_limit_mins, passing_score_pct,
                shuffle_questions, shuffle_options, show_answers_after,
                is_published)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
             RETURNING *`,
            [
              newLesson.id, newCourse.id, quiz.title, quiz.description,
              quiz.max_attempts, quiz.time_limit_mins, quiz.passing_score_pct,
              quiz.shuffle_questions, quiz.shuffle_options,
              quiz.show_answers_after,
            ]
          );
          const newQuiz = newQuizRows[0];

          // Clone quiz questions
          const { rows: questions } = await client.query(
            'SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY sort_order',
            [quiz.id]
          );
          for (const q of questions) {
            await client.query(
              `INSERT INTO quiz_questions
                 (quiz_id, type, question_text, options, model_answer,
                  explanation, points, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [newQuiz.id, q.type, q.question_text, q.options,
               q.model_answer, q.explanation, q.points, q.sort_order]
            );
          }
        }

        // Clone assignment if exists
        const { rows: assignments } = await client.query(
          'SELECT * FROM assignments WHERE lesson_id = $1',
          [lesson.id]
        );
        for (const assign of assignments) {
          const { rows: newAssignRows } = await client.query(
            `INSERT INTO assignments
               (lesson_id, course_id, title, instructions,
                max_score, passing_score, allow_text_submission,
                allow_file_submission, max_file_size_mb,
                allowed_file_types, max_files, is_published, is_group_assignment)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12)
             RETURNING *`,
            [
              newLesson.id, newCourse.id, assign.title, assign.instructions,
              assign.max_score, assign.passing_score,
              assign.allow_text_submission, assign.allow_file_submission,
              assign.max_file_size_mb, assign.allowed_file_types,
              assign.max_files, assign.is_group_assignment,
            ]
          );
          const newAssign = newAssignRows[0];

          // Clone rubric
          const { rows: rubrics } = await client.query(
            'SELECT * FROM assignment_rubrics WHERE assignment_id = $1',
            [assign.id]
          );
          for (const rub of rubrics) {
            const { rows: newRubRows } = await client.query(
              `INSERT INTO assignment_rubrics
                 (assignment_id, name, description, max_score)
               VALUES ($1,$2,$3,$4) RETURNING *`,
              [newAssign.id, rub.name, rub.description, rub.max_score]
            );
            const newRub = newRubRows[0];

            // Clone rubric criteria
            const { rows: criteria } = await client.query(
              'SELECT * FROM rubric_criteria WHERE rubric_id = $1 ORDER BY sort_order',
              [rub.id]
            );
            for (const crit of criteria) {
              await client.query(
                `INSERT INTO rubric_criteria
                   (rubric_id, description, max_score, sort_order)
                 VALUES ($1,$2,$3,$4)`,
                [newRub.id, crit.description, crit.max_score, crit.sort_order]
              );
            }
          }
        }

        // Clone lesson resources
        const { rows: resources } = await client.query(
          'SELECT * FROM lesson_resources WHERE lesson_id = $1 ORDER BY sort_order',
          [lesson.id]
        );
        for (const res of resources) {
          await client.query(
            `INSERT INTO lesson_resources
               (lesson_id, file_id, title, sort_order)
             VALUES ($1,$2,$3,$4)`,
            [newLesson.id, res.file_id, res.title, res.sort_order]
          );
        }

        // Clone lesson availability
        const { rows: avail } = await client.query(
          'SELECT * FROM lesson_availability WHERE lesson_id = $1',
          [lesson.id]
        );
        for (const a of avail) {
          await client.query(
            `INSERT INTO lesson_availability (lesson_id, conditions)
             VALUES ($1,$2)`,
            [newLesson.id, typeof a.conditions === 'string' ? a.conditions : JSON.stringify(a.conditions)]
          );
        }
      }
    }

    // 3. Clone question bank categories + questions
    const { rows: bankCats } = await client.query(
      'SELECT * FROM question_bank_categories WHERE course_id = $1',
      [source.id]
    );
    for (const cat of bankCats) {
      const { rows: newCatRows } = await client.query(
        `INSERT INTO question_bank_categories (course_id, name)
         VALUES ($1,$2) RETURNING *`,
        [newCourse.id, cat.name]
      );
      const newCat = newCatRows[0];

      const { rows: bankQs } = await client.query(
        'SELECT * FROM question_bank WHERE category_id = $1',
        [cat.id]
      );
      for (const q of bankQs) {
        await client.query(
          `INSERT INTO question_bank
             (category_id, type, question_text, options, model_answer,
              explanation, points)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newCat.id, q.type, q.question_text, q.options,
           q.model_answer, q.explanation, q.points]
        );
      }
    }

    // 4. Clone course announcements
    const { rows: announcements } = await client.query(
      'SELECT * FROM course_announcements WHERE course_id = $1',
      [source.id]
    );
    for (const ann of announcements) {
      await client.query(
        `INSERT INTO course_announcements (course_id, instructor_id, title, body)
         VALUES ($1,$2,$3,$4)`,
        [newCourse.id, ann.instructor_id, ann.title, ann.body]
      );
    }

    // 5. Clone course groups (without members)
    const { rows: groups } = await client.query(
      'SELECT * FROM course_groups WHERE course_id = $1',
      [source.id]
    );
    for (const g of groups) {
      await client.query(
        `INSERT INTO course_groups (course_id, name, description, max_members)
         VALUES ($1,$2,$3,$4)`,
        [newCourse.id, g.name, g.description, g.max_members]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'course.cloned', 'course', $2, $3)`,
      [requestingUser.id, newCourse.id,
       JSON.stringify({ sourceId: source.id, sourceTitle: source.title })]
    );
  });

  // Invalidate caches (fire-and-forget)
  invalidateCourseListCache().catch(() => {});
  eventBus.emit('course.cloned', { courseId: newCourse.id, sourceId: source.id, userId: requestingUser.id });

  return newCourse;
}
async function uploadThumbnail(courseId, uploadedFile, uploadedBy, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin'
      && course.instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to upload a thumbnail for this course');
  }

  const file = await fileService.saveFile({
    uploadedFile,
    context:    'course_thumbnail',
    ownerId:    courseId,
    uploadedBy,
    isPublic:   true,
  });

  await db.query(
    'UPDATE courses SET thumbnail_file_id = $1, updated_at = NOW() WHERE id = $2',
    [file.id, courseId]
  );
  eventBus.emit('course.updated', { courseId, instructorId: requestingUser.id });
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
  if (!courseRows[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && courseRows[0].instructor_id !== requestingUser.id) {
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
  if (!courseRows[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && courseRows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }

  const { rows } = await db.query(
    `UPDATE sections
     SET title       = COALESCE($1, title),
         description = COALESCE($2, description),
         updated_at  = NOW()
     WHERE id = $3 AND course_id = $4
     RETURNING *`,
    [updates.title, updates.description, sectionId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Section not found');
  return rows[0];
}

// ── Delete Section ────────────────────────────
async function deleteSection(courseId, sectionId, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!courseRows[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && courseRows[0].instructor_id !== requestingUser.id) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }

  const { rows } = await db.query(
    'DELETE FROM sections WHERE id = $1 AND course_id = $2 RETURNING id',
    [sectionId, courseId]
  );
  if (!rows[0]) throw ApiError.notFound('Section not found');
}

// ── Reorder Sections ──────────────────────────
async function reorderSections(courseId, orderedIds, requestingUser) {
  const { rows: courseRows } = await db.query(
    'SELECT instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  if (!courseRows[0]) throw ApiError.notFound('Course not found');
  if (requestingUser.role !== 'admin' && requestingUser.role !== 'super_admin' && courseRows[0].instructor_id !== requestingUser.id) {
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
    `SELECT c.id, c.title, c.slug, c.status,
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

// ── Admin: list ALL courses regardless of status ──
async function getAllCoursesForAdmin({ status, search } = {}) {
  const conditions = ['c.deleted_at IS NULL'];
  const params      = [];
  let   i           = 1;

  if (status) {
    conditions.push(`c.status = $${i++}`);
    params.push(status);
  }
  if (search) {
    conditions.push(`c.title ILIKE $${i++}`);
    params.push(`%${search}%`);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT c.id, c.title, c.slug, c.status,
            c.lesson_count, c.student_count, c.rating_average,
            c.created_at, c.published_at,
            u.first_name || ' ' || u.last_name AS instructor_name,
            f.storage_path AS thumbnail_path
     FROM courses c
     JOIN users u ON u.id = c.instructor_id
     LEFT JOIN files f ON f.id = c.thumbnail_file_id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );
  return rows;
}

async function invalidateCourseListCache() {
  await cache.invalidatePattern('courses:list:*');
  await adminService.invalidateAnalyticsCache();
}

module.exports = {
  listCourses, getCourse, createCourse, updateCourse,
  publishCourse, unpublishCourse, deleteCourse, cloneCourse,
  uploadThumbnail, listCategories,
  createSection, updateSection, deleteSection, reorderSections,
  getMyCourses, getAllCoursesForAdmin,
  invalidateCourseListCache,
};
