import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '@/shared/api/client';

// ─────────────────────────────────────────────
//  StudentDashboard
//  Shows:
//    - Stats summary row (enrolled, completed, hours watched)
//    - Course cards with progress bars
//    - "Continue" button linking to last lesson
// ─────────────────────────────────────────────

export default function StudentDashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('all'); // all | inprogress | completed

  useEffect(() => {
    apiClient.get('/progress/dashboard')
      .then(res => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatHours = (h) => h >= 1 ? `${h}h` : `${Math.round(h * 60)}m`;

  const filteredCourses = data?.courses?.filter(c => {
    if (tab === 'inprogress') return !c.is_completed && c.percent_complete > 0;
    if (tab === 'completed')  return c.is_completed;
    return true;
  }) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const s = data?.summary ?? {};

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* ── Page title ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">My Learning</h1>
        <p className="text-gray-400 mt-1">Pick up where you left off</p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Enrolled',     value: s.totalEnrolled   ?? 0, icon: '📚' },
          { label: 'In Progress',  value: s.inProgress      ?? 0, icon: '▶️' },
          { label: 'Completed',    value: s.completed       ?? 0, icon: '🏆' },
          { label: 'Hours Watched',value: formatHours(s.totalWatchedHours ?? 0), icon: '⏱️' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tab filter ── */}
      <div className="flex gap-2 mb-6">
        {['all', 'inprogress', 'completed'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t === 'all' ? 'All Courses' : t === 'inprogress' ? 'In Progress' : 'Completed'}
          </button>
        ))}
      </div>

      {/* ── Course cards ── */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-lg font-medium text-gray-400">No courses here yet</p>
          <Link to="/courses" className="mt-4 inline-block text-blue-400 hover:underline text-sm">
            Browse the catalog →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
            <CourseCard key={course.course_id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual course card ─────────────────────
function CourseCard({ course }) {
  const pct        = course.percent_complete ?? 0;
  const isComplete = course.is_completed;

  const continueUrl = course.last_lesson_id
    ? `/learn/${course.course_id}/lessons/${course.last_lesson_id}`
    : `/learn/${course.course_id}`;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col hover:border-gray-600 transition-colors group">

      {/* Thumbnail */}
      <div className="relative h-40 bg-gray-900 overflow-hidden">
        {course.thumbnail_path ? (
          <img
            src={`/lmsdata/${course.thumbnail_path}`}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-blue-900 to-gray-900">
            📚
          </div>
        )}
        {isComplete && (
          <div className="absolute inset-0 bg-green-900/60 flex items-center justify-center">
            <div className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-full">
              ✓ Completed
            </div>
          </div>
        )}
        {/* Streak */}
        {course.current_streak_days >= 2 && (
          <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            🔥 {course.current_streak_days}d
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-semibold text-white text-sm leading-tight mb-1 line-clamp-2">
          {course.title}
        </h3>
        <p className="text-xs text-gray-500 mb-3">{course.instructor_name}</p>

        {/* Progress bar */}
        <div className="mt-auto">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{course.completed_lessons} / {course.lesson_count} lessons</span>
            <span className={isComplete ? 'text-green-400' : 'text-blue-400'}>{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isComplete ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Continue / Review button */}
        <Link
          to={continueUrl}
          className={`mt-4 w-full text-center py-2 rounded-lg text-sm font-medium transition-colors ${
            isComplete
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              : pct > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          {isComplete ? 'Review Course' : pct > 0 ? '▶ Continue' : 'Start Course'}
        </Link>
      </div>
    </div>
  );
}