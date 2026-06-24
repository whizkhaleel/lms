import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/input';

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings').then(r => r.data.data.settings),
  });

  const saveMutation = useMutation({
    mutationFn: (body) => api.put('/admin/settings', body),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save settings'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    saveMutation.mutate(Object.fromEntries(fd));
  };

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const s = data || {};

  const fields = [
    { key: 'institution_name',    label: 'Institution Name',    type: 'text' },
    { key: 'institution_tagline', label: 'Tagline',             type: 'text' },
    { key: 'institution_email',    label: 'Email',               type: 'email' },
    { key: 'institution_phone',    label: 'Phone',               type: 'text' },
    { key: 'institution_address',  label: 'Address',             type: 'text' },
    { key: 'institution_website',  label: 'Website',             type: 'url' },
    { key: 'institution_logo_url', label: 'Logo URL',            type: 'url' },
    { key: 'academic_year',        label: 'Academic Year',       type: 'text' },
    { key: 'default_timezone',     label: 'Default Timezone',    type: 'text' },
    { key: 'default_currency',     label: 'Default Currency',    type: 'text' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-white">Institution Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Manage platform-wide configuration</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl flex flex-col gap-4">
        {fields.map(({ key, label, type }) => (
          <Input key={key} label={label} name={key} type={type}
            defaultValue={s[key] || ''} />
        ))}
        <div className="flex justify-end pt-2">
          <Button type="submit" loading={saveMutation.isPending}>
            <Save size={16} /> Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
