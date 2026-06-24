import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3, Users, BookOpen, GraduationCap, DollarSign,
  TrendingUp, Clock, CheckCircle2, Activity, Target, Zap,
} from 'lucide-react';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn:  () => api.get('/admin/analytics').then(r => r.data.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const { revenue, engagement, users: u, courses: c, topCourses } = data || {};
  const rev = revenue || {};
  const eng = engagement || {};

  const stats = [
    { label: 'Total Users',      value: u?.total?.toLocaleString() || '0',       icon: Users,         color: 'text-blue-400' },
    { label: 'Active Users',     value: u?.active_users?.toLocaleString() || '0', icon: CheckCircle2,  color: 'text-green-400' },
    { label: 'Total Courses',    value: c?.total?.toLocaleString() || '0',       icon: BookOpen,      color: 'text-purple-400' },
    { label: 'Active (30d)',     value: eng?.activeLast30d?.toLocaleString() || '0', icon: Zap,      color: 'text-amber-400' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-white">Platform Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Revenue, engagement, and completion metrics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <Icon size={20} className={clsx(color, 'mb-2')} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Revenue */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign size={20} className="text-green-400" />
          <h2 className="font-semibold text-white">Revenue</h2>
        </div>
        {rev.total > 0 ? (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {Object.entries(rev.byCurrency || {}).map(([currency, amount]) => (
                <div key={currency}>
                  <p className="text-2xl font-bold text-white">
                    {currency} {(+amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Confirmed</p>
                </div>
              ))}
              <div>
                <p className="text-sm text-gray-400">{rev.transactionCount || 0} transactions</p>
              </div>
            </div>
            {rev.monthlyTrend?.length > 0 && (
              <div className="border-t border-gray-800 pt-4 mt-2">
                <p className="text-xs text-gray-500 mb-2">Monthly trend (12 months)</p>
                <div className="flex items-end gap-1 h-16">
                  {rev.monthlyTrend.map((m) => {
                    const maxAmmount = Math.max(...rev.monthlyTrend.map(x => +x.amount), 1);
                    const pct = (+m.amount / maxAmmount) * 100;
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-green-500/20 rounded-t"
                          style={{ height: Math.max(pct, 4) + '%' }} />
                        <span className="text-[10px] text-gray-600 truncate w-full text-center">
                          {m.month.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">No confirmed payments yet</p>
        )}
      </div>

      {/* User breakdown */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Users size={20} className="text-blue-400" />
          <h2 className="font-semibold text-white">User Breakdown</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xl font-bold text-white">{u?.students || 0}</p><p className="text-xs text-gray-500">Students</p></div>
          <div><p className="text-xl font-bold text-white">{u?.instructors || 0}</p><p className="text-xs text-gray-500">Instructors</p></div>
          <div><p className="text-xl font-bold text-white">{u?.admins || 0}</p><p className="text-xs text-gray-500">Admins</p></div>
          <div><p className="text-xl font-bold text-white">{u?.suspended_users || 0}</p><p className="text-xs text-gray-500">Suspended</p></div>
        </div>
      </div>

      {/* Course stats */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen size={20} className="text-purple-400" />
          <h2 className="font-semibold text-white">Course Stats</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xl font-bold text-white">{c?.published || 0}</p><p className="text-xs text-gray-500">Published</p></div>
          <div><p className="text-xl font-bold text-white">{c?.drafts || 0}</p><p className="text-xs text-gray-500">Drafts</p></div>
          <div><p className="text-xl font-bold text-white">{c?.deleted || 0}</p><p className="text-xs text-gray-500">Deleted</p></div>
        </div>
      </div>

      {/* Engagement */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Target size={20} className="text-amber-400" />
            <h2 className="font-semibold text-white">Engagement</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xl font-bold text-white">{eng.totalEnrollments || 0}</p>
              <p className="text-xs text-gray-500">Total Enrollments</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{eng.completedCourses || 0}</p>
              <p className="text-xs text-gray-500">Courses Completed</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{eng.avgCompletionPct || 0}%</p>
              <p className="text-xs text-gray-500">Avg Completion Rate</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{eng.activeLast30d || 0}</p>
              <p className="text-xs text-gray-500">Active Learners (30d)</p>
            </div>
          </div>
        </div>

        {/* Top courses */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Top Courses</h2>
            <TrendingUp size={16} className="text-gray-500" />
          </div>
          {(!topCourses || topCourses.length === 0) ? (
            <div className="text-center py-8 text-gray-500 text-sm">No courses yet</div>
          ) : (
            <div className="flex flex-col">
              {topCourses.map((c, i) => (
                <div key={c.id}
                  className={clsx('flex items-center gap-3 px-5 py-3 border-b border-gray-800/50',
                    i % 2 === 0 && 'bg-white/[0.01]')}>
                  <span className="text-xs text-gray-600 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{c.title}</p>
                    <p className="text-xs text-gray-500">{c.completions} completed · {c.avgCompletion}% avg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{c.studentCount || 0}</p>
                    <p className="text-xs text-gray-500">enrolled</p>
                  </div>
                  {c.isFree ? (
                    <span className="badge badge-green text-xs">Free</span>
                  ) : (
                    <span className="badge badge-amber text-xs">Paid</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Access */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Manage Users',    to: '/admin/users',       icon: Users },
          { label: 'Audit Logs',      to: '/admin/audit-logs',  icon: BarChart3 },
          { label: 'Settings',        to: '/admin/settings',    icon: Clock },
          { label: 'Payments',        to: '/admin/payments',    icon: DollarSign },
        ].map(({ label, to, icon: Icon }) => (
          <Link key={to} to={to} className="btn-secondary btn justify-start gap-2 text-sm">
            <Icon size={16} /> {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
