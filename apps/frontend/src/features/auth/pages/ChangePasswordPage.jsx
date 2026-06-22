import { useForm }   from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import toast          from 'react-hot-toast';
import api             from '../../../shared/api/client';
import { useAuthStore } from '../../../shared/stores/authStore';
import Input           from '../../../shared/components/ui/input';
import Button          from '../../../shared/components/ui/Button';
import { useState }    from 'react';

export default function ChangePasswordPage() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { updateUser, user } = useAuthStore();
  const forced    = location.state?.forced;
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const newPwd = watch('newPassword');

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.patch('/users/password', {
        currentPassword: data.currentPassword,
        newPassword:     data.newPassword,
      });
      updateUser({ must_change_password: false });
      toast.success('Password updated successfully');
      const dest = ['admin','super_admin'].includes(user?.role) ? '/admin'
                 : user?.role === 'instructor' ? '/instructor'
                 : '/dashboard';
      navigate(dest);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 bg-[#1A6FBF] rounded-2xl flex items-center justify-center mb-4">
          <ShieldCheck size={28} className="text-white" />
        </div>
        <h1 className="font-display font-bold text-2xl text-white">
          {forced ? 'Set a new password' : 'Change password'}
        </h1>
        <p className="text-gray-400 text-sm mt-1 text-center">
          {forced
            ? 'For your security, please replace the temporary password you were emailed.'
            : 'Update your account password.'}
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label={forced ? 'Temporary password' : 'Current password'}
            type="password"
            placeholder="••••••••"
            error={errors.currentPassword?.message}
            {...register('currentPassword', { required: 'Required' })}
          />
          <Input
            label="New password"
            type="password"
            placeholder="Min 8 characters"
            error={errors.newPassword?.message}
            {...register('newPassword', {
              required:  'Required',
              minLength: { value: 8, message: 'Min 8 characters' },
              pattern: {
                value:   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                message: 'Must contain uppercase, lowercase, and number',
              },
            })}
          />
          <Input
            label="Confirm new password"
            type="password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', {
              validate: (v) => v === newPwd || 'Passwords do not match',
            })}
          />
          <Button type="submit" loading={loading} className="w-full mt-1">
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}