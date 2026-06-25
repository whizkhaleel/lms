import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import Input, { Textarea, Select } from '../../../shared/components/ui/input';
import Button from '../../../shared/components/ui/Button';

export default function AdminCreateCoursePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/courses/categories').then(r => r.data.data?.categories || []),
  });

  const { data: instructors } = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get('/users', { params: { role: 'instructor', limit: 200 } })
      .then(r => r.data.data || []),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/courses', data),
    onSuccess: () => {
      toast.success('Course created');
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] });
      navigate('/admin/courses');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create course'),
  });

  const [form, setForm] = useState({
    title: '',
    shortDescription: '',
    description: '',
    categoryId: '',
    level: 'beginner',
    language: 'English',
    instructorId: '',
    tags: '',
    objectives: '',
    requirements: '',
  });

  const [errors, setErrors] = useState({});

  function validate() {
    const errs = {};
    if (!form.title || form.title.trim().length < 5) errs.title = 'Title must be at least 5 characters';
    if (!form.instructorId) errs.instructorId = 'Select an instructor';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleChange(field) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setForm(prev => ({ ...prev, [field]: value }));
      if (errors[field]) setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const tags = form.tags
      ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;

    const objectives = form.objectives
      ? form.objectives.split('\n').map(t => t.trim()).filter(Boolean)
      : undefined;

    const requirements = form.requirements
      ? form.requirements.split('\n').map(t => t.trim()).filter(Boolean)
      : undefined;

    createMutation.mutate({
      title: form.title.trim(),
      shortDescription: form.shortDescription.trim() || undefined,
      description: form.description.trim() || undefined,
      categoryId: form.categoryId || undefined,
      level: form.level,
      language: form.language,
      instructorId: form.instructorId,
      tags,
      objectives,
      requirements,
    });
  }

  const catList = Array.isArray(categories) ? categories : [];
  const instList = Array.isArray(instructors) ? instructors : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/courses')} className="btn-ghost p-2 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Create Course</h1>
          <p className="text-gray-400 text-sm mt-0.5">Assign a new course to an instructor</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <div className="card space-y-5">
          <h2 className="font-semibold text-white text-lg">Course Details</h2>

          <Input label="Course Title *" placeholder="e.g. Advanced React Patterns"
            value={form.title} onChange={handleChange('title')} error={errors.title} />

          <Input label="Short Description" placeholder="A brief tagline (max 500 chars)"
            value={form.shortDescription} onChange={handleChange('shortDescription')} />

          <Textarea label="Full Description" rows={5} placeholder="Detailed course description..."
            value={form.description} onChange={handleChange('description')} />

          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={form.categoryId} onChange={handleChange('categoryId')}>
              <option value="">— Select —</option>
              {catList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>

            <Select label="Level" value={form.level} onChange={handleChange('level')}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </div>

          <Input label="Language" placeholder="e.g. English"
            value={form.language} onChange={handleChange('language')} />
        </div>

        <div className="card space-y-5">
          <h2 className="font-semibold text-white text-lg">Instructor Assignment</h2>

          <Select label="Assign Instructor *" value={form.instructorId} onChange={handleChange('instructorId')} error={errors.instructorId}>
            <option value="">— Select an instructor —</option>
            {instList.map(u => (
              <option key={u.id} value={u.id}>{u.first_name || u.firstName} {u.last_name || u.lastName} ({u.email})</option>
            ))}
          </Select>
        </div>

        <div className="card space-y-5">
          <h2 className="font-semibold text-white text-lg">Metadata</h2>

          <Input label="Tags" placeholder="Comma-separated: react, typescript, hooks"
            value={form.tags} onChange={handleChange('tags')} />

          <Textarea label="Objectives (one per line)" rows={4} placeholder="Build a full-stack app from scratch&#10;Master React hooks and patterns&#10;Deploy to production"
            value={form.objectives} onChange={handleChange('objectives')} />

          <Textarea label="Requirements (one per line)" rows={3} placeholder="Basic JavaScript knowledge&#10;Node.js installed"
            value={form.requirements} onChange={handleChange('requirements')} />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={createMutation.isPending}>
            <Save size={16} /> Create Course
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/admin/courses')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
