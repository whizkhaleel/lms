import { useQuery } from '@tanstack/react-query';
import { Link }      from 'react-router-dom';
import { BookOpen, Users, Star, PlusCircle, Eye, Edit, BarChart3 } from 'lucide-react';
import api     from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';

const STATUS_BADGE = {
  published:    'badge-green',
  draft:        'badge-gray',
  under_review: 'badge-amber',
  archived:     'badge-red',
};

export default function InstructorDashboardPage() {
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn:  () => api.get('/courses/my-courses').then(r => r.data.data || []),
  });

  const totalStudents = courses.reduce((s, c) => s + (c.student_count || 0), 0);
  const published     = courses.filter(c => c.status === 'published').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Instructor Panel</h1>
          <p className="text-gray-400 text-sm mt-1">Manage your courses and students</p>
        </div>
        <Link to="/instructor/courses/new" className="btn-primary btn">
          <PlusCircle size={16} /> New Course
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Courses',    value: courses.length, icon: BookOpen, color: 'text-blue-400' },
          { label: 'Published',        value: published,       icon: Eye,      color: 'text-green-400' },
          { label: 'Total Students',   value: totalStudents,   icon: Users,    color: 'text-purple-400' },
          { label: 'Avg Rating',       value: '—',             icon: Star,     color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <Icon size={20} className={clsx(color, 'mb-2')} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Courses table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">My Courses</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={40} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No courses yet</p>
            <Link to="/instructor/courses/new" className="btn-primary btn mt-4 inline-flex">
              Create your first course
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Course</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Students</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course, i) => (
                <tr key={course.id} className={clsx('border-b border-gray-800/50', i % 2 === 0 && 'bg-white/[0.01]')}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#0D1B2A] flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {course.thumbnail_path
                          ? <img src={`/lmsdata/${course.thumbnail_path}`} alt="" className="w-full h-full object-cover" />
                          : <BookOpen size={16} className="text-gray-600" />
                        }
                      </div>
                      <div>
                        <p className="font-medium text-white line-clamp-1">{course.title}</p>
                        <p className="text-xs text-gray-500 capitalize">{course.level}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={clsx('badge', STATUS_BADGE[course.status] || 'badge-gray')}>
                      {course.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-300">{course.student_count || 0}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={`/instructor/courses/${course.id}/edit`}
                        className="btn-ghost p-1.5 rounded-lg" title="Edit">
                        <Edit size={15} />
                      </Link>
                      <Link to={`/instructor/courses/${course.id}/analytics`}
                        className="btn-ghost p-1.5 rounded-lg" title="Analytics">
                        <BarChart3 size={15} />
                      </Link>
                      <Link to={`/courses/${course.slug}`}
                        className="btn-ghost p-1.5 rounded-lg" title="Preview">
                        <Eye size={15} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}