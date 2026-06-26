import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Save, X, Users, UserPlus, UserMinus, ArrowLeft,
  Edit3, ChevronDown, ChevronRight, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Input, { Textarea } from '../../../shared/components/ui/input';
import Modal from '../../../shared/components/ui/modal';
import { clsx } from 'clsx';

export default function CourseGroupsPage() {
  const { id: courseId } = useParams();
  const queryClient = useQueryClient();

  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', maxMembers: '' });
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [showMemberPicker, setShowMemberPicker] = useState(null);

  // Fetch groups
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['course-groups', courseId],
    queryFn: () => api.get(`/courses/${courseId}/groups`).then(r => r.data.data?.groups || []),
  });
  const groups = groupsData || [];

  // Fetch enrolled students
  const { data: studentsData } = useQuery({
    queryKey: ['course-enrolled-students', courseId],
    queryFn: () => api.get(`/courses/${courseId}/groups/enrolled-students`).then(r => r.data.data?.students || []),
  });
  const students = studentsData || [];

  // Fetch members for expanded group
  const { data: membersData } = useQuery({
    queryKey: ['group-members', expandedGroup],
    queryFn: () => api.get(`/courses/${courseId}/groups/${expandedGroup}/members`).then(r => r.data.data?.members || []),
    enabled: !!expandedGroup,
  });
  const members = membersData || [];

  // ── Mutations ──

  const createGroupMut = useMutation({
    mutationFn: (data) => api.post(`/courses/${courseId}/groups`, data),
    onSuccess: () => {
      toast.success('Group created');
      setShowGroupForm(false);
      setGroupForm({ name: '', description: '', maxMembers: '' });
      queryClient.invalidateQueries({ queryKey: ['course-groups', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const updateGroupMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/courses/${courseId}/groups/${id}`, data),
    onSuccess: () => {
      toast.success('Group updated');
      setEditingGroup(null);
      setGroupForm({ name: '', description: '', maxMembers: '' });
      queryClient.invalidateQueries({ queryKey: ['course-groups', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id) => api.delete(`/courses/${courseId}/groups/${id}`),
    onSuccess: () => {
      toast.success('Group deleted');
      setExpandedGroup(null);
      queryClient.invalidateQueries({ queryKey: ['course-groups', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course-enrolled-students', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const addMemberMut = useMutation({
    mutationFn: ({ groupId, userId }) => api.post(`/courses/${courseId}/groups/${groupId}/members`, { userId }),
    onSuccess: () => {
      toast.success('Member added');
      queryClient.invalidateQueries({ queryKey: ['group-members', expandedGroup] });
      queryClient.invalidateQueries({ queryKey: ['course-enrolled-students', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course-groups', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const removeMemberMut = useMutation({
    mutationFn: ({ groupId, userId }) => api.delete(`/courses/${courseId}/groups/${groupId}/members/${userId}`),
    onSuccess: () => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['group-members', expandedGroup] });
      queryClient.invalidateQueries({ queryKey: ['course-enrolled-students', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course-groups', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const openGroupForm = (group) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name,
        description: group.description || '',
        maxMembers: group.max_members?.toString() || '',
      });
    } else {
      setEditingGroup(null);
      setGroupForm({ name: '', description: '', maxMembers: '' });
    }
    setShowGroupForm(true);
  };

  const studentsWithoutGroup = students.filter(s => !s.group_id);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to={`/instructor/courses/${courseId}/edit`}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-display font-bold text-2xl text-white">Group Management</h1>
            <p className="text-gray-400 text-sm mt-1">Organize students into teams for group assignments</p>
          </div>
        </div>
        <Button size="sm" onClick={() => openGroupForm(null)}>
          <Plus size={14} /> Create Group
        </Button>
      </div>

      {groupsLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={48} className="mx-auto text-gray-700 mb-3" />
          <p className="text-gray-500">No groups yet</p>
          <p className="text-gray-600 text-sm mt-1">Create groups and assign students to enable group assignments</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.id} className="card overflow-hidden">
              {/* Group header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedGroup === group.id
                    ? <ChevronDown size={18} className="text-gray-500" />
                    : <ChevronRight size={18} className="text-gray-500" />
                  }
                  <Users size={18} className="text-[#3B9EE8]" />
                  <div>
                    <h3 className="text-white font-medium">{group.name}</h3>
                    <p className="text-xs text-gray-500">
                      {group.member_count || 0} member{group.member_count !== 1 ? 's' : ''}
                      {group.max_members ? ` / max ${group.max_members}` : ''}
                      {group.description ? ` · ${group.description}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openGroupForm(group)}
                    className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/5">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => deleteGroupMut.mutate(group.id)}
                    className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded members */}
              {expandedGroup === group.id && (
                <div className="border-t border-gray-800 px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-300">Members</h4>
                    <button
                      onClick={() => setShowMemberPicker(group.id)}
                      className="text-xs text-[#3B9EE8] hover:underline flex items-center gap-1"
                    >
                      <UserPlus size={12} /> Add Member
                    </button>
                  </div>

                  {members.length === 0 ? (
                    <p className="text-xs text-gray-600">No members yet</p>
                  ) : (
                    <div className="space-y-1">
                      {members.map(m => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] group">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#1A6FBF] flex items-center justify-center text-white text-xs font-bold">
                              {m.first_name?.[0]}{m.last_name?.[0]}
                            </div>
                            <div>
                              <p className="text-sm text-white">{m.first_name} {m.last_name}</p>
                              <p className="text-xs text-gray-600">{m.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => removeMemberMut.mutate({ groupId: group.id, userId: m.user_id })}
                            className="p-1 rounded text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Group Form Modal ── */}
      <Modal
        open={showGroupForm}
        onClose={() => { setShowGroupForm(false); setEditingGroup(null); }}
        title={editingGroup ? 'Edit Group' : 'Create Group'}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input label="Group name" value={groupForm.name}
            onChange={e => setGroupForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Team Alpha" />

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Description (optional)</label>
            <textarea value={groupForm.description}
              onChange={e => setGroupForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className="input resize-none" placeholder="Brief description of the group" />
          </div>

          <Input label="Max members (optional)" type="number" min={1} value={groupForm.maxMembers}
            onChange={e => setGroupForm(p => ({ ...p, maxMembers: e.target.value }))}
            placeholder="Leave empty for unlimited" />

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
            <Button variant="secondary" type="button"
              onClick={() => { setShowGroupForm(false); setEditingGroup(null); }}>
              Cancel
            </Button>
            <Button onClick={() => {
              const data = {
                name: groupForm.name,
                description: groupForm.description || undefined,
                maxMembers: groupForm.maxMembers ? parseInt(groupForm.maxMembers) : undefined,
              };
              if (editingGroup) {
                updateGroupMut.mutate({ id: editingGroup.id, data });
              } else {
                createGroupMut.mutate(data);
              }
            }} loading={createGroupMut.isPending || updateGroupMut.isPending}>
              <Save size={14} /> {editingGroup ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Member Picker Modal ── */}
      <Modal
        open={!!showMemberPicker}
        onClose={() => setShowMemberPicker(null)}
        title="Add Member"
        size="sm"
      >
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {studentsWithoutGroup.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              All enrolled students are already in a group
            </p>
          ) : (
            studentsWithoutGroup.map(s => (
              <div key={s.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.03] cursor-pointer"
                onClick={() => {
                  addMemberMut.mutate({ groupId: showMemberPicker, userId: s.id });
                  setShowMemberPicker(null);
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#1A6FBF] flex items-center justify-center text-white text-xs font-bold">
                    {s.first_name?.[0]}{s.last_name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm text-white">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-gray-600">{s.email}</p>
                  </div>
                </div>
                <UserPlus size={16} className="text-[#3B9EE8]" />
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-gray-800 mt-4">
          <Button variant="secondary" onClick={() => setShowMemberPicker(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
