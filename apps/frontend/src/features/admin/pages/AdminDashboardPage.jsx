import { useQuery } from '@tanstack/react-query';
import { Link }      from 'react-router-dom';
import { Users, BookOpen, GraduationCap, FileText, CheckCircle, Clock } from 'lucide-react';
import api     from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminDashboardPage() {
  const { data: usersData } = useQuery({
    queryKey: ['admin-users-count'],
    queryFn:  () => api.get('/users?limit=5').then(r => r.data),
  });
  const { data: coursesData } = useQuery({
    queryKey: ['admin-courses-count'],
    queryFn:  () => api.get('/courses?limit=5').then(r => r.data),
  });
  const { data: enrollmentsData } = useQuery({
    queryKey: ['admin-enrollments'],
    queryFn:  () => api.get('/enrollments?limit=5').then(r => r.data),
  });
  const { data: paymentsData } = useQuery({
    queryKey: ['admin-payments-pending'],
    queryFn:  () => api.get('/enrollments/payments/gateway?status=pending&limit=5').then(r => r.data),
  });

  const stats = [
    { label: 'Total Users',       value: usersData?.pagination?.total       ?? '—', icon: Users,          color: 'text-blue-400',   to: '/admin/users' },
    { label: 'Total Courses',     value: coursesData?.pagination?.total      ?? '—', icon: BookOpen,       color: 'text-green-400',  to: '/admin/courses' },
    { label: 'Total Enrollments', value: enrollmentsData?.pagination?.total  ?? '—', icon: GraduationCap,  color: 'text-purple-400', to: '/admin/enrollments' },
    { label: 'Pending Payments',  value: paymentsData?.pagination?.total     ?? '—', icon: FileText,       color: 'text-amber-400',  to: '/admin/payments' },
  ];

  const pendingPayments = paymentsData?.data || [];
  const recentEnrolls   = enrollmentsData?.data || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-white">Admin Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Platform overview and management</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, to }) => (
          <Link key={label} to={to} className="card hover:border-[#3B9EE8]/40 transition-colors">
            <Icon size={20} className={clsx(color, 'mb-2')} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Pending payments */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Pending Payments</h2>
            <Link to="/admin/payments" className="text-xs text-[#3B9EE8] hover:underline">
              View all
            </Link>
          </div>
          {pendingPayments.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={28} className="text-green-500 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No pending payments</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {pendingPayments.map((p, i) => (
                <div key={p.id}
                  className={clsx('flex items-center gap-3 px-5 py-3 border-b border-gray-800/50',
                    i % 2 === 0 && 'bg-white/[0.01]')}>
                  <Clock size={14} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {p.buyer_first_name} {p.buyer_last_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{p.course_title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">
                      {p.currency} {parseFloat(p.amount).toLocaleString()}
                    </p>
                    <Link
                      to="/admin/payments"
                      className="text-xs text-[#3B9EE8] hover:underline"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent enrollments */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Recent Enrollments</h2>
            <Link to="/admin/enrollments" className="text-xs text-[#3B9EE8] hover:underline">
              View all
            </Link>
          </div>
          {recentEnrolls.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No enrollments yet</div>
          ) : (
            <div className="flex flex-col">
              {recentEnrolls.map((e, i) => (
                <div key={e.id}
                  className={clsx('flex items-center gap-3 px-5 py-3 border-b border-gray-800/50',
                    i % 2 === 0 && 'bg-white/[0.01]')}>
                  <div className="w-7 h-7 rounded-full bg-[#1A6FBF] flex items-center
                                  justify-center text-white text-xs font-bold flex-shrink-0">
                    {e.first_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {e.first_name} {e.last_name}
                    </p>
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

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Manage Users',    to: '/admin/users',       icon: Users },
          { label: 'Manage Courses',  to: '/admin/courses',     icon: BookOpen },
          { label: 'Enrollments',     to: '/admin/enrollments', icon: GraduationCap },
          { label: 'Payments',        to: '/admin/payments',    icon: FileText },
        ].map(({ label, to, icon: Icon }) => (
          <Link key={to} to={to} className="btn-secondary btn justify-start gap-2 text-sm">
            <Icon size={16} /> {label}
          </Link>
        ))}
      </div>
    </div>
  );
}