import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Eye, Edit, Users, BookOpen, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';

export default function InstructorAnalyticsPage() {
  const navigate = useNavigate();
  const [selectedCourse, setSelectedCourse] = useState(null);

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['instructor-courses-all'],
    queryFn: () => api.get('/courses/my-courses').then(r => r.data.data || []),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['course-analytics', selectedCourse],
    queryFn: () => api.get(`/progress/analytics/courses/${selectedCourse}`).then(r => r.data.data),
    enabled: !!selectedCourse,
  });

  if (!selectedCourse) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl text-white">Course Analytics</h1>
          <p className="text-gray-400 text-sm mt-1">Select a course to view per-lesson completion rates</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {coursesLoading ? (
            <div className="col-span-2 flex justify-center py-12"><Spinner /></div>
          ) : courses.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCourse(c.id)}
              className="card text-left hover:border-[#3B9EE8]/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <BookOpen size={18} className="text-blue-400" />
                <span className={clsx('badge',
                  c.status === 'published' ? 'badge-green' : 'badge-gray'
                )}>{c.status}</span>
              </div>
              <p className="font-semibold text-white mb-1">{c.title}</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Users size={12} /> {c.student_count || 0}</span>
                <span className="flex items-center gap-1"><Eye size={12} /> {c.lesson_count || 0} lessons</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const course = courses.find(c => c.id === selectedCourse);

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => setSelectedCourse(null)} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-white">{course?.title}</h1>
          <p className="text-gray-400 text-sm mt-1">Per-lesson completion analytics</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {analyticsLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !analytics?.lessons?.length ? (
          <div className="text-center py-16 text-gray-500">No lesson data available</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {analytics.lessons.map((l, i) => {
              const completionRate = analytics.course?.lesson_count > 0
                ? Math.round((l.completions / Math.max(analytics.course.student_count || 1, 1)) * 100)
                : 0;
              return (
                <div key={l.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="text-xs text-gray-600 w-6">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{l.title}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 max-w-xs h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-[#3B9EE8] rounded-full transition-all"
                          style={{ width: `${completionRate}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{l.completions} completed</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-white">{completionRate}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
