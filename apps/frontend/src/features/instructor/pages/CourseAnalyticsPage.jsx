import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Users, CheckCircle2, BarChart3, PlayCircle, Clock } from 'lucide-react';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';

export default function CourseAnalyticsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['course-analytics', id],
    queryFn: () => api.get(`/progress/analytics/courses/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20"><Spinner /></div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-20 text-gray-500">
        <BarChart3 size={48} className="mx-auto mb-3 text-gray-700" />
        <p className="font-medium">Course not found</p>
      </div>
    );
  }

  const { course, lessons } = analytics;
  const enrolledCount = course?.student_count || 0;
  const totalCompletions = lessons?.reduce((s, l) => s + parseInt(l.completions || 0), 0) || 0;
  const avgCompletionRate = enrolledCount > 0 && lessons?.length > 0
    ? Math.round((totalCompletions / (enrolledCount * lessons.length)) * 100)
    : 0;
  const completedLessons = lessons?.filter(l => parseInt(l.completions || 0) > 0).length || 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/instructor/analytics')}
          className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Course Analytics</h1>
          <p className="text-gray-400 text-sm mt-1">{course?.title}</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Enrolled Students', value: enrolledCount, icon: Users, color: 'text-blue-400' },
          { label: 'Lessons',           value: course?.lesson_count || 0, icon: BookOpen, color: 'text-purple-400' },
          { label: 'Lessons Attempted',  value: completedLessons, icon: PlayCircle, color: 'text-amber-400' },
          { label: 'Avg Completion',    value: `${avgCompletionRate}%`, icon: CheckCircle2, color: 'text-green-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <Icon size={20} className={clsx(color, 'mb-2')} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Per-lesson breakdown */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">Per-Lesson Completion</h2>
          <span className="text-xs text-gray-500">{lessons?.length || 0} lessons</span>
        </div>

        {!lessons?.length ? (
          <div className="text-center py-16 text-gray-500">
            <BarChart3 size={40} className="mx-auto mb-3 text-gray-700" />
            <p className="font-medium">No lesson data available</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {lessons.map((l, i) => {
              const completionRate = enrolledCount > 0
                ? Math.round((parseInt(l.completions || 0) / enrolledCount) * 100)
                : 0;
              return (
                <div key={l.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.01] transition-colors">
                  <span className="text-xs text-gray-600 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{l.title}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 max-w-xs h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className={clsx('h-full rounded-full transition-all',
                          completionRate >= 80 ? 'bg-green-500' : completionRate >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        )}
                          style={{ width: `${completionRate}%` }} />
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">{l.completions} / {enrolledCount}</span>
                        <span className={clsx('font-semibold w-10 text-right',
                          completionRate >= 80 ? 'text-green-400' : completionRate >= 40 ? 'text-amber-400' : 'text-red-400'
                        )}>{completionRate}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
