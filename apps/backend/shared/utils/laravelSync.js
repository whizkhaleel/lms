'use strict';

const env = require('../../config/env');
const db  = require('../../config/db');

async function syncCourse(courseId) {
  if (!env.LARAVEL_BOT_URL || !env.TELEGRAM_INTEGRATION_TOKEN) {
    console.warn('[LaravelSync] Integration variables are not fully configured. Skipping course sync.');
    return;
  }

  try {
    const { rows } = await db.query(
      'SELECT id, title, description, metadata, thumbnail_file_id, status FROM courses WHERE id = $1 AND deleted_at IS NULL',
      [courseId]
    );
    const course = rows[0];
    if (!course) {
      console.warn(`[LaravelSync] Course ${courseId} not found in DB for sync.`);
      return;
    }

    if (course.status !== 'published') {
      console.log(`[LaravelSync] Course ${courseId} is in status "${course.status}". Deleting from bot system...`);
      await deleteCourse(courseId);
      return;
    }

    const price = course.metadata?.price || 0;
    const duration = course.metadata?.duration || 'Self-paced';
    const currency = course.metadata?.currency || 'NGN';

    // Construct public thumbnail URL if available.
    // In local development, the client browser accesses files via port 8080.
    const imagePath = course.thumbnail_file_id
      ? `http://localhost:8080/api/v1/files/public/${course.thumbnail_file_id}`
      : null;

    const payload = {
      id: course.id,
      title: course.title,
      description: course.description || '',
      price: price,
      duration: duration,
      currency: currency,
      image_path: imagePath,
    };

    const response = await fetch(`${env.LARAVEL_BOT_URL}/api/courses/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-token': env.TELEGRAM_INTEGRATION_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[LaravelSync] Sync failed with status ${response.status}: ${text}`);
    } else {
      console.log(`[LaravelSync] Course ${course.id} synced successfully with image: ${imagePath}`);
    }
  } catch (err) {
    console.error('[LaravelSync] Network error syncing course:', err.message);
  }
}

async function deleteCourse(courseId) {
  if (!env.LARAVEL_BOT_URL || !env.TELEGRAM_INTEGRATION_TOKEN) {
    console.warn('[LaravelSync] Integration variables are not fully configured. Skipping course deletion.');
    return;
  }

  try {
    const response = await fetch(`${env.LARAVEL_BOT_URL}/api/courses/${courseId}`, {
      method: 'DELETE',
      headers: {
        'x-telegram-token': env.TELEGRAM_INTEGRATION_TOKEN,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[LaravelSync] Deletion failed with status ${response.status}: ${text}`);
    } else {
      console.log(`[LaravelSync] Course ${courseId} deleted from bot system.`);
    }
  } catch (err) {
    console.error('[LaravelSync] Network error deleting course:', err.message);
  }
}

async function listCourses() {
  if (!env.LARAVEL_BOT_URL || !env.TELEGRAM_INTEGRATION_TOKEN) {
    console.warn('[LaravelSync] Integration variables are not fully configured. Skipping listing.');
    return [];
  }

  try {
    const response = await fetch(`${env.LARAVEL_BOT_URL}/api/courses`, {
      method: 'GET',
      headers: {
        'x-telegram-token': env.TELEGRAM_INTEGRATION_TOKEN,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[LaravelSync] List failed with status ${response.status}: ${text}`);
      return [];
    }

    return await response.json();
  } catch (err) {
    console.error('[LaravelSync] Network error listing courses:', err.message);
    return [];
  }
}

module.exports = { syncCourse, deleteCourse, listCourses };
