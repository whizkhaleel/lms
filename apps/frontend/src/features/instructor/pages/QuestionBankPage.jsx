import { useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Save, X, ChevronDown, ChevronRight, FolderOpen,
  HelpCircle, Edit3, ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { questionBankApi } from '../../../shared/api/question-bank.api';
import Spinner from '../../../shared/components/ui/spinner';
import Button from '../../../shared/components/ui/Button';
import Input, { Textarea, Select } from '../../../shared/components/ui/input';
import Modal from '../../../shared/components/ui/modal';
import { clsx } from 'clsx';

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'multi_select',    label: 'Multi Select' },
  { value: 'true_false',      label: 'True / False' },
  { value: 'short_answer',    label: 'Short Answer' },
];

export default function QuestionBankPage() {
  const { id: courseId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [editingCat, setEditingCat] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);

  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [editingQ, setEditingQ] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    categoryId: '', type: 'multiple_choice', questionText: '', points: 1,
    modelAnswer: '', explanation: '', options: [
      { id: 'a', text: '', is_correct: false },
      { id: 'b', text: '', is_correct: false },
    ],
  });

  const [expandedCats, setExpandedCats] = useState({});

  // Fetch categories
  const { data: catsData, isLoading: catsLoading } = useQuery({
    queryKey: ['question-bank-categories', courseId],
    queryFn: () => questionBankApi.listCategories(courseId).then(r => r.data.data?.categories || []),
  });
  const categories = catsData || [];

  // Fetch questions
  const { data: questionsData, isLoading: qsLoading } = useQuery({
    queryKey: ['question-bank-questions', courseId],
    queryFn: () => questionBankApi.listQuestions(courseId).then(r => r.data.data?.questions || []),
  });
  const questions = questionsData || [];

  // Mutations
  const createCatMut = useMutation({
    mutationFn: (data) => questionBankApi.createCategory(courseId, { name: data.name }),
    onSuccess: (res) => {
      toast.success('Category created');
      setShowCategoryForm(false);
      setCategoryForm({ name: '' });
      queryClient.invalidateQueries({ queryKey: ['question-bank-categories', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteCatMut = useMutation({
    mutationFn: (catId) => questionBankApi.deleteCategory(courseId, catId),
    onSuccess: () => {
      toast.success('Category deleted');
      setSelectedCat(null);
      queryClient.invalidateQueries({ queryKey: ['question-bank-categories', courseId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank-questions', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const createQuestionMut = useMutation({
    mutationFn: (data) => questionBankApi.createQuestion(courseId, data),
    onSuccess: (res) => {
      toast.success('Question created');
      resetQuestionForm();
      queryClient.invalidateQueries({ queryKey: ['question-bank-questions', courseId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank-categories', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const updateQuestionMut = useMutation({
    mutationFn: ({ id, data }) => questionBankApi.updateQuestion(courseId, id, data),
    onSuccess: () => {
      toast.success('Question updated');
      resetQuestionForm();
      queryClient.invalidateQueries({ queryKey: ['question-bank-questions', courseId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank-categories', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (qId) => questionBankApi.deleteQuestion(courseId, qId),
    onSuccess: () => {
      toast.success('Question deleted');
      queryClient.invalidateQueries({ queryKey: ['question-bank-questions', courseId] });
      queryClient.invalidateQueries({ queryKey: ['question-bank-categories', courseId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const resetQuestionForm = () => {
    setShowQuestionForm(false);
    setEditingQ(null);
    setQuestionForm({
      categoryId: selectedCat || '',
      type: 'multiple_choice', questionText: '', points: 1,
      modelAnswer: '', explanation: '', options: [
        { id: 'a', text: '', is_correct: false },
        { id: 'b', text: '', is_correct: false },
      ],
    });
  };

  const openQuestionForm = (q) => {
    if (q) {
      setEditingQ(q);
      setQuestionForm({
        categoryId: q.category_id,
        type: q.type,
        questionText: q.question_text,
        points: q.points,
        modelAnswer: q.model_answer || '',
        explanation: q.explanation || '',
        options: (q.options || []).map(o => ({ ...o })),
      });
    } else {
      resetQuestionForm();
    }
    setShowQuestionForm(true);
  };

  const handleSaveQuestion = () => {
    const payload = {
      ...questionForm,
      points: Number(questionForm.points) || 1,
    };
    if (editingQ) {
      updateQuestionMut.mutate({ id: editingQ.id, data: payload });
    } else {
      createQuestionMut.mutate(payload);
    }
  };

  const filteredQuestions = selectedCat
    ? questions.filter(q => q.category_id === selectedCat)
    : questions;

  const getCatName = (catId) => categories.find(c => c.id === catId)?.name || catId;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to={`/instructor/courses/${courseId}/edit`}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-display font-bold text-2xl text-white">Question Bank</h1>
            <p className="text-gray-400 text-sm mt-1">Manage reusable questions organized by category</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Sidebar: Categories ── */}
        <div className="w-full lg:w-64 shrink-0">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Categories</h2>
              {!showCategoryForm && (
                <button onClick={() => setShowCategoryForm(true)}
                  className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white">
                  <Plus size={14} />
                </button>
              )}
            </div>

            {showCategoryForm && (
              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  placeholder="Category name"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && categoryForm.name.trim()) {
                      createCatMut.mutate({ name: categoryForm.name.trim() });
                    }
                  }}
                  autoFocus
                />
                <button onClick={() => { setShowCategoryForm(false); setCategoryForm({ name: '' }); }}
                  className="p-1 rounded text-gray-500 hover:text-white">
                  <X size={14} />
                </button>
              </div>
            )}

            {catsLoading ? (
              <Spinner size="sm" />
            ) : categories.length === 0 ? (
              <p className="text-xs text-gray-600">No categories yet</p>
            ) : (
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                <button
                  onClick={() => setSelectedCat(null)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left',
                    !selectedCat
                      ? 'bg-[#1A6FBF]/20 text-[#3B9EE8]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <FolderOpen size={14} />
                  <span>All questions</span>
                  <span className="ml-auto text-gray-600">{questions.length}</span>
                </button>
                {categories.map(cat => (
                  <div key={cat.id}>
                    <button
                      onClick={() => setSelectedCat(cat.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left group',
                        selectedCat === cat.id
                          ? 'bg-[#1A6FBF]/20 text-[#3B9EE8]'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <FolderOpen size={14} />
                      <span className="truncate flex-1">{cat.name}</span>
                      <span className="text-gray-600">{cat.question_count || 0}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCatMut.mutate(cat.id); }}
                        className="p-0.5 rounded text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Main: Questions ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {selectedCat ? getCatName(selectedCat) : 'All Questions'}
              <span className="text-gray-500 text-sm ml-2">({filteredQuestions.length})</span>
            </h2>
            <Button size="sm" onClick={() => openQuestionForm(null)}>
              <Plus size={14} /> Add Question
            </Button>
          </div>

          {qsLoading ? (
            <Spinner />
          ) : filteredQuestions.length === 0 ? (
            <div className="card p-8 text-center">
              <HelpCircle size={40} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">No questions in{selectedCat ? ' this category' : ' the bank'} yet</p>
              <p className="text-gray-600 text-xs mt-1">Add a question to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredQuestions.map(q => (
                <div key={q.id} className="card p-4 hover:bg-white/[0.03] transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#1A6FBF]/20 text-[#3B9EE8]">
                          {q.type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-600">{q.points} pts</span>
                        {q.category_name && (
                          <span className="text-xs text-gray-600">in {q.category_name}</span>
                        )}
                      </div>
                      <p className="text-sm text-white">{q.question_text}</p>
                      {q.explanation && (
                        <p className="text-xs text-gray-500 mt-1 italic">{q.explanation}</p>
                      )}
                      {q.type !== 'short_answer' && q.options?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {q.options.map(o => (
                            <span key={o.id} className={clsx(
                              'text-xs px-2 py-0.5 rounded',
                              o.is_correct
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-white/5 text-gray-500'
                            )}>
                              {o.text || '(empty)'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                      <button onClick={() => openQuestionForm(q)}
                        className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/5">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => deleteQuestionMut.mutate(q.id)}
                        className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Question Form Modal ── */}
      <Modal
        open={showQuestionForm}
        onClose={() => { setShowQuestionForm(false); setEditingQ(null); }}
        title={editingQ ? 'Edit Question' : 'Add Question'}
        size="md"
      >
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[60vh] pr-1">
          <Select label="Category" value={questionForm.categoryId}
            onChange={e => setQuestionForm(p => ({ ...p, categoryId: e.target.value }))}
            required
          >
            <option value="">Select category</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <Select label="Type" value={questionForm.type}
            onChange={e => setQuestionForm(p => ({ ...p, type: e.target.value }))}>
            {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Question</label>
            <textarea value={questionForm.questionText}
              onChange={e => setQuestionForm(p => ({ ...p, questionText: e.target.value }))}
              rows={2} className="input resize-none" />
          </div>

          <Input label="Points" type="number" min={1} value={questionForm.points}
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
                        ...o, is_correct: questionForm.type === 'multiple_choice' ? o.id === opt.id : o.id === opt.id ? !o.is_correct : o.is_correct,
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

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Explanation (optional)</label>
            <textarea value={questionForm.explanation}
              onChange={e => setQuestionForm(p => ({ ...p, explanation: e.target.value }))}
              rows={2} className="input resize-none" placeholder="Shown after the student answers" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
            <Button variant="secondary" type="button"
              onClick={() => { setShowQuestionForm(false); setEditingQ(null); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveQuestion}
              loading={createQuestionMut.isPending || updateQuestionMut.isPending}>
              <Save size={14} /> {editingQ ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
