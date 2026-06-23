import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen, Plus, Trash2, GripVertical, Video, FileText, HelpCircle,
  ClipboardList, Eye, Upload, ChevronDown, ChevronRight, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import { coursesApi, lessonsApi } from '../../../shared/api/courses.api';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Input, { Textarea, Select } from '../../../shared/components/ui/input';
import Modal from '../../../shared/components/ui/modal';
import { clsx } from 'clsx';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const LESSON_TYPES = [
  { value: 'video', label: 'Video', icon: Video },
  { value: 'text', label: 'Text', icon: FileText },
  { value: 'quiz', label: 'Quiz', icon: HelpCircle },
  { value: 'assignment', label: 'Assignment', icon: ClipboardList },
];

export default function CourseBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const [tab, setTab] = useState('details');
  const [form, setForm] = useState({
    title: '', description: '', shortDescription: '', categoryId: '',
    level: 'beginner', isFree: true, price: '', language: 'English',
    tags: '', requirements: '', objectives: '',
  });
  const [sections, setSections] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [editingLesson, setEditingLesson] = useState(null);

  // Fetch course data for editing
  const { data: courseData, isLoading } = useQuery({
    queryKey: ['course-builder', id],
    queryFn: () => api.get(`/courses/my-courses`).then(r => {
      const course = r.data.data?.find(c => c.id === id);
      if (!course) throw new Error('Course not found');
      // Fetch full detail with sections/lessons
      return api.get(`/courses/${course.slug}`).then(r2 => {
        const c = r2.data.data.course;
        setForm({
          title: c.title || '',
          description: c.description || '',
          shortDescription: c.short_description || '',
          categoryId: c.category_id || '',
          level: c.level || 'beginner',
          isFree: c.is_free ?? true,
          price: c.price?.toString() || '',
          language: c.language || 'English',
          tags: (c.tags || []).join(', '),
          requirements: (c.requirements || []).join(', '),
          objectives: (c.objectives || []).join(', '),
        });
        setSections(c.sections || []);
        const expanded = {};
        (c.sections || []).forEach(s => { expanded[s.id] = true; });
        setExpandedSections(expanded);
        return c;
      });
    }),
    enabled: isEditing,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => coursesApi.categories().then(r => r.data.data || []),
  });

  const createCourse = useMutation({
    mutationFn: (data) => coursesApi.create(data),
    onSuccess: (res) => {
      toast.success('Course created');
      navigate(`/instructor/courses/${res.data.data.course.id}/edit`);
      queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const updateCourse = useMutation({
    mutationFn: (data) => coursesApi.update(id, data),
    onSuccess: () => {
      toast.success('Course saved');
      queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
      queryClient.invalidateQueries({ queryKey: ['instructor-courses'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const createSectionMut = useMutation({
    mutationFn: (data) => coursesApi.createSection(id, data),
    onSuccess: (res) => {
      setSections(prev => [...prev, res.data.data.section]);
      setShowSectionModal(false);
      toast.success('Section added');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteSectionMut = useMutation({
    mutationFn: (sectionId) => coursesApi.deleteSection(id, sectionId),
    onSuccess: () => {
      setSections(prev => prev.filter(s => s.id !== activeSectionId));
      toast.success('Section deleted');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const thumbnailMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('thumbnail', file);
      return coursesApi.uploadThumbnail(id, fd);
    },
    onSuccess: () => {
      toast.success('Thumbnail uploaded');
      queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const handleSaveDetails = () => {
    const data = {
      title: form.title,
      description: form.description || undefined,
      shortDescription: form.shortDescription || undefined,
      categoryId: form.categoryId || undefined,
      level: form.level,
      isFree: form.isFree,
      language: form.language || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      requirements: form.requirements ? form.requirements.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      objectives: form.objectives ? form.objectives.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };
    if (!form.isFree) data.price = parseFloat(form.price) || 0;

    if (isEditing) {
      updateCourse.mutate(data);
    } else {
      createCourse.mutate(data);
    }
  };

  const handleSectionSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    createSectionMut.mutate(Object.fromEntries(fd));
  };

  if (isEditing && isLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">
            {isEditing ? 'Edit Course' : 'Create Course'}
          </h1>
          {isEditing && <p className="text-gray-500 text-sm mt-1">{form.title}</p>}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button variant="ghost" onClick={() => navigate(`/courses/${courseData?.slug}`)}>
              <Eye size={16} /> Preview
            </Button>
          )}
          <Button onClick={handleSaveDetails} loading={createCourse.isPending || updateCourse.isPending}>
            <Save size={16} /> {isEditing ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-800 mb-6">
        {['details', 'curriculum'].map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={clsx('px-5 py-3 text-sm font-medium capitalize border-b-2 transition-colors',
              tab === t ? 'border-[#3B9EE8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            )}
          >
            {t === 'details' ? 'Course Details' : 'Curriculum'}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="max-w-2xl space-y-5">
          <Input label="Course title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Introduction to Web Development" />

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={5} className="input resize-none" placeholder="Full course description…" />
          </div>

          <Input label="Short description" value={form.shortDescription}
            onChange={e => setForm(p => ({ ...p, shortDescription: e.target.value }))}
            placeholder="Brief summary shown in course cards" />

          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={form.categoryId}
              onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
              <option value="">Select category</option>
              {(categories || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select label="Level" value={form.level}
              onChange={e => setForm(p => ({ ...p, level: e.target.value }))}>
              {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isFree}
                onChange={e => setForm(p => ({ ...p, isFree: e.target.checked }))}
                className="rounded border-gray-600 bg-gray-800 text-[#3B9EE8] focus:ring-[#3B9EE8]" />
              <span className="text-sm text-gray-300">Free course</span>
            </label>
            {!form.isFree && (
              <Input label="Price (NGN)" type="number" value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                className="w-40" placeholder="15000" />
            )}
          </div>

          <Input label="Language" value={form.language}
            onChange={e => setForm(p => ({ ...p, language: e.target.value }))} />

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Tags (comma separated)</label>
            <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              className="input" placeholder="html, css, javascript" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Requirements (one per line)</label>
            <textarea value={form.requirements}
              onChange={e => setForm(p => ({ ...p, requirements: e.target.value }))}
              rows={3} className="input resize-none" placeholder="Basic computer skills, Internet access" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Objectives (one per line)</label>
            <textarea value={form.objectives}
              onChange={e => setForm(p => ({ ...p, objectives: e.target.value }))}
              rows={3} className="input resize-none" placeholder="Build a REST API, Deploy to production" />
          </div>

          {isEditing && (
            <div>
              <label className="text-sm font-medium text-gray-300 mb-1.5 block">Thumbnail</label>
              <div className="flex items-center gap-4">
                <label className="btn-secondary btn cursor-pointer">
                  <Upload size={14} /> Upload Image
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { if (e.target.files[0]) thumbnailMut.mutate(e.target.files[0]); }} />
                </label>
                {thumbnailMut.isPending && <Spinner size="sm" />}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'curriculum' && (
        <div>
          {!isEditing ? (
            <div className="text-center py-20 text-gray-500">
              <BookOpen size={40} className="mx-auto mb-3 text-gray-700" />
              <p className="font-medium">Save the course first to add curriculum</p>
              <p className="text-sm mt-1">Fill in the course details and click Create</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  {sections.length} section{sections.length !== 1 ? 's' : ''} — {sections.reduce((sum, s) => sum + (s.lessons?.length || 0), 0)} lessons
                </p>
                <Button onClick={() => setShowSectionModal(true)}><Plus size={16} /> Section</Button>
              </div>

              <div className="space-y-3">
                {sections.map((section, si) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={si}
                    courseId={id}
                    isExpanded={expandedSections[section.id]}
                    onToggle={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                    onDelete={() => { setActiveSectionId(section.id); deleteSectionMut.mutate(section.id); }}
                    onAddLesson={() => { setActiveSectionId(section.id); setEditingLesson(null); setShowLessonModal(true); }}
                    onEditLesson={(lesson) => { setActiveSectionId(section.id); setEditingLesson(lesson); setShowLessonModal(true); }}
                  />
                ))}
              </div>

              {sections.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-gray-800 rounded-xl">
                  <BookOpen size={36} className="mx-auto mb-3 text-gray-700" />
                  <p className="text-gray-500">No sections yet. Add your first section.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section modal */}
      <Modal open={showSectionModal} onClose={() => setShowSectionModal(false)} title="Add Section" size="sm">
        <form onSubmit={handleSectionSubmit} className="flex flex-col gap-4">
          <Input label="Section title" name="title" required placeholder="e.g. Getting Started" />
          <Textarea label="Description (optional)" name="description" rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowSectionModal(false)}>Cancel</Button>
            <Button type="submit" loading={createSectionMut.isPending}>Add</Button>
          </div>
        </form>
      </Modal>

      {/* Lesson modal */}
      <LessonModal
        open={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        courseId={id}
        sectionId={activeSectionId}
        lesson={editingLesson}
        onSaved={() => {
          setShowLessonModal(false);
          queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
        }}
      />
    </div>
  );
}

function SectionCard({ section, index, courseId, isExpanded, onToggle, onDelete, onAddLesson, onEditLesson }) {
  const lessons = section.lessons || [];

  return (
    <div className="card">
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <GripVertical size={16} className="text-gray-600 cursor-grab" />
          <div>
            <p className="font-medium text-white">
              Section {index + 1}: {section.title}
            </p>
            <p className="text-xs text-gray-500">{lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); onAddLesson(); }}
            className="btn-ghost p-1.5 rounded-lg" title="Add lesson">
            <Plus size={14} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="btn-ghost p-1.5 rounded-lg text-red-400" title="Delete section">
            <Trash2 size={14} />
          </button>
          {isExpanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-2 space-y-1">
          {lessons.map((lesson, li) => (
            <div key={lesson.id}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02] cursor-pointer group"
              onClick={() => onEditLesson(lesson)}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-5 text-right">{li + 1}.</span>
                <LessonTypeIcon type={lesson.type} />
                <span className="text-sm text-gray-300">{lesson.title}</span>
                {lesson.is_free_preview && (
                  <span className="badge badge-green text-[10px]">Preview</span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); onEditLesson(lesson); }}
                  className="btn-ghost p-1 rounded text-gray-500 hover:text-white">
                  Edit
                </button>
              </div>
            </div>
          ))}
          {lessons.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-4">No lessons yet</p>
          )}
        </div>
      )}
    </div>
  );
}

function LessonTypeIcon({ type }) {
  const map = { video: Video, text: FileText, quiz: HelpCircle, assignment: ClipboardList };
  const Icon = map[type] || FileText;
  return <Icon size={14} className="text-gray-500" />;
}

function LessonModal({ open, onClose, courseId, sectionId, lesson, onSaved }) {
  const isEditing = !!lesson;
  const [form, setForm] = useState({
    title: '', type: 'video', content: '', isFreePreview: false, durationSeconds: '',
  });
  const [videoFile, setVideoFile] = useState(null);
  const [resourceFile, setResourceFile] = useState(null);

  useEffect(() => {
    if (lesson) {
      setForm({
        title: lesson.title || '',
        type: lesson.type || 'video',
        content: lesson.content || '',
        isFreePreview: lesson.is_free_preview || false,
        durationSeconds: lesson.duration_seconds?.toString() || '',
      });
    } else {
      setForm({ title: '', type: 'video', content: '', isFreePreview: false, durationSeconds: '' });
    }
    setVideoFile(null);
    setResourceFile(null);
  }, [lesson, open]);

  const saveMutation = useMutation({
    mutationFn: (data) => isEditing
      ? lessonsApi.update(courseId, lesson.id, data)
      : lessonsApi.create(courseId, { ...data, sectionId }),
    onSuccess: () => {
      toast.success(isEditing ? 'Lesson updated' : 'Lesson created');
      onSaved();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const videoMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('video', file);
      return lessonsApi.uploadVideo(courseId, lesson?.id, fd);
    },
    onSuccess: () => toast.success('Video uploaded'),
    onError: (err) => toast.error(err.response?.data?.message || 'Upload failed'),
  });

  const resourceMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('resource', file);
      return lessonsApi.uploadResource(courseId, lesson?.id, fd);
    },
    onSuccess: () => toast.success('Resource uploaded'),
    onError: (err) => toast.error(err.response?.data?.message || 'Upload failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      title: form.title,
      type: form.type,
      content: form.content || undefined,
      isFreePreview: form.isFreePreview,
      durationSeconds: form.durationSeconds ? parseInt(form.durationSeconds, 10) : undefined,
    };
    saveMutation.mutate(data);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Lesson' : 'Add Lesson'} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Lesson title" value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          required placeholder="e.g. Introduction to HTML" />

        <Select label="Lesson type" value={form.type}
          onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
          {LESSON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>

        {form.type === 'text' && (
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Content</label>
            <textarea value={form.content}
              onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              rows={8} className="input resize-none font-mono text-sm" placeholder="Markdown content…" />
          </div>
        )}

        <Input label="Duration (seconds)" type="number" value={form.durationSeconds}
          onChange={e => setForm(p => ({ ...p, durationSeconds: e.target.value }))}
          placeholder="e.g. 600" />

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isFreePreview}
            onChange={e => setForm(p => ({ ...p, isFreePreview: e.target.checked }))}
            className="rounded border-gray-600 bg-gray-800 text-[#3B9EE8] focus:ring-[#3B9EE8]" />
          <span className="text-sm text-gray-300">Free preview (non-enrolled users can watch)</span>
        </label>

        {isEditing && form.type === 'video' && (
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Video upload</label>
            <input type="file" accept="video/*" onChange={e => {
              if (e.target.files[0]) { setVideoFile(e.target.files[0]); videoMut.mutate(e.target.files[0]); }
            }} className="text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#1A6FBF] file:text-white file:text-sm" />
            {videoMut.isPending && <Spinner size="sm" />}
          </div>
        )}

        {isEditing && (
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Resource file (PDF etc.)</label>
            <input type="file" onChange={e => {
              if (e.target.files[0]) { setResourceFile(e.target.files[0]); resourceMut.mutate(e.target.files[0]); }
            }} className="text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#1A6FBF] file:text-white file:text-sm" />
            {resourceMut.isPending && <Spinner size="sm" />}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saveMutation.isPending}>
            {isEditing ? 'Update' : 'Create'} Lesson
          </Button>
        </div>
      </form>
    </Modal>
  );
}
