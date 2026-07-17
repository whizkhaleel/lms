const db = require('./config/db');
const { syncCourse } = require('./shared/utils/laravelSync');

async function main() {
  console.log('Fetching all active courses from LMS...');
  const { rows } = await db.query(
    'SELECT id, title FROM courses WHERE deleted_at IS NULL'
  );

  console.log(`Found ${rows.length} courses. Starting synchronization...`);

  for (const course of rows) {
    console.log(`Syncing: "${course.title}" (ID: ${course.id})...`);
    try {
      await syncCourse(course.id);
    } catch (err) {
      console.error(`Failed to sync course ${course.id}:`, err.message);
    }
  }

  console.log('All courses synchronization completed.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
