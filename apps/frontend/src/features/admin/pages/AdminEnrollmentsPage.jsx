import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, XCircle, Plus, Search, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/modal';
import Input, { Select } from '../../../shared/components/ui/input';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminEnrollmentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [courseFilter, setCourseFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showManual, setShowManual] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-enrollments', page, courseFilter, search],
    queryFn: () => api.get('/enrollments', {
      params: { page, limit: 20, courseId: courseFilter || undefined },
    }).then(r => r.data),
  });

  const { data: coursesData } = useQuery({
    queryKey: ['all-courses-dropdown'],
    queryFn: () => api.get('/courses/my-courses?limit=200').then(r => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['all-users-dropdown'],
    queryFn: () => api.get('/users?limit=200').then(r => r.data),
  });

  const enrollments = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pages = Math.ceil(total / 20);
  const allCourses = coursesData?.data || [];
  const allUsers = usersData?.data || [];

  const revokeMutation = useMutation({
    mutationFn: (id) => api.patch(`/enrollments/${id}/revoke`),
    onSuccess: () => { toast.success('Enrollment revoked'); queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const manualMutation = useMutation({
    mutationFn: (data) => api.post('/enrollments/manual', data),
    onSuccess: () => {
      toast.success('Student enrolled manually');
      setShowManual(false);
      queryClient.invalidateQueries({ queryKey: ['admin-enrollments'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const STATUS_BADGE = {
    active: 'badge-green',
    completed: 'badge-blue',
    expired: 'badge-gray',
    refunded: 'badge-red',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Enrollment Management</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total enrollments</p>
        </div>
        <Button onClick={() => setShowManual(true)}><UserPlus size={16} /> Manual Enroll</Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by course…" className="input pl-9 py-2 text-sm" />
        </div>
        <select value={courseFilter} onChange={e => { setCourseFilter(e.target.value); setPage(1); }}
          className="input py-2 text-sm w-auto">
          <option value="">All courses</option>
          {allCourses.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : enrollments.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No enrollments found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Student</th>
                  <th className="text-left px-5 py-3 font-medium">Course</th>
                  <th className="text-left px-5 py-3 font-medium">Progress</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Enrolled</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {enrollments.map(e => (
                  <tr key={e.id} className="hover:bg-white/[0.01]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#1A6FBF] flex items-center justify-center text-white text-xs font-bold">
                          {e.first_name?.[0]}
                        </div>
                        <div>
                          <p className="text-white text-sm">{e.first_name} {e.last_name}</p>
                          <p className="text-gray-500 text-xs">{e.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-300">{e.course_title}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-[#3B9EE8] rounded-full" style={{ width: `${e.progress_percent}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{e.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={clsx('badge', STATUS_BADGE[e.status])}>{e.status}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(e.enrolled_at), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {e.status === 'active' && (
                        <button onClick={() => { if (confirm('Revoke this enrollment?')) revokeMutation.mutate(e.id); }}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-red-400"
                          title="Revoke"><XCircle size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="btn-ghost p-2 rounded-lg disabled:opacity-30">
            <span className="text-gray-400">←</span>
          </button>
          <span className="text-sm text-gray-400">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
            className="btn-ghost p-2 rounded-lg disabled:opacity-30">
            <span className="text-gray-400">→</span>
          </button>
        </div>
      )}

      <Modal open={showManual} onClose={() => setShowManual(false)} title="Manual Enrollment" size="sm">
        <form onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          manualMutation.mutate(Object.fromEntries(fd));
        }} className="flex flex-col gap-4">
          <Select label="Student" name="userId" required>
            <option value="">Select a student…</option>
            {allUsers.filter(u => u.role === 'student').map(u => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
            ))}
          </Select>
          <Select label="Course" name="courseId" required>
            <option value="">Select a course…</option>
            {allCourses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowManual(false)}>Cancel</Button>
            <Button type="submit" loading={manualMutation.isPending}>Enroll</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
