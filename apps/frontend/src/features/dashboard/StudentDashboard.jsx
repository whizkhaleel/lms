import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, Clock, Trophy, Flame, MessageSquare,
  Calendar, ArrowRight, GraduationCap, Zap, Award,
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import api from '../../shared/api/client';
import { certificatesApi } from '../../shared/api/certificates.api';
import { calendarApi } from '../../shared/api/calendar.api';
import Spinner from '../../shared/components/ui/spinner';

export default function StudentDashboard() {
  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get('/progress/dashboard').then(r => r.data.data),
  });

  const { data: xpData } = useQuery({
    queryKey: ['my-xp'],
    queryFn: () => certificatesApi.myXp().then(r => r.data.data),
  });

  const { data: calData } = useQuery({
    queryKey: ['dashboard-calendar'],
    queryFn: () => calendarApi.listEvents({
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).then(r => r.data.data.events || []),
  });

  const { data: notifData } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: () => api.get('/notifications', { params: { limit: 5 } }).then(r => r.data.data || []),
  });

  const s = dashboardData?.summary ?? {};
  const courses = dashboardData?.courses ?? [];
  const xp = xpData?.xp ?? {};
  const badges = xpData?.badges ?? [];
  const events = calData || [];
  const notifications = notifData || [];

  const upcomingDeadlines = useMemo(() =>
    events
      .filter(ev => ev.event_type === 'assignment_due' || ev.event_type === 'manual')
      .slice(0, 5),
    [events]
  );

  const now = new Date();

  if (dashLoading) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* ── Header row ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Learning</h1>
          <p className="text-gray-400 mt-1">Pick up where you left off</p>
        </div>
        <Link
          to="/achievements"
          className="card p-3 flex items-center gap-3 hover:border-gray-600 transition-colors sm:min-w-[200px]"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Trophy size={20} className="text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{xp.level || 1}</p>
            <p className="text-xs text-gray-400">Level · {xp.total_xp || 0} XP</p>
          </div>
        </Link>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Enrolled',     value: s.totalEnrolled ?? 0, icon: BookOpen, color: 'text-blue-400 bg-blue-500/10' },
          { label: 'In Progress',  value: s.inProgress ?? 0,    icon: Clock,    color: 'text-amber-400 bg-amber-500/10' },
          { label: 'Completed',    value: s.completed ?? 0,     icon: Trophy,   color: 'text-green-400 bg-green-500/10' },
          { label: 'Streak',       value: longestStreak(courses) ?? 0, icon: Flame, color: 'text-orange-400 bg-orange-500/10' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Widgets row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* Upcoming deadlines */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <Calendar size={16} className="text-red-400" />
              Upcoming Deadlines
            </h2>
            <Link to="/calendar" className="text-xs text-[#3B9EE8] hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">No upcoming deadlines</p>
          ) : (
            <div className="space-y-2">
              {upcomingDeadlines.map(ev => {
                const dueDate = parseISO(ev.start_date);
                const isUrgent = isBefore(dueDate, new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
                const isOverdue = isBefore(dueDate, now);
                return (
                  <div key={ev.id} className="flex items-center gap-3 py-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500' : isUrgent ? 'bg-amber-500' : 'bg-gray-600'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{ev.title}</p>
                      <p className="text-xs text-gray-500">{ev.course_title || ''}</p>
                    </div>
                    <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-gray-500'}`}>
                      {isOverdue ? `${Math.round((now - dueDate) / 86400000)}d overdue` : format(dueDate, 'MMM d')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <MessageSquare size={16} className="text-[#3B9EE8]" />
              Recent Activity
            </h2>
            <Link to="/notifications" className="text-xs text-[#3B9EE8] hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {notifications.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {notifications.map(n => (
                <div key={n.id} className="flex items-start gap-3 py-2">
                  <NotificationIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{n.title}</p>
                    {n.body && <p className="text-xs text-gray-500 line-clamp-1">{n.body}</p>}
                    <p className="text-xs text-gray-700 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#3B9EE8] flex-shrink-0 mt-2" />}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Badges row ── */}
      {badges.length > 0 && (
        <div className="card p-5 mb-8">
          <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
            <Award size={16} className="text-amber-400" />
            Recent Badges
          </h2>
          <div className="flex gap-3">
            {badges.slice(0, 6).map(b => (
              <div key={b.id} className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-lg">
                  {b.icon || '🏅'}
                </div>
                <span className="text-[10px] text-gray-500 text-center">{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Course grid ── */}
      <CourseGrid courses={courses} />

    </div>
  );
}

// ── Course grid with progress ─────────────────────
function CourseGrid({ courses }) {
  const filtered = courses;

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <BookOpen size={40} className="mx-auto mb-3 text-gray-700" />
        <p className="text-lg font-medium text-gray-400">No courses here yet</p>
        <Link to="/courses" className="mt-4 inline-block text-[#3B9EE8] hover:underline text-sm">
          Browse the catalog &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-semibold text-white text-sm flex items-center gap-2 mb-4">
        <BookOpen size={16} className="text-[#3B9EE8]" />
        My Courses ({filtered.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(course => (
          <CourseCard key={course.course_id} course={course} />
        ))}
      </div>
    </div>
  );
}

function CourseCard({ course }) {
  const pct = course.percent_complete ?? 0;
  const isComplete = course.is_completed;

  const now = new Date();
  const startDate = course.start_date ? new Date(course.start_date) : null;
  const endDate = course.end_date ? new Date(course.end_date) : null;
  const notStarted = startDate && startDate > now;
  const hasEnded = endDate && endDate < now;

  const continueUrl = course.last_lesson_id
    ? `/learn/${course.course_id}/lessons/${course.last_lesson_id}`
    : `/learn/${course.course_id}`;

  const buttonDisabled = notStarted || hasEnded;

  return (
    <div className="card overflow-hidden flex flex-col hover:border-gray-600 transition-colors group">

      {/* Thumbnail */}
      <div className="relative h-40 bg-gray-900 overflow-hidden">
        {course.thumbnail_path ? (
          <img
            src={`/lmsdata/${course.thumbnail_path}`}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-[#1A6FBF]/20 to-gray-900">
            <BookOpen size={40} className="text-gray-700" />
          </div>
        )}
        {isComplete && (
          <div className="absolute inset-0 bg-green-900/60 flex items-center justify-center">
            <div className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-full flex items-center gap-1">
              <Trophy size={14} /> Completed
            </div>
          </div>
        )}
        {!isComplete && course.current_streak_days >= 2 && (
          <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <Flame size={12} /> {course.current_streak_days}d
          </div>
        )}
        {notStarted && (
          <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            Starts {format(startDate, 'MMM d')}
          </div>
        )}
        {hasEnded && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            Ended {format(endDate, 'MMM d')}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        <h3 className="font-semibold text-white text-sm leading-tight mb-1 line-clamp-2">
          {course.title}
        </h3>
        <p className="text-xs text-gray-500 mb-3">{course.instructor_name}</p>

        {!notStarted && !hasEnded && (
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
        )}

        {buttonDisabled ? (
          <div className={`mt-4 w-full text-center py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-500 cursor-not-allowed`}>
            {notStarted ? `Starts ${format(startDate, 'MMM d, yyyy')}` : 'Course Ended'}
          </div>
        ) : (
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
            {isComplete ? 'Review Course' : pct > 0 ? 'Continue' : 'Start Course'}
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────
function longestStreak(courses) {
  return courses.reduce((max, c) => Math.max(max, c.current_streak_days || 0), 0);
}

function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotificationIcon({ type }) {
  const icons = {
    forum_reply: MessageSquare,
    forum_mention: MessageSquare,
    forum_thread_created: MessageSquare,
    assignment_graded: GraduationCap,
    quiz_graded: Zap,
    certificate_issued: Award,
    enrollment: GraduationCap,
    lesson_available: BookOpen,
    direct_message: MessageSquare,
  };
  const Icon = icons[type] || MessageSquare;
  return (
    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
      <Icon size={14} className="text-gray-400" />
    </div>
  );
}
