import { useForm }   from 'react-hook-form';
import { Link }       from 'react-router-dom';
import { BookOpen }   from 'lucide-react';
import { useAuth }    from '../../../shared/hooks/useAuth';
import Input          from '../../../shared/components/ui/input';
import Button         from '../../../shared/components/ui/Button';

export default function LoginPage() {
  const { login, loginLoading } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm();

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 bg-[#1A6FBF] rounded-2xl flex items-center justify-center mb-4">
          <BookOpen size={28} className="text-white" />
        </div>
        <h1 className="font-display font-bold text-2xl text-white">Welcome back</h1>
        <p className="text-gray-400 text-sm mt-1">Sign in to continue learning</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit(login)} className="flex flex-col gap-4">
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
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password', { required: 'Password is required' })}
          />

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs text-[#3B9EE8] hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" loading={loginLoading} className="w-full mt-1">
            Sign in
          </Button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#3B9EE8] hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}