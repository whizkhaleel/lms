import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, Mail, UserPlus, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import api     from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Button  from '../../../shared/components/ui/Button';
import Modal   from '../../../shared/components/ui/modal';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function PaymentGatewayPage() {
  const queryClient        = useQueryClient();
  const [tab, setTab]      = useState('pending');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['gateway-payments', tab],
    queryFn:  () => api.get(`/enrollments/payments/gateway?status=${tab}&limit=50`).then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/enrollments/payments/gateway/${id}/approve`),
    onSuccess:  (res) => {
      const { isNewAccount } = res.data.data;
      toast.success(
        isNewAccount
          ? 'Account created, student enrolled, and login details emailed'
          : 'Student enrolled and notified by email'
      );
      queryClient.invalidateQueries({ queryKey: ['gateway-payments'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => api.patch(`/enrollments/payments/gateway/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Payment rejected and buyer notified');
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['gateway-payments'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Rejection failed'),
  });

  const payments = data?.data || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-white">Payment Gateway Queue</h1>
        <p className="text-gray-400 text-sm mt-1">
          Payments received from the external payment website, awaiting your review.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {['pending', 'confirmed', 'rejected'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-[#1A6FBF] text-white' : 'bg-[#112236] text-gray-400 hover:text-white'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : payments.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle size={36} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No {tab} gateway payments</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {payments.map(p => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-white">
                      {p.buyer_first_name} {p.buyer_last_name}
                    </p>
                    <span className="badge-gray badge">{p.payment_method?.replace('_',' ')}</span>
                  </div>
                  <p className="text-sm text-gray-400 flex items-center gap-1.5">
                    <Mail size={12} /> {p.buyer_email}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">{p.course_title}</p>
                  <p className="text-xs text-gray-600 mt-1 flex items-center gap-1.5">
                    <ExternalLink size={11} /> Ref: {p.external_reference}
                    <span className="mx-1">·</span>
                    <Clock size={11} /> {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-white text-lg">
                    {p.currency} {parseFloat(p.amount).toLocaleString()}
                  </p>
                  {tab === 'confirmed' && (
                    <p className={clsx('text-xs mt-0.5 flex items-center gap-1 justify-end',
                      p.account_created ? 'text-blue-400' : 'text-gray-500')}>
                      {p.account_created && <UserPlus size={11} />}
                      {p.account_created ? 'New account' : 'Existing account'}
                    </p>
                  )}
                  {tab === 'confirmed' && (
                    <p className={clsx('text-xs mt-0.5',
                      p.credentials_email_sent ? 'text-green-400' : 'text-amber-400')}>
                      {p.credentials_email_sent ? '✓ Email sent' : '⚠ Email failed'}
                    </p>
                  )}
                </div>

                {tab === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="primary"
                      loading={approveMutation.isPending && approveMutation.variables === p.id}
                      onClick={() => approveMutation.mutate(p.id)}
                      className="text-sm"
                    >
                      <CheckCircle size={14} /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setRejectTarget(p)}
                      className="text-sm"
                    >
                      <XCircle size={14} /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject reason modal */}
      <Modal
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason(''); }}
        title="Reject Payment"
        size="sm"
      >
        <p className="text-sm text-gray-400 mb-4">
          Rejecting payment from <strong className="text-white">{rejectTarget?.buyer_email}</strong> for{' '}
          <strong className="text-white">{rejectTarget?.course_title}</strong>. The buyer will be
          notified by email.
        </p>
        <textarea
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Reason (optional) — e.g. payment could not be verified"
          rows={3}
          className="input resize-none mb-4"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={rejectMutation.isPending}
            onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })}
          >
            Confirm Reject
          </Button>
        </div>
      </Modal>
    </div>
  );
}