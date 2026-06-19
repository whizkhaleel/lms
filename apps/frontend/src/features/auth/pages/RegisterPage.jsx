import { useForm } from 'react-hook-form';
import { Link }    from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../../../shared/hooks/useAuth';
import Input       from '../../../shared/components/ui/input';
import Button      from '../../../shared/components/ui/Button';

export default function RegisterPage() {
  const { register: registerUser, registerLoading } = useAuth();
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const pwd = watch('password');

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 bg-[#1A6FBF] rounded-2xl flex items-center justify-center mb-4">
          <BookOpen size={28} className="text-white" />
        </div>
        <h1 className="font-display font-bold text-2xl text-white">Create your account</h1>
        <p className="text-gray-400 text-sm mt-1">Start your learning journey today</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit(registerUser)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              placeholder="Yaseer"
              error={errors.firstName?.message}
              {...register('firstName', { required: 'Required' })}
            />
            <Input
              label="Last name"
              placeholder="Ibrahim"
              error={errors.lastName?.message}
              {...register('lastName', { required: 'Required' })}
            />
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern:  { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
            })}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Min 8 characters"
            error={errors.password?.message}
            {...register('password', {
              required:  'Password is required',
              minLength: { value: 8, message: 'Min 8 characters' },
              pattern: {
                value:   /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                message: 'Must contain uppercase, lowercase, and number',
              },
            })}
          />

          <Input
            label="Confirm password"
            type="password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', {
              required:  'Please confirm your password',
              validate: (v) => v === pwd || 'Passwords do not match',
            })}
          />

          <Button type="submit" loading={registerLoading} className="w-full mt-1">
            Create account
          </Button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-[#3B9EE8] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}