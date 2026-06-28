import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Users } from 'lucide-react';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Modal from '../../../shared/components/ui/modal';
import toast from 'react-hot-toast';

export default function InstructorStudentsPage() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [messageText, setMessageText] = useState('');
  const queryClient = useQueryClient();

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['instructor-students'],
    queryFn: () => api.get('/instructor/students').then(r => r.data.data.students),
  });

  const sendMutation = useMutation({
    mutationFn: ({ recipientId, content }) =>
      api.post('/messages/send', { recipientId, content }),
    onSuccess: () => {
      toast.success('Message sent');
      setSelectedStudent(null);
      setMessageText('');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to send message'),
  });

  const handleSend = () => {
    const content = messageText.trim();
    if (!content || sendMutation.isPending) return;
    sendMutation.mutate({ recipientId: selectedStudent.id, content });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-white">My Students</h1>
        <p className="text-gray-400 text-sm mt-1">
          View your enrolled students and send them messages
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : students.length === 0 ? (
        <div className="text-center py-20">
          <Users size={48} className="mx-auto mb-4 text-gray-700" />
          <p className="text-gray-500 text-lg font-medium">No students yet</p>
          <p className="text-gray-600 text-sm mt-1">
            Students will appear here once they enroll in your courses
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Name</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Email</th>
                  <th className="text-right px-5 py-3 text-gray-400 font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-gray-800/50 hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 text-white font-medium">
                      {s.first_name} {s.last_name}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400">{s.email}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedStudent(s)}
                        className="btn-ghost p-2 rounded-xl text-blue-400 hover:text-blue-300"
                        title={`Message ${s.first_name}`}
                      >
                        <MessageSquare size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-gray-600">
            {students.length} student{students.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      <Modal
        open={!!selectedStudent}
        onClose={() => { setSelectedStudent(null); setMessageText(''); }}
        title={`Message ${selectedStudent?.first_name || ''} ${selectedStudent?.last_name || ''}`}
        size="sm"
      >
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Type your message…"
          rows={5}
          className="input w-full resize-none"
        />
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => { setSelectedStudent(null); setMessageText(''); }}
            className="btn-ghost px-4 py-2 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || sendMutation.isPending}
            className="btn-primary px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50"
          >
            <Send size={16} />
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
