'use strict';

const assert = require('assert');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5000';

async function api(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text), headers: res.headers };
  } catch {
    return { status: res.status, body: { raw: text } };
  }
}

async function login(email, password) {
  const { body } = await api('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!body.success) throw new Error(`Login failed for ${email}: ${body.message}`);
  return body.data.accessToken;
}

async function main() {
  const passed = [];
  const failed = [];

  function test(name, fn) {
    return async () => {
      try {
        await fn();
        passed.push(name);
        console.log(`  \u2713 ${name}`);
      } catch (err) {
        failed.push({ name, message: err.message });
        console.log(`  \u2717 ${name}: ${err.message}`);
      }
    };
  }

  // ─── SETUP ──────────────────────────────────
  const ADMIN_EMAIL = 'shaheedmahmoudacademy@gmail.com';
  const ADMIN_PASS  = 'SMAbr0!h@rs2026';
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);

  const COURSE_SLUG = 'javascript-mastery';

  // Get a section from the course
  const courseRes = await api(`/api/v1/courses/${COURSE_SLUG}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const course = courseRes.body.data.course;
  const section = course.sections[0];

  // ─── TEST 1: Create a lesson of type 'assignment' ──
  const test1 = test('Create assignment lesson', async () => {
    const { body } = await api(`/api/v1/courses/${course.id}/lessons`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: `E2E Assignment Lesson ${Date.now()}`,
        type: 'assignment',
        sectionId: section.id,
      }),
    });
    assert.ok(body.success, 'Lesson creation should succeed');
    assert.strictEqual(body.data.lesson.type, 'assignment');
    global.lessonId = body.data.lesson.id;
  });

  // ─── TEST 2: Create an assignment (published by default) ──
  const test2 = test('Create assignment (published by default)', async () => {
    assert.ok(global.lessonId, 'Lesson must exist');
    const { body } = await api('/api/v1/submissions/assignments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        lessonId: global.lessonId,
        courseId: course.id,
        title: 'E2E Test Assignment',
        instructions: 'This is an E2E test assignment',
        maxScore: 100,
        passingScore: 60,
      }),
    });
    assert.ok(body.success, 'Assignment creation should succeed');
    assert.strictEqual(body.data.assignment.is_published, true,
      'New assignments should be published by default');
    assert.strictEqual(body.data.assignment.title, 'E2E Test Assignment');
    global.assignmentId = body.data.assignment.id;
  });

  // ─── TEST 3: Student can view the assignment ──
  const test3 = test('User can view the assignment', async () => {
    assert.ok(global.lessonId, 'Lesson must exist');
    const { body } = await api(
      `/api/v1/submissions/assignments/by-lesson/${global.lessonId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.ok(body.success, 'User should see the assignment');
    assert.ok(body.data.assignment, 'Assignment data should be present');
    assert.strictEqual(body.data.assignment.is_published, true,
      'Assignment must be published');
  });

  // ─── TEST 4: User received notification about the new assignment ──
  const test4 = test('User receives notification for new assignment', async () => {
    const { body } = await api('/api/v1/notifications', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const notifs = Array.isArray(body.data) ? body.data : [];

    const match = notifs.find(n =>
      n.type === 'assignment_available'
    );
    assert.ok(match, 'Should have an assignment_available notification');
    assert.ok(match.title.includes('New Assignment'),
      `Expected title containing 'New Assignment', got "${match.title}"`);
    assert.ok(match.body.includes('E2E Test Assignment'),
      `Notification body should reference the assignment title`);
  });

  // ─── RUN ─────────────────────────────────────
  const tests = [test1, test2, test3, test4];

  console.log('\n  Assignment E2E Tests\n');
  for (const t of tests) {
    await t();
  }

  console.log(`\n  Results: ${passed.length}/${tests.length} passed`);
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.map(f => f.name).join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
