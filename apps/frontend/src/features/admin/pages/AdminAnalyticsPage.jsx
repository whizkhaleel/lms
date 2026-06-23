import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BarChart3, Users, BookOpen, GraduationCap, DollarSign, TrendingUp, Clock, CheckCircle2, Activity } from 'lucide-react';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminAnalyticsPage() {
  const { data: usersRes } = useQuery({
    queryKey: ['admin-users-stats'],
    queryFn:  () => api.get('/users?limit=1').then(r => r.data),
  });
  const { data: coursesRes } = useQuery({
    queryKey: ['admin-courses-stats'],
    queryFn:  () => api.get('/courses/my-courses?limit=1000').then(r => r.data),
  });
  const { data: enrollmentsRes } = useQuery({
    queryKey: ['admin-enrollments-stats'],
    queryFn:  () => api.get('/enrollments?limit=1').then(r => r.data),
  });
  const { data: confirmedPayments } = useQuery({
    queryKey: ['admin-payments-confirmed'],
    queryFn:  () => api.get('/enrollments/payments/gateway?status=confirmed&limit=1000').then(r => r.data),
  });
  const { data: pendingRes } = useQuery({
    queryKey: ['admin-pending-count'],
    queryFn:  () => api.get('/enrollments/payments/gateway?status=pending&limit=1').then(r => r.data),
  });
  const { data: recentEnrollments } = useQuery({
    queryKey: ['admin-recent-enrollments'],
    queryFn:  () => api.get('/enrollments?limit=10').then(r => r.data),
  });

  const totalUsers       = usersRes?.pagination?.total ?? 0;
  const totalCourses     = coursesRes?.data?.length ?? 0;
  const totalEnrollments = enrollmentsRes?.pagination?.total ?? 0;
  const pendingCount     = pendingRes?.pagination?.total ?? 0;
  const allCourses       = coursesRes?.data || [];

  const confirmedList    = confirmedPayments?.data || [];
  const revenue          = confirmedList.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const revenueByCurrency = confirmedList.reduce((acc, p) => {
    const cur = p.currency || 'NGN';
    acc[cur] = (acc[cur] || 0) + parseFloat(p.amount || 0);
    return acc;
  }, {});

  // Top courses by student_count
  const topCourses = [...allCourses]
    .sort((a, b) => (b.student_count || 0) - (a.student_count || 0))
    .slice(0, 5);

  const recentList = recentEnrollments?.data || [];

  const stats = [
    { label: 'Total Users',       value: totalUsers.toLocaleString(),       icon: Users,         color: 'text-blue-400' },
    { label: 'Total Courses',     value: totalCourses.toLocaleString(),     icon: BookOpen,      color: 'text-green-400' },
    { label: 'Total Enrollments', value: totalEnrollments.toLocaleString(), icon: GraduationCap, color: 'text-purple-400' },
    { label: 'Pending Payments',  value: pendingCount.toLocaleString(),     icon: Clock,         color: 'text-amber-400' },
  ];

  const loading = !usersRes || !coursesRes || !enrollmentsRes;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-white">Platform Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of platform performance and growth</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <Icon size={20} className={clsx(color, 'mb-2')} />
            <p className="text-2xl font-bold text-white">{loading ? '...' : value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Revenue card */}
      {revenue > 0 && (
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign size={20} className="text-green-400" />
            <h2 className="font-semibold text-white">Revenue</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(revenueByCurrency).map(([currency, amount]) => (
              <div key={currency}>
                <p className="text-2xl font-bold text-white">
                  {currency} {amount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Confirmed ({currency})</p>
              </div>
            ))}
            <div>
              <p className="text-sm text-gray-400">{confirmedList.length} total transactions</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Top courses */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Top Courses by Enrollment</h2>
            <TrendingUp size={16} className="text-gray-500" />
          </div>
          {topCourses.length === 0 ? (
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
                    <p className="text-xs text-gray-500 capitalize">{c.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{c.student_count || 0}</p>
                    <p className="text-xs text-gray-500">students</p>
                  </div>
                  {c.is_free ? (
                    <span className="badge badge-green text-xs">Free</span>
                  ) : (
                    <span className="badge badge-amber text-xs">Paid</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent enrollments */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Recent Enrollments</h2>
            <Activity size={16} className="text-gray-500" />
          </div>
          {recentList.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No enrollments yet</div>
          ) : (
            <div className="flex flex-col">
              {recentList.map((e, i) => (
                <div key={e.id}
                  className={clsx('flex items-center gap-3 px-5 py-3 border-b border-gray-800/50',
                    i % 2 === 0 && 'bg-white/[0.01]')}>
                  <div className="w-7 h-7 rounded-full bg-[#1A6FBF] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {e.first_name?.[0]}{e.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{e.first_name} {e.last_name}</p>
                    <p className="text-xs text-gray-500 truncate">{e.course_title}</p>
                  </div>
                  <p className="text-xs text-gray-600 flex-shrink-0">
                    {formatDistanceToNow(new Date(e.enrolled_at), { addSuffix: true })}
                  </p>
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
          { label: 'Manage Courses',  to: '/admin/courses',     icon: BookOpen },
          { label: 'Enrollments',     to: '/admin/enrollments', icon: GraduationCap },
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
