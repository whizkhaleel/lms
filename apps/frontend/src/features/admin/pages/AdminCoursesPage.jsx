import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BookOpen, Eye, EyeOff, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-courses', page, search],
    queryFn: () => api.get('/courses/my-courses', {
      params: { page, limit: 20, search: search || undefined },
    }).then(r => r.data),
  });

  const courses = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pages = Math.ceil(total / 20);

  const publishMutation = useMutation({
    mutationFn: (id) => api.patch(`/courses/${id}/publish`),
    onSuccess: () => { toast.success('Course published'); queryClient.invalidateQueries({ queryKey: ['admin-courses'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const unpublishMutation = useMutation({
    mutationFn: (id) => api.patch(`/courses/${id}/unpublish`),
    onSuccess: () => { toast.success('Course unpublished'); queryClient.invalidateQueries({ queryKey: ['admin-courses'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/courses/${id}`),
    onSuccess: () => { toast.success('Course deleted'); queryClient.invalidateQueries({ queryKey: ['admin-courses'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const STATUS_BADGE = {
    published: 'badge-green',
    draft: 'badge-gray',
    under_review: 'badge-amber',
    archived: 'badge-red',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Course Management</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total courses</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search courses…" className="input pl-9 py-2 text-sm w-64" />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No courses found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Course</th>
                  <th className="text-left px-5 py-3 font-medium">Instructor</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Students</th>
                  <th className="text-left px-5 py-3 font-medium">Created</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {courses.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.01]">
                    <td className="px-5 py-4">
                      <p className="text-white font-medium">{c.title}</p>
                      <p className="text-gray-500 text-xs">{c.slug}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {c.instructor_name || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={clsx('badge', STATUS_BADGE[c.status])}>{c.status}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-400">{c.student_count || 0}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === 'published' ? (
                          <button onClick={() => unpublishMutation.mutate(c.id)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-amber-400"
                            title="Unpublish"><EyeOff size={14} /></button>
                        ) : (
                          <button onClick={() => publishMutation.mutate(c.id)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-green-400"
                            title="Publish"><Eye size={14} /></button>
                        )}
                        <button onClick={() => { if (confirm('Delete this course?')) deleteMutation.mutate(c.id); }}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-red-400"
                          title="Delete"><Trash2 size={14} /></button>
                      </div>
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
            className="btn-ghost p-2 rounded-lg disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-sm text-gray-400">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
            className="btn-ghost p-2 rounded-lg disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
