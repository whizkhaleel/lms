import { useForm }   from 'react-hook-form';
import { Link }       from 'react-router-dom';
import { BookOpen }   from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth }    from '../../../shared/hooks/useAuth';
import Input, { PasswordInput } from '../../../shared/components/ui/input';
import Button         from '../../../shared/components/ui/Button';

export default function LoginPage() {
  const { login, loginLoading } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [logoError, setLogoError] = useState(false);
  const [institutionName, setInstitutionName] = useState('Shaheed Mahmoud Academy');
  const [logoUrl, setLogoUrl] = useState('/logo.jpg');

  useEffect(() => {
    fetch('/api/v1/admin/settings')
      .then(r => r.json())
      .then(d => {
        if (d?.data?.settings) {
          setInstitutionName(d.data.settings.institution_name || 'Shaheed Mahmoud Academy');
          setLogoUrl(d.data.settings.institution_logo_url || '/logo.jpg');
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-[#1A6FBF] rounded-2xl flex items-center justify-center mb-4 overflow-hidden">
          {logoError ? (
            <BookOpen size={28} className="text-white" />
          ) : (
            <img src={logoUrl} alt={institutionName} className="w-full h-full object-cover"
              onError={() => setLogoError(true)} />
          )}
        </div>
        <h1 className="font-display font-bold text-2xl text-center" style={{ color: 'var(--text-primary)' }}>{institutionName}</h1>
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
          <PasswordInput
            label="Password"
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
          Accounts are created by the administrator. Contact support if you need access.
        </p>
      </div>
    </div>
  );
}