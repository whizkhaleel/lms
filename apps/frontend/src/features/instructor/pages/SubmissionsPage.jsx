import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Users, CheckCircle2, Clock, ArrowLeft, FileText, Download, X, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import api from '../../../shared/api/client';
import { submissionsApi } from '../../../shared/api';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';

const STATUS_BADGE = {
  submitted: 'badge-amber',
  graded:    'badge-green',
  returned:  'badge-blue',
};

export default function SubmissionsPage() {
  const queryClient = useQueryClient();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['instructor-courses-all'],
    queryFn: () => api.get('/courses/my-courses').then(r => r.data.data || []),
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['course-assignments', selectedCourse],
    queryFn: () => submissionsApi.listAssignmentsByCourse(selectedCourse).then(r => r.data.data.assignments),
    enabled: !!selectedCourse,
  });
  const assignments = assignmentsData || [];

  const { data: submissionsData, isLoading: submissionsLoading } = useQuery({
    queryKey: ['assignment-submissions', selectedAssignment],
    queryFn: () => submissionsApi.listSubmissions(selectedAssignment).then(r => r.data.data.submissions),
    enabled: !!selectedAssignment,
  });
  const submissions = submissionsData || [];

  const { data: submissionDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['submission-detail', selectedSubmission],
    queryFn: () => submissionsApi.getSubmission(selectedSubmission).then(r => r.data.data.submission),
    enabled: !!selectedSubmission,
  });

  const gradeMutation = useMutation({
    mutationFn: ({ submissionId, score, feedback }) =>
      submissionsApi.grade(submissionId, { score, feedback }),
    onSuccess: () => {
      toast.success('Submission graded');
      queryClient.invalidateQueries({ queryKey: ['assignment-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['course-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['submission-detail'] });
      setSelectedSubmission(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to grade'),
  });

  const { data: rubric } = useQuery({
    queryKey: ['assignment-rubric', selectedAssignment],
    queryFn: () => submissionsApi.getRubric(selectedAssignment).then(r => r?.data?.data?.rubric),
    enabled: !!selectedAssignment,
  });

  const rubricGradeMutation = useMutation({
    mutationFn: ({ submissionId, scores, feedback }) =>
      submissionsApi.gradeWithRubric(submissionId, { scores, feedback }),
    onSuccess: () => {
      toast.success('Submission graded with rubric');
      queryClient.invalidateQueries({ queryKey: ['assignment-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['course-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['submission-detail'] });
      setSelectedSubmission(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to grade'),
  });

  // State: no course selected
  if (!selectedCourse) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl text-white">Submission Grading</h1>
          <p className="text-gray-400 text-sm mt-1">Select a course to grade student submissions</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {coursesLoading ? (
            <div className="col-span-2 flex justify-center py-12"><Spinner /></div>
          ) : courses.length === 0 ? (
            <div className="col-span-2 text-center py-16 text-gray-500">
              <BookOpen size={40} className="mx-auto mb-3 text-gray-700" />
              <p className="font-medium">No courses yet</p>
            </div>
          ) : courses.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCourse(c.id)}
              className="card text-left hover:border-[#3B9EE8]/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <BookOpen size={18} className="text-blue-400" />
                <span className={clsx('badge',
                  c.status === 'published' ? 'badge-green' : 'badge-gray'
                )}>{c.status}</span>
              </div>
              <p className="font-semibold text-white mb-1">{c.title}</p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Users size={12} /> {c.student_count || 0}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // State: course selected, no assignment selected
  if (!selectedAssignment) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => setSelectedCourse(null)} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-display font-bold text-2xl text-white">
              {courses.find(c => c.id === selectedCourse)?.title}
            </h1>
            <p className="text-gray-400 text-sm mt-1">Select an assignment to grade</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {assignmentsLoading ? (
            <div className="col-span-2 flex justify-center py-12"><Spinner /></div>
          ) : assignments.length === 0 ? (
            <div className="col-span-2 text-center py-16 text-gray-500">
              <FileText size={40} className="mx-auto mb-3 text-gray-700" />
              <p className="font-medium">No assignments in this course</p>
            </div>
          ) : assignments.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAssignment(a.id)}
              className="card text-left hover:border-[#3B9EE8]/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <FileText size={18} className="text-amber-400" />
                <span className={clsx('badge',
                  a.is_published ? 'badge-green' : 'badge-gray'
                )}>{a.is_published ? 'Published' : 'Draft'}</span>
              </div>
              <p className="font-semibold text-white mb-1">{a.title}</p>
              <p className="text-xs text-gray-500 mb-3 truncate">{a.instructions}</p>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <FileText size={12} /> {a.submission_count || 0} submissions
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={12} /> {a.graded_count || 0} graded
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} /> Max {a.max_score} pts
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const course = courses.find(c => c.id === selectedCourse);
  const assignment = assignments.find(a => a.id === selectedAssignment);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => { setSelectedAssignment(null); setSelectedSubmission(null); }}
          className="hover:text-white transition-colors">Assignments</button>
        <span>/</span>
        <span className="text-white">{assignment?.title}</span>
      </div>

      {/* Submissions table */}
      <div className="card p-0 overflow-x-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">
            Submissions ({submissions.length})
          </h2>
          {assignment && (
            <span className="text-xs text-gray-500">Max score: {assignment.max_score} pts</span>
          )}
        </div>

        {submissionsLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <FileText size={40} className="mx-auto mb-3 text-gray-700" />
            <p className="font-medium">No submissions yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, i) => (
                <tr key={s.id} className={clsx('border-b border-gray-800/50', i % 2 === 0 && 'bg-white/[0.01]')}>
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-medium text-white">{s.first_name} {s.last_name}</p>
                      <p className="text-xs text-gray-500">{s.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={clsx('badge', STATUS_BADGE[s.status] || 'badge-gray')}>{s.status}</span>
                  </td>
                  <td className="px-5 py-4 text-gray-300">
                    {s.status === 'graded' ? (
                      <span className={clsx('font-semibold', s.score >= assignment?.passing_score ? 'text-green-400' : 'text-red-400')}>
                        {s.score}/{assignment?.max_score}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">
                    {formatDistanceToNow(new Date(s.submitted_at), { addSuffix: true })}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setSelectedSubmission(s.id)}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-lg"
                    >
                      {s.status === 'graded' ? 'View' : 'Grade'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Grade Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedSubmission(null)}>
          <div className="bg-[#0D1B2A] border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h3 className="font-semibold text-white">Grade Submission</h3>
              <button onClick={() => setSelectedSubmission(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : submissionDetail && (
              <div className="p-6 space-y-5">
                {/* Student info */}
                <div className="flex items-center gap-3 pb-4 border-b border-gray-700/50">
                  <div className="w-10 h-10 rounded-full bg-[#1B2D4A] flex items-center justify-center text-blue-400 font-semibold">
                    {submissionDetail.first_name?.[0]}{submissionDetail.last_name?.[0]}
                  </div>
                  <div>
                    <p className="font-medium text-white">{submissionDetail.first_name} {submissionDetail.last_name}</p>
                    <p className="text-xs text-gray-500">{submissionDetail.email}</p>
                  </div>
                  <span className="ml-auto text-xs text-gray-500">
                    Submitted {formatDistanceToNow(new Date(submissionDetail.submitted_at), { addSuffix: true })}
                  </span>
                </div>

                {/* Assignment info */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Assignment</p>
                  <p className="text-white font-medium">{submissionDetail.assignment_title}</p>
                  <p className="text-xs text-gray-400 mt-1">Max score: {submissionDetail.max_score} | Passing: {submissionDetail.passing_score}</p>
                </div>

                {/* Text submission */}
                {submissionDetail.text_content && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Submission Text</p>
                    <div className="bg-[#0A1628] rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {submissionDetail.text_content}
                    </div>
                  </div>
                )}

                {/* Files */}
                {submissionDetail.files?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Attached Files ({submissionDetail.files.length})</p>
                    <div className="space-y-2">
                      {submissionDetail.files.map((f, i) => (
                        <a key={i} href={`/lmsdata/${f.storage_path}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-[#0A1628] rounded-lg px-3 py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                          <Download size={14} />
                          <span className="truncate">{f.original_name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Current grade info if regrading */}
                {submissionDetail.status === 'graded' && (
                  <div className="bg-[#0A1628] rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Current Grade</p>
                    <p className="text-lg font-bold text-white">{submissionDetail.score} / {submissionDetail.max_score}</p>
                    {submissionDetail.feedback && (
                      <p className="text-sm text-gray-400 mt-2">{submissionDetail.feedback}</p>
                    )}
                  </div>
                )}

                {/* Rubric section */}
                {rubric?.criteria?.length > 0 && (
                  <div className="bg-[#0A1628] rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <BarChart3 size={14} className="text-blue-400" />
                      Rubric: {rubric.name || 'Untitled'}
                    </div>
                    {rubric.description && (
                      <p className="text-xs text-gray-500">{rubric.description}</p>
                    )}
                  </div>
                )}

                {/* Grade form */}
                <form onSubmit={e => {
                  e.preventDefault();
                  const fd = new FormData(e.target);

                  if (rubric?.criteria?.length > 0) {
                    const scores = {};
                    let total = 0;
                    for (const c of rubric.criteria) {
                      const val = parseFloat(fd.get(`criterion_${c.id}`));
                      if (isNaN(val) || val < 0 || val > c.max_score) {
                        return toast.error(`Score for "${c.description}" must be between 0 and ${c.max_score}`);
                      }
                      scores[c.id] = val;
                      total += val;
                    }
                    rubricGradeMutation.mutate({
                      submissionId: selectedSubmission,
                      scores,
                      feedback: fd.get('feedback') || '',
                    });
                  } else {
                    const score = parseInt(fd.get('score'), 10);
                    if (isNaN(score) || score < 0) return toast.error('Score must be a positive number');
                    gradeMutation.mutate({
                      submissionId: selectedSubmission,
                      score,
                      feedback: fd.get('feedback') || '',
                    });
                  }
                }} className="space-y-4">
                  {rubric?.criteria?.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Per-Criterion Scores</p>
                      {rubric.criteria.map(c => (
                        <div key={c.id}>
                          <label className="block text-sm text-gray-300 mb-1">
                            {c.description}
                            <span className="text-gray-500 text-xs ml-1">(max {c.max_score})</span>
                          </label>
                          <input type="number" name={`criterion_${c.id}`}
                            defaultValue={submissionDetail.score ?? ''}
                            min="0" max={c.max_score} step="0.01" required
                            className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3B9EE8]" />
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 italic">
                        Total will be calculated: {rubric.criteria.reduce((s, c) => s + c.max_score, 0)} pts max
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                        Score (out of {submissionDetail.max_score})
                      </label>
                      <input type="number" name="score"
                        defaultValue={submissionDetail.score ?? ''}
                        min="0" max={submissionDetail.max_score} required
                        className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3B9EE8]" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Feedback</label>
                    <textarea name="feedback" rows={4}
                      defaultValue={submissionDetail.feedback ?? ''}
                      className="w-full bg-[#0A1628] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3B9EE8] resize-none"
                      placeholder="Provide feedback to the student..." />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setSelectedSubmission(null)}
                      className="btn-ghost btn">Cancel</button>
                    <button type="submit" disabled={gradeMutation.isPending || rubricGradeMutation.isPending}
                      className="btn-primary btn">
                      {gradeMutation.isPending || rubricGradeMutation.isPending
                        ? 'Saving...'
                        : submissionDetail.status === 'graded' ? 'Update Grade' : 'Submit Grade'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
