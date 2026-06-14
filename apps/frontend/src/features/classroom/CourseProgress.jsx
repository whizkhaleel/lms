import { useEffect, useState } from 'react';
import apiClient from '@/shared/api/client';

// ─────────────────────────────────────────────
//  CourseProgress
//  Sidebar panel showing:
//    - Overall progress bar
//    - Section → Lesson checklist
//    - Active lesson highlight
//    - Streak badge
// ─────────────────────────────────────────────

export default function CourseProgress({ courseId, activeLessonId, onSelectLesson }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient.get(`/progress/courses/${courseId}`);
        if (!cancelled) setData(res.data.data.progress);
      } catch (err) {
        console.error('[CourseProgress] Failed to load:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [courseId]);

  // Group flat lessons array into sections
  const sections = data?.lessons
    ? data.lessons.reduce((acc, lesson) => {
        const key = lesson.section_title;
        if (!acc[key]) acc[key] = { title: key, order: lesson.section_order, lessons: [] };
        acc[key].lessons.push(lesson);
        return acc;
      }, {})
    : {};

  const sortedSections = Object.values(sections).sort((a, b) => a.order - b.order);

  const formatTime = (secs) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    return `${m}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 text-sm">

      {/* ── Header & Progress Bar ── */}
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-300 font-semibold">Course Progress</span>
          <span className="text-blue-400 font-bold text-base">
            {data?.percent_complete ?? 0}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${data?.percent_complete ?? 0}%` }}
          />
        </div>

        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>{data?.completed_lessons ?? 0} / {data?.total_lessons ?? 0} lessons</span>
          {data?.is_completed && (
            <span className="text-green-400 font-semibold">✓ Complete!</span>
          )}
        </div>

        {/* Streak badge */}
        {data?.current_streak_days > 0 && (
          <div className="mt-3 flex items-center gap-2 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2">
            <span className="text-lg">🔥</span>
            <div>
              <p className="text-amber-400 font-semibold text-xs">
                {data.current_streak_days}-day streak
              </p>
              <p className="text-gray-500 text-xs">Keep it up!</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Section / Lesson list ── */}
      <div className="overflow-y-auto flex-1">
        {sortedSections.map((section, si) => (
          <div key={si}>
            {/* Section header */}
            <div className="px-4 py-2 bg-gray-800 sticky top-0 z-10">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
                {section.title}
              </p>
            </div>

            {/* Lessons */}
            {section.lessons.map((lesson) => {
              const isActive = lesson.id === activeLessonId;
              return (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson?.(lesson.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-gray-700/50 ${
                    isActive
                      ? 'bg-blue-900/40 border-l-2 border-l-blue-500'
                      : 'hover:bg-gray-800/60'
                  }`}
                >
                  {/* Completion circle */}
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                    lesson.is_completed
                      ? 'bg-green-600 border-green-600'
                      : isActive
                      ? 'border-blue-500'
                      : 'border-gray-600'
                  }`}>
                    {lesson.is_completed && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isActive && !lesson.is_completed && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>

                  {/* Lesson info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight truncate ${
                      isActive ? 'text-white font-medium' : 'text-gray-300'
                    }`}>
                      {lesson.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Type icon */}
                      <span className="text-xs text-gray-500">
                        {lesson.type === 'video'  ? '▶ Video'
                       : lesson.type === 'pdf'    ? '📄 PDF'
                       : lesson.type === 'text'   ? '📝 Article'
                       : lesson.type === 'quiz'   ? '❓ Quiz'
                       : '📋 Task'}
                      </span>
                      {lesson.duration_seconds > 0 && (
                        <span className="text-xs text-gray-600">
                          · {formatTime(lesson.duration_seconds)}
                        </span>
                      )}
                    </div>

                    {/* Mini progress bar for partially watched */}
                    {!lesson.is_completed && lesson.watched_secs > 0 && lesson.duration_seconds > 0 && (
                      <div className="mt-1.5 h-0.5 bg-gray-700 rounded-full w-full">
                        <div
                          className="h-full bg-blue-600/70 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round((lesson.watched_secs / lesson.duration_seconds) * 100))}%`
                          }}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}