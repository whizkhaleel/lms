import { useForm }    from 'react-hook-form';
import { Link }        from 'react-router-dom';
import { useState }    from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi }     from '../../../shared/api/auth.api';
import Input, { PasswordInput } from '../../../shared/components/ui/input';
import Button          from '../../../shared/components/ui/Button';
import toast           from 'react-hot-toast';

export function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await authApi.forgotPassword(data);
      setSent(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="w-full max-w-md text-center card">
        <div className="text-5xl mb-4">📧</div>
        <h2 className="font-display font-bold text-xl text-white mb-2">Check your inbox</h2>
        <p className="text-gray-400 text-sm mb-5">
          If that email exists, we've sent a reset link. Check your spam folder too.
        </p>
        <Link to="/login" className="btn-primary btn w-full">Back to login</Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="font-display font-bold text-2xl text-white">Reset your password</h1>
        <p className="text-gray-400 text-sm mt-1">
          Enter your email and we'll send a reset link
        </p>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email', { required: 'Email is required' })}
          />
          <Button type="submit" loading={loading} className="w-full">
            Send reset link
          </Button>
        </form>
        <p className="text-center text-sm text-gray-400 mt-4">
          <Link to="/login" className="text-[#3B9EE8] hover:underline">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [params]              = useSearchParams();
  const navigate              = useNavigate();
  const token                 = params.get('token');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const pwd = watch('password');

  const onSubmit = async ({ password }) => {
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password });
      toast.success('Password reset! Please log in.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return (
    <div className="card text-center">
      <p className="text-red-400">Invalid reset link.</p>
      <Link to="/login" className="text-[#3B9EE8] text-sm mt-3 inline-block">Go to login</Link>
    </div>
  );

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="font-display font-bold text-2xl text-white">Set new password</h1>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <PasswordInput
            label="New password"
            error={errors.password?.message}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Min 8 characters' },
              pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Needs uppercase, lowercase, number' },
            })}
          />
          <PasswordInput
            label="Confirm password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', {
              validate: (v) => v === pwd || 'Passwords do not match',
            })}
          />
          <Button type="submit" loading={loading} className="w-full">
            Reset password
          </Button>
        </form>
      </div>
    </div>
  );
}