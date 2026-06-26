import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { authApi } from '../../../shared/api/auth.api';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    let cancelled = false;
    authApi.verifyEmail(token)
      .then((res) => {
        if (!cancelled) {
          setStatus('success');
          setMessage(res.data?.message || 'Email verified successfully!');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setMessage(err.response?.data?.message || 'Verification failed. The link may have expired.');
        }
      });

    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="w-full max-w-md">
      <div className="card text-center">
        {status === 'loading' && (
          <div className="py-8">
            <Loader2 size={40} className="animate-spin text-[#3B9EE8] mx-auto mb-4" />
            <p className="text-gray-400">Verifying your email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-8">
            <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
            <h2 className="font-display font-bold text-xl text-white mb-2">Email Verified</h2>
            <p className="text-gray-400 text-sm mb-6">{message}</p>
            <Link to="/login" className="btn-primary btn w-full">Go to login</Link>
          </div>
        )}

        {status === 'error' && (
          <div className="py-8">
            <XCircle size={48} className="text-red-400 mx-auto mb-4" />
            <h2 className="font-display font-bold text-xl text-white mb-2">Verification Failed</h2>
            <p className="text-gray-400 text-sm mb-6">{message}</p>
            <Link to="/login" className="btn-primary btn w-full">Back to login</Link>
          </div>
        )}
      </div>
    </div>
  );
}
