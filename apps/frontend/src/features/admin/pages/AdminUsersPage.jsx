import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Search, Shield, ShieldOff, Trash2, ChevronLeft, ChevronRight, Plus, CheckSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/modal';
import Input, { Select } from '../../../shared/components/ui/input';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkRole, setBulkRole] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search, roleFilter, statusFilter],
    queryFn: () => api.get('/users', {
      params: { page, limit: 20, search: search || undefined, role: roleFilter || undefined, status: statusFilter || undefined },
    }).then(r => r.data),
  });

  const users = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pages = Math.ceil(total / 20);

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => { toast.success('Role updated'); queryClient.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/users/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); queryClient.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => { toast.success('User deleted'); queryClient.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/users', data),
    onSuccess: () => { toast.success('User created'); setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['admin-users'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const bulkMutation = useMutation({
    mutationFn: (body) => api.post('/admin/users/bulk-actions', body),
    onSuccess: (r) => {
      toast.success(`${r.data?.data?.affected || 0} users ${r.data?.data?.action || 'updated'}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Bulk action failed'),
  });

  const STATUS_BADGE = {
    active: 'badge-green',
    suspended: 'badge-red',
    pending_verification: 'badge-amber',
    deactivated: 'badge-gray',
  };

  const toggleAll = () => {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map(u => u.id)));
  };

  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const executeBulk = () => {
    if (selected.size === 0) return toast.error('No users selected');
    if (!bulkAction) return toast.error('Select an action');

    if (bulkAction === 'change_role' && !bulkRole) return toast.error('Select a role');

    bulkMutation.mutate({
      userIds: [...selected],
      action: bulkAction,
      value: bulkAction === 'change_role' ? bulkRole : undefined,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">User Management</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total users</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> Add User</Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search users…" className="input pl-9 py-2 text-sm" />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="input py-2 text-sm w-auto">
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
          <option value="admin">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="input py-2 text-sm w-auto">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending_verification">Pending</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-[#1A6FBF]/10 rounded-xl border border-[#1A6FBF]/20">
          <CheckSquare size={16} className="text-blue-400" />
          <span className="text-sm text-white">{selected.size} selected</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
            className="input py-1.5 text-sm w-auto ml-2">
            <option value="">Bulk action…</option>
            <option value="activate">Activate</option>
            <option value="suspend">Suspend</option>
            <option value="delete">Delete</option>
            <option value="change_role">Change role</option>
          </select>
          {bulkAction === 'change_role' && (
            <select value={bulkRole} onChange={e => setBulkRole(e.target.value)}
              className="input py-1.5 text-sm w-auto">
              <option value="">Select role…</option>
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
            </select>
          )}
          <Button onClick={executeBulk} loading={bulkMutation.isPending} size="sm">
            Apply
          </Button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-white ml-auto">Clear</button>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 w-10">
                    <input type="checkbox" checked={selected.size === users.length && users.length > 0}
                      onChange={toggleAll} className="rounded border-gray-600" />
                  </th>
                  <th className="text-left px-5 py-3 font-medium">User</th>
                  <th className="text-left px-5 py-3 font-medium">Role</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Joined</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map(u => (
                  <tr key={u.id} className={clsx('hover:bg-white/[0.01]', selected.has(u.id) && 'bg-[#1A6FBF]/5')}>
                    <td className="px-5 py-4">
                      <input type="checkbox" checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)} className="rounded border-gray-600" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A6FBF] flex items-center justify-center text-white text-xs font-bold">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-white font-medium">{u.first_name} {u.last_name}</p>
                          <p className="text-gray-500 text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <select value={u.role} onChange={e => roleMutation.mutate({ id: u.id, role: e.target.value })}
                        className="input py-1 text-xs w-auto bg-transparent border-0 cursor-pointer">
                        <option value="student">Student</option>
                        <option value="instructor">Instructor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <span className={clsx('badge', STATUS_BADGE[u.status] || 'badge-gray')}>{u.status}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.status === 'active' ? (
                          <button onClick={() => statusMutation.mutate({ id: u.id, status: 'suspended' })}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-amber-400"
                            title="Suspend"><ShieldOff size={14} /></button>
                        ) : (
                          <button onClick={() => statusMutation.mutate({ id: u.id, status: 'active' })}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-green-400"
                            title="Activate"><Shield size={14} /></button>
                        )}
                        <button onClick={() => { if (confirm('Delete this user?')) deleteMutation.mutate(u.id); }}
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create User" size="sm">
        <form onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          createMutation.mutate(Object.fromEntries(fd));
        }} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" name="firstName" required />
            <Input label="Last name" name="lastName" required />
          </div>
          <Input label="Email" name="email" type="email" required />
          <Input label="Password" name="password" type="password" required placeholder="Min 8 chars" />
          <Select label="Role" name="role" required>
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
            <option value="admin">Admin</option>
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
