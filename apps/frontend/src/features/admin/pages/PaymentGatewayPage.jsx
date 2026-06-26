import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard, CheckCircle, XCircle, ExternalLink,
  Search, ChevronLeft, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/modal';
import { Textarea } from '../../../shared/components/ui/input';

export default function PaymentGatewayPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payments-gateway', page, search],
    queryFn: () => api.get('/enrollments/pending', {
      params: { page, limit, search: search || undefined },
    }).then(r => r.data),
  });

  const payments = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pages = Math.ceil(total / limit);

  const approveMutation = useMutation({
    mutationFn: (paymentId) => api.post(`/enrollments/pending/${paymentId}/approve`),
    onSuccess: () => {
      toast.success('Enrollment approved');
      queryClient.invalidateQueries({ queryKey: ['admin-payments-gateway'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/enrollments/pending/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Enrollment rejected');
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-payments-gateway'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reject'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Payment Gateway</h1>
          <p className="text-gray-400 text-sm mt-1">
            {total > 0
              ? `${total} pending payment${total === 1 ? '' : 's'} awaiting review`
              : 'Review and approve external payment enrollments'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="badge badge-amber text-xs">{total} pending</span>
          )}
        </div>
      </div>

      <div className="relative max-w-xs mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by email or name…"
          className="input pl-9 py-2 text-sm w-full"
        />
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : payments.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <CheckCircle size={36} className="mx-auto mb-3 text-gray-700" />
            <p className="text-gray-400 font-medium">All caught up</p>
            <p className="text-sm mt-1">No pending gateway payments</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Buyer</th>
                  <th className="text-left px-5 py-3 font-medium">Course</th>
                  <th className="text-left px-5 py-3 font-medium">Reference</th>
                  <th className="text-left px-5 py-3 font-medium">Account</th>
                  <th className="text-left px-5 py-3 font-medium">Received</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.01]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">
                          {p.buyer_first_name?.[0] || '?'}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">
                            {p.buyer_first_name} {p.buyer_last_name}
                          </p>
                          <p className="text-gray-500 text-xs">{p.buyer_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-gray-300 text-sm">{p.course_title}</p>
                      <p className="text-xs text-gray-600">{p.instructor_name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-xs text-gray-400 font-mono bg-white/5 px-2 py-1 rounded">
                        {p.external_reference?.slice(0, 16)}…
                      </code>
                    </td>
                    <td className="px-5 py-4">
                      {p.account_created ? (
                        <span className="badge badge-green text-xs">New</span>
                      ) : (
                        <span className="badge badge-gray text-xs">Existing</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => approveMutation.mutate(p.id)}
                          disabled={approveMutation.isPending}
                          className="p-1.5 rounded-lg hover:bg-green-500/10 text-gray-500 hover:text-green-400 disabled:opacity-30"
                          title="Approve enrollment"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={() => setRejectTarget(p)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                          title="Reject enrollment"
                        >
                          <XCircle size={16} />
                        </button>
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
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronLeft size={16} className="text-gray-400" />
          </button>
          <span className="text-sm text-gray-400">Page {page} of {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(p => p + 1)}
            className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronRight size={16} className="text-gray-400" />
          </button>
        </div>
      )}

      <Modal
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); }}
        title="Reject Payment"
        size="sm"
      >
        <p className="text-sm text-gray-400 mb-4">
          Reject enrollment for <strong className="text-white">{rejectTarget?.buyer_email}</strong>
          {' '}in <strong className="text-white">{rejectTarget?.course_title}</strong>.
        </p>
        <Textarea
          label="Reason (optional)"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          rows={2}
          placeholder="Optional reason for rejection…"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>
            Cancel
          </Button>
          <Button
            onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })}
            loading={rejectMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            Reject
          </Button>
        </div>
      </Modal>
    </div>
  );
}
