const db = require('./config/db');
const { syncCourse, deleteCourse, listCourses } = require('./shared/utils/laravelSync');

async function main() {
  console.log('Fetching all active courses from LMS...');
  const { rows } = await db.query(
    'SELECT id, title FROM courses WHERE deleted_at IS NULL'
  );

  const lmsCourseIds = rows.map(r => r.id);
  console.log(`Found ${rows.length} courses in LMS. Starting synchronization...`);

  for (const course of rows) {
    console.log(`Syncing: "${course.title}" (ID: ${course.id})...`);
    try {
      await syncCourse(course.id);
    } catch (err) {
      console.error(`Failed to sync course ${course.id}:`, err.message);
    }
  }

  console.log('Fetching existing courses from Laravel Bot...');
  const laravelCourses = await listCourses();
  console.log(`Found ${laravelCourses.length} courses in Laravel Bot.`);

  for (const botCourse of laravelCourses) {
    if (!lmsCourseIds.includes(botCourse.id)) {
      console.log(`Deleting extra course in Laravel Bot: (ID: ${botCourse.id})...`);
      try {
        await deleteCourse(botCourse.id);
      } catch (err) {
        console.error(`Failed to delete course ${botCourse.id} from Laravel Bot:`, err.message);
      }
    }
  }

  console.log('All courses synchronization completed.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
