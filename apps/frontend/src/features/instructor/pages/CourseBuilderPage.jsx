import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../../shared/stores/authStore';
import {
  BookOpen, Plus, Trash2, GripVertical, Video, FileText, HelpCircle,
  ClipboardList, Eye, Upload, ChevronDown, ChevronRight, Save, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/client';
import { coursesApi, lessonsApi } from '../../../shared/api/courses.api';
import { assessmentsApi } from '../../../shared/api/assessments.api';
import { submissionsApi } from '../../../shared/api/submissions.api';
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
  const isExactlyInstructor = useAuthStore(s => s.user?.role === 'instructor');

  const [tab, setTab] = useState(isExactlyInstructor ? 'curriculum' : 'details');
  const [form, setForm] = useState({
    title: '', description: '', shortDescription: '', categoryId: '',
    level: 'beginner', language: 'English',
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
    queryFn: () => coursesApi.categories().then(r => r.data.data?.categories || []),
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
      queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteSectionMut = useMutation({
    mutationFn: (sectionId) => coursesApi.deleteSection(id, sectionId),
    onSuccess: () => {
      setSections(prev => prev.filter(s => s.id !== activeSectionId));
      toast.success('Section deleted');
      queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const publishMut = useMutation({
    mutationFn: () => api.patch(`/courses/${id}/publish`),
    onSuccess: () => {
      toast.success('Course published');
      queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to publish'),
  });

  const unpublishMut = useMutation({
    mutationFn: () => api.patch(`/courses/${id}/unpublish`),
    onSuccess: () => {
      toast.success('Course unpublished');
      queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to unpublish'),
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
      language: form.language || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      requirements: form.requirements ? form.requirements.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      objectives: form.objectives ? form.objectives.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    };

    if (isEditing) {
      updateCourse.mutate(data);
    } else {
      createCourse.mutate(data);
    }
  };

  const handleSectionSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    createSectionMut.mutate(data);
  };

  if (isEditing && isLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">
            {isExactlyInstructor ? 'Manage Curriculum' : isEditing ? 'Edit Course' : 'Create Course'}
          </h1>
          {isEditing && <p className="text-gray-500 text-sm mt-1">{form.title}</p>}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              {courseData?.status === 'published' ? (
                <Button variant="ghost" onClick={() => unpublishMut.mutate()} loading={unpublishMut.isPending}>
                  <EyeOff size={16} /> Unpublish
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => publishMut.mutate()} loading={publishMut.isPending}>
                  <Eye size={16} /> Publish
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate(`/courses/${courseData?.slug}`)}>
                <Eye size={16} /> Preview
              </Button>
            </>
          )}
          {!isExactlyInstructor && (
            <Button onClick={handleSaveDetails} loading={createCourse.isPending || updateCourse.isPending}>
              <Save size={16} /> {isEditing ? 'Save' : 'Create'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-800 mb-6">
        {['details', 'curriculum'].filter(t => !isExactlyInstructor || t !== 'details').map(t => (
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
        onClose={() => { setShowLessonModal(false); setEditingLesson(null); }}
        courseId={id}
        sectionId={activeSectionId}
        lesson={editingLesson}
        onSaved={(newLesson) => {
          if (!editingLesson && newLesson) {
            setEditingLesson(newLesson);
            queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
          } else {
            setShowLessonModal(false);
            setEditingLesson(null);
            queryClient.invalidateQueries({ queryKey: ['course-builder', id] });
          }
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
    title: '', type: 'video', content: '', durationSeconds: '',
  });
  const [videoFile, setVideoFile] = useState(null);
  const [resourceFile, setResourceFile] = useState(null);

  // Quiz builder state
  const [quizForm, setQuizForm] = useState({
    title: '', description: '', passingScorePct: 70, timeLimitMins: '',
    maxAttempts: 1, shuffleQuestions: false,
  });
  const [questions, setQuestions] = useState([]);
  const [savedQuizId, setSavedQuizId] = useState(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQ, setEditingQ] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    type: 'multiple_choice', questionText: '', points: 1, modelAnswer: '',
    options: [{ id: 'a', text: '', is_correct: false }, { id: 'b', text: '', is_correct: false }],
  });

  // Assignment builder state
  const [assignForm, setAssignForm] = useState({
    title: '', instructions: '', maxScore: 100, passingScore: 50,
    dueDate: '', allowTextSubmission: true, allowFileSubmission: true,
    maxFileSizeMb: 50, maxFiles: 3,
  });
  const [savedAssignmentId, setSavedAssignmentId] = useState(null);

  useEffect(() => {
    if (lesson) {
      setForm({
        title: lesson.title || '',
        type: lesson.type || 'video',
        content: lesson.content || '',
        durationSeconds: lesson.duration_seconds?.toString() || '',
      });
    } else {
      setForm({ title: '', type: 'video', content: '', durationSeconds: '' });
    }
    setVideoFile(null);
    setResourceFile(null);
  }, [lesson, open]);

  // Load quiz data when editing a quiz lesson
  useEffect(() => {
    if (isEditing && lesson?.type === 'quiz' && lesson?.quiz_id) {
      assessmentsApi.getQuiz(lesson.quiz_id).then(r => {
        const q = r.data.data.quiz;
        setSavedQuizId(q.id);
        setQuizForm({
          title: q.title || '',
          description: q.description || '',
          passingScorePct: q.passing_score_pct ?? 70,
          timeLimitMins: q.time_limit_mins?.toString() || '',
          maxAttempts: q.max_attempts ?? 1,
          shuffleQuestions: q.shuffle_questions ?? false,
        });
        setQuestions((q.questions || []).map((qst, i) => ({ ...qst, _key: i })));
      }).catch(() => {});
    } else if (lesson?.type !== 'quiz') {
      setSavedQuizId(null);
      setQuestions([]);
    }
  }, [lesson, open]);

  // Load assignment data when editing an assignment lesson
  useEffect(() => {
    if (isEditing && lesson?.type === 'assignment' && lesson?.assignment_id) {
      submissionsApi.getAssignment(lesson.assignment_id).then(r => {
        const a = r.data.data.assignment;
        setSavedAssignmentId(a.id);
        setAssignForm({
          title: a.title || '',
          instructions: a.instructions || '',
          maxScore: a.max_score ?? 100,
          passingScore: a.passing_score ?? 50,
          dueDate: a.due_date ? a.due_date.slice(0, 10) : '',
          allowTextSubmission: a.allow_text_submission ?? true,
          allowFileSubmission: a.allow_file_submission ?? true,
          maxFileSizeMb: a.max_file_size_mb ?? 50,
          maxFiles: a.max_files ?? 3,
        });
      }).catch(() => {});
    } else if (lesson?.type !== 'assignment') {
      setSavedAssignmentId(null);
    }
  }, [lesson, open]);

  const saveMutation = useMutation({
    mutationFn: (data) => isEditing
      ? lessonsApi.update(courseId, lesson.id, data)
      : lessonsApi.create(courseId, { ...data, sectionId }),
    onSuccess: (res) => {
      toast.success(isEditing ? 'Lesson updated' : 'Lesson created');
      const newLesson = res?.data?.data?.lesson || res?.data?.lesson;
      onSaved(newLesson);
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

  // Create/update quiz when lesson is saved
  const saveQuizMut = useMutation({
    mutationFn: (data) => savedQuizId
      ? assessmentsApi.updateQuiz(savedQuizId, data)
      : assessmentsApi.createQuiz(data),
    onSuccess: (res) => {
      const q = res.data.data.quiz;
      setSavedQuizId(q.id);
      toast.success(savedQuizId ? 'Quiz updated' : 'Quiz created');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save quiz'),
  });

  const saveQuestionMut = useMutation({
    mutationFn: (data) => editingQ
      ? assessmentsApi.updateQuestion(savedQuizId, editingQ.id, data)
      : assessmentsApi.addQuestion(savedQuizId, data),
    onSuccess: (res) => {
      const q = res.data.data.question;
      if (editingQ) {
        setQuestions(prev => prev.map(x => x.id === q.id ? { ...q, _key: x._key } : x));
      } else {
        setQuestions(prev => [...prev, { ...q, _key: Date.now() }]);
      }
      setShowQuestionForm(false);
      setEditingQ(null);
      toast.success(editingQ ? 'Question updated' : 'Question added');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save question'),
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (qId) => assessmentsApi.deleteQuestion(savedQuizId, qId),
    onSuccess: () => {
      setQuestions(prev => prev.filter(x => x.id !== editingQ?.id));
      toast.success('Question deleted');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete question'),
  });

  // Save assignment
  const saveAssignMut = useMutation({
    mutationFn: (data) => savedAssignmentId
      ? submissionsApi.updateAssignment(savedAssignmentId, data)
      : submissionsApi.createAssignment(data),
    onSuccess: (res) => {
      const a = res.data.data.assignment;
      setSavedAssignmentId(a.id);
      toast.success(savedAssignmentId ? 'Assignment updated' : 'Assignment created');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save assignment'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      title: form.title,
      type: form.type,
      content: form.content || undefined,
      durationSeconds: form.durationSeconds ? parseInt(form.durationSeconds, 10) : undefined,
    };
    saveMutation.mutate(data);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Lesson' : 'Add Lesson'} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] pr-1">
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

        {/* ── Quiz Builder ── */}
        {isEditing && form.type === 'quiz' && (
          <div className="border-t border-gray-800 pt-4 mt-2 space-y-4">
            <h3 className="font-semibold text-white text-lg">Quiz Settings</h3>
            <Input label="Quiz title" value={quizForm.title}
              onChange={e => setQuizForm(p => ({ ...p, title: e.target.value }))} />
            <div>
              <label className="text-sm font-medium text-gray-300 mb-1.5 block">Description</label>
              <textarea value={quizForm.description}
                onChange={e => setQuizForm(p => ({ ...p, description: e.target.value }))}
                rows={2} className="input resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Passing score (%)" type="number" value={quizForm.passingScorePct}
                onChange={e => setQuizForm(p => ({ ...p, passingScorePct: +e.target.value }))} />
              <Input label="Time limit (min)" type="number" value={quizForm.timeLimitMins}
                onChange={e => setQuizForm(p => ({ ...p, timeLimitMins: e.target.value }))} />
              <Input label="Max attempts" type="number" value={quizForm.maxAttempts}
                onChange={e => setQuizForm(p => ({ ...p, maxAttempts: +e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={quizForm.shuffleQuestions}
                onChange={e => setQuizForm(p => ({ ...p, shuffleQuestions: e.target.checked }))} />
              Shuffle questions
            </label>
            <div className="flex justify-end">
              <Button onClick={() => {
                saveQuizMut.mutate({ lessonId: lesson.id, courseId, ...quizForm, timeLimitMins: quizForm.timeLimitMins ? parseInt(quizForm.timeLimitMins) : null });
              }} loading={saveQuizMut.isPending}><Save size={14} /> Save Quiz</Button>
            </div>

            {/* Questions */}
            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-white">Questions ({questions.length})</h4>
                <Button variant="secondary" size="sm" onClick={() => {
                  setEditingQ(null);
                  setQuestionForm({ type: 'multiple_choice', questionText: '', points: 1, modelAnswer: '', options: [
                    { id: 'a', text: '', is_correct: false }, { id: 'b', text: '', is_correct: false },
                  ]});
                  setShowQuestionForm(true);
                }}><Plus size={14} /> Add Question</Button>
              </div>
              {questions.map((q, i) => (
                <div key={q._key ?? q.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02] group">
                  <div className="text-sm text-gray-300">
                    <span className="text-gray-600 mr-2">{i + 1}.</span>
                    <span>{q.question_text}</span>
                    <span className="text-xs text-gray-600 ml-2">({q.type} · {q.points}pt)</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button className="btn-ghost p-1 rounded text-xs" onClick={() => {
                      setEditingQ(q);
                      setQuestionForm({
                        type: q.type, questionText: q.question_text, points: q.points,
                        modelAnswer: q.model_answer || '',
                        options: (q.options || []).map(o => ({ ...o })),
                      });
                      setShowQuestionForm(true);
                    }}>Edit</button>
                    <button className="btn-ghost p-1 rounded text-xs text-red-400" onClick={() => {
                      setEditingQ(q);
                      deleteQuestionMut.mutate(q.id);
                    }}>Del</button>
                  </div>
                </div>
              ))}
              {questions.length === 0 && <p className="text-gray-600 text-sm">No questions yet</p>}
            </div>
          </div>
        )}

        {/* ── Assignment Builder ── */}
        {isEditing && form.type === 'assignment' && (
          <div className="border-t border-gray-800 pt-4 mt-2 space-y-4">
            <h3 className="font-semibold text-white text-lg">Assignment Settings</h3>
            <Input label="Assignment title" value={assignForm.title}
              onChange={e => setAssignForm(p => ({ ...p, title: e.target.value }))} />
            <div>
              <label className="text-sm font-medium text-gray-300 mb-1.5 block">Instructions</label>
              <textarea value={assignForm.instructions}
                onChange={e => setAssignForm(p => ({ ...p, instructions: e.target.value }))}
                rows={4} className="input resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Max score" type="number" value={assignForm.maxScore}
                onChange={e => setAssignForm(p => ({ ...p, maxScore: +e.target.value }))} />
              <Input label="Passing score" type="number" value={assignForm.passingScore}
                onChange={e => setAssignForm(p => ({ ...p, passingScore: +e.target.value }))} />
            </div>
            <Input label="Due date" type="date" value={assignForm.dueDate}
              onChange={e => setAssignForm(p => ({ ...p, dueDate: e.target.value }))} />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={assignForm.allowTextSubmission}
                  onChange={e => setAssignForm(p => ({ ...p, allowTextSubmission: e.target.checked }))} />
                Text submission
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={assignForm.allowFileSubmission}
                  onChange={e => setAssignForm(p => ({ ...p, allowFileSubmission: e.target.checked }))} />
                File submission
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => {
                saveAssignMut.mutate({ lessonId: lesson.id, courseId, ...assignForm, dueDate: assignForm.dueDate || null });
              }} loading={saveAssignMut.isPending}><Save size={14} /> Save Assignment</Button>
            </div>
          </div>
        )}

        {/* ── Question Form Modal ── */}
        <Modal open={showQuestionForm} onClose={() => { setShowQuestionForm(false); setEditingQ(null); }}
          title={editingQ ? 'Edit Question' : 'Add Question'} size="md">
          <div className="flex flex-col gap-4 overflow-y-auto max-h-[60vh] pr-1">
            <Select label="Type" value={questionForm.type}
              onChange={e => setQuestionForm(p => ({ ...p, type: e.target.value }))}>
              <option value="multiple_choice">Multiple Choice</option>
              <option value="multi_select">Multi Select</option>
              <option value="true_false">True / False</option>
              <option value="short_answer">Short Answer</option>
            </Select>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-1.5 block">Question</label>
              <textarea value={questionForm.questionText}
                onChange={e => setQuestionForm(p => ({ ...p, questionText: e.target.value }))}
                rows={2} className="input resize-none" />
            </div>
            <Input label="Points" type="number" value={questionForm.points}
              onChange={e => setQuestionForm(p => ({ ...p, points: +e.target.value }))} />
            {questionForm.type !== 'short_answer' && (
              <div>
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">Options</label>
                {questionForm.options.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2 mb-2">
                    <input type={questionForm.type === 'multiple_choice' ? 'radio' : 'checkbox'}
                      name="correctOpt" checked={opt.is_correct}
                      onChange={() => {
                        const newOpts = questionForm.options.map(o => ({
                          ...o, is_correct: questionForm.type === 'multiple_choice' ? o.id === opt.id : questionForm.type === 'multi_select' ? (o.id === opt.id ? !o.is_correct : o.is_correct) : o.is_correct,
                        }));
                        setQuestionForm(p => ({ ...p, options: newOpts }));
                      }} className="mr-1" />
                    <input className="input flex-1 text-sm" value={opt.text}
                      onChange={e => {
                        const newOpts = questionForm.options.map(o => o.id === opt.id ? { ...o, text: e.target.value } : o);
                        setQuestionForm(p => ({ ...p, options: newOpts }));
                      }} placeholder={`Option ${i + 1}`} />
                    {questionForm.options.length > 2 && (
                      <button className="text-red-400 text-xs"
                        onClick={() => setQuestionForm(p => ({ ...p, options: p.options.filter(o => o.id !== opt.id) }))}>
                        X
                      </button>
                    )}
                  </div>
                ))}
                <button className="text-xs text-[#3B9EE8] mt-1"
                  onClick={() => {
                    const newId = String.fromCharCode(97 + questionForm.options.length);
                    setQuestionForm(p => ({ ...p, options: [...p.options, { id: newId, text: '', is_correct: false }] }));
                  }}>
                  + Add option
                </button>
              </div>
            )}
            {questionForm.type === 'short_answer' && (
              <div>
                <label className="text-sm font-medium text-gray-300 mb-1.5 block">Model answer (optional)</label>
                <textarea value={questionForm.modelAnswer}
                  onChange={e => setQuestionForm(p => ({ ...p, modelAnswer: e.target.value }))}
                  rows={2} className="input resize-none" />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
              <Button variant="secondary" type="button" onClick={() => { setShowQuestionForm(false); setEditingQ(null); }}>Cancel</Button>
              <Button onClick={() => {
                if (!savedQuizId) { toast.error('Save the quiz first'); return; }
                saveQuestionMut.mutate(questionForm);
              }} loading={saveQuestionMut.isPending}>{editingQ ? 'Update' : 'Add'}</Button>
            </div>
          </div>
        </Modal>

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
