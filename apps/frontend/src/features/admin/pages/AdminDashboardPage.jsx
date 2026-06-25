import { useQuery } from '@tanstack/react-query';
import { Link }      from 'react-router-dom';
import {
  Users, BookOpen, Target, Zap, BarChart3, Settings,
} from 'lucide-react';
import api     from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn:  () => api.get('/admin/analytics').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const { engagement, users: u, courses: c } = data || {};

  const stats = [
    { label: 'Total Users',      value: u?.total?.toLocaleString() || '0',       icon: Users,         color: 'text-blue-400',   to: '/admin/users' },
    { label: 'Active Learners',  value: engagement?.activeLast30d?.toLocaleString() || '0', icon: Zap, color: 'text-green-400',  to: '/admin/analytics' },
    { label: 'Total Courses',    value: c?.published?.toLocaleString() || '0',  icon: BookOpen,      color: 'text-purple-400', to: '/admin/courses' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Admin Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {u?.total || 0} users · {c?.published || 0} courses · {engagement?.totalEnrollments || 0} enrollments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/analytics" className="btn-ghost text-sm gap-1.5"><BarChart3 size={15} /> Analytics</Link>
          <Link to="/admin/settings" className="btn-ghost text-sm gap-1.5"><Settings size={15} /> Settings</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, icon: Icon, color, to }) => (
          <Link key={label} to={to} className="card hover:border-[#3B9EE8]/40 transition-colors">
            <Icon size={20} className={clsx(color, 'mb-2')} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Link>
        ))}
      </div>

      {/* Engagement row */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Target size={20} className="text-amber-400" />
            <h2 className="font-semibold text-white">Engagement</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-white">{engagement?.totalEnrollments || 0}</p>
              <p className="text-xs text-gray-500">Total Enrollments</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{engagement?.completedCourses || 0}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{engagement?.avgCompletionPct || 0}%</p>
              <p className="text-xs text-gray-500">Avg Completion</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{engagement?.activeLast30d || 0}</p>
              <p className="text-xs text-gray-500">Active (30d)</p>
            </div>
          </div>
        </div>

        {/* User Breakdown */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">User Breakdown</h2>
            <Link to="/admin/users" className="text-xs text-[#3B9EE8] hover:underline">Manage</Link>
          </div>
          <div className="flex flex-col">
            {[
              { label: 'Students',   value: u?.students || 0, color: 'text-blue-400' },
              { label: 'Instructors', value: u?.instructors || 0, color: 'text-green-400' },
              { label: 'Admins',     value: u?.admins || 0, color: 'text-purple-400' },
              { label: 'Suspended',  value: u?.suspended_users || 0, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label}
                className={clsx('flex items-center justify-between px-5 py-3 border-b border-gray-800/50')}>
                <span className="text-sm text-gray-400">{label}</span>
                <span className={clsx('text-sm font-semibold', color)}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Manage Users',    to: '/admin/users',       icon: Users },
          { label: 'Audit Logs',      to: '/admin/audit-logs',  icon: BarChart3 },
          { label: 'Courses',         to: '/admin/courses',     icon: BookOpen },
          { label: 'Settings',        to: '/admin/settings',    icon: Settings },
        ].map(({ label, to, icon: Icon }) => (
          <Link key={to} to={to} className="btn-secondary btn justify-start gap-2 text-sm">
            <Icon size={16} /> {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
