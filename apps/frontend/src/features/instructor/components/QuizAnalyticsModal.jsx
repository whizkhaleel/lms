import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle, XCircle, Clock, Users, Loader2 } from 'lucide-react';
import { assessmentsApi } from '../../../shared/api/assessments.api';
import Modal from '../../../shared/components/ui/modal';
import Button from '../../../shared/components/ui/Button';
import toast from 'react-hot-toast';

export default function QuizAnalyticsModal({ quizId, open, onClose }) {
  const [analytics, setAnalytics] = useState(null);
  const [pendingAnswers, setPendingAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQId, setSelectedQId] = useState(null);
  const [grading, setGrading] = useState({});

  useEffect(() => {
    if (!open || !quizId) return;
    setLoading(true);
    setSelectedQId(null);
    setGrading({});

    Promise.all([
      assessmentsApi.getQuizAnalytics(quizId),
      assessmentsApi.getPendingShortAnswers(quizId),
    ])
      .then(([aRes, pRes]) => {
        setAnalytics(aRes.data.data);
        setPendingAnswers(pRes.data.data.answers || []);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [quizId, open]);

  const handleGrade = async (answerId) => {
    const data = grading[answerId];
    if (!data || data.points === undefined || data.points === '') {
      toast.error('Enter points');
      return;
    }
    try {
      await assessmentsApi.gradeShortAnswer(answerId, {
        points: parseFloat(data.points),
        instructorNote: data.note || undefined,
      });
      toast.success('Graded!');
      setPendingAnswers(prev => prev.filter(a => a.id !== answerId));
      setGrading(prev => { const { [answerId]: _, ...rest } = prev; return rest; });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to grade');
    }
  };

  const btnClass = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors';

  return (
    <Modal open={open} onClose={onClose} title="Quiz Analytics" size="xl">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-[#3B9EE8]" />
        </div>
      ) : analytics ? (
        <div className="space-y-6 overflow-y-auto max-h-[70vh] pr-1">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Submissions" value={analytics.stats.total_submissions ?? 0} />
            <StatCard icon={CheckCircle} label="Passed" value={analytics.stats.passed_count ?? 0} color="text-green-400" />
            <StatCard icon={XCircle} label="Failed" value={analytics.stats.failed_count ?? 0} color="text-red-400" />
            <StatCard icon={BarChart3} label="Avg Score" value={analytics.stats.avg_score_pct != null ? `${analytics.stats.avg_score_pct}%` : '-'} />
            <StatCard icon={Clock} label="Avg Time" value={analytics.stats.avg_time_secs != null ? `${analytics.stats.avg_time_secs}s` : '-'} />
            <StatCard label="Min Score" value={analytics.stats.min_score != null ? `${analytics.stats.min_score}%` : '-'} />
            <StatCard label="Max Score" value={analytics.stats.max_score != null ? `${analytics.stats.max_score}%` : '-'} />
          </div>

          {/* Per-question breakdown */}
          <div>
            <h3 className="font-semibold text-white text-sm mb-2">Per-Question Breakdown</h3>
            <div className="space-y-2">
              {analytics.questionStats.map((q) => (
                <div key={q.id}
                  className={`bg-white/[0.03] rounded-lg p-3 border ${selectedQId === q.id ? 'border-[#3B9EE8]' : 'border-transparent'} cursor-pointer`}
                  onClick={() => setSelectedQId(selectedQId === q.id ? null : q.id)}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-200 truncate mr-3">
                      {q.question_text}
                      <span className="text-xs text-gray-600 ml-2">({q.type} · {q.points}pt)</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <span className="text-gray-400">Attempts: <strong className="text-white">{q.attempts}</strong></span>
                      <span>Correct: <strong className="text-green-400">{q.correct}</strong></span>
                      <span className={`font-mono ${q.correct_pct >= 70 ? 'text-green-400' : q.correct_pct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {q.correct_pct}%
                      </span>
                    </div>
                  </div>

                  {/* Pending answers for short answer questions */}
                  {selectedQId === q.id && q.type === 'short_answer' && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Pending Short Answers</h4>
                      {pendingAnswers.filter(a => a.question_id === q.id).length === 0 ? (
                        <p className="text-xs text-gray-600">No pending answers</p>
                      ) : (
                        <div className="space-y-3">
                          {pendingAnswers.filter(a => a.question_id === q.id).map((a) => (
                            <div key={a.id} className="bg-white/[0.03] rounded p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-400">
                                  {a.first_name} {a.last_name} — Attempt #{a.attempt_number}
                                </span>
                              </div>
                              <p className="text-sm text-gray-200 mb-2 bg-white/[0.03] rounded p-2">
                                {a.selected_options?.[0] || '(empty)'}
                              </p>
                              <div className="flex items-center gap-2">
                                <input type="number" min="0" max={a.max_points} step="0.5"
                                  placeholder={`0-${a.max_points}`}
                                  className="input w-20 text-sm"
                                  value={grading[a.id]?.points ?? ''}
                                  onChange={e => setGrading(prev => ({
                                    ...prev,
                                    [a.id]: { ...prev[a.id], points: e.target.value },
                                  }))} />
                                <input placeholder="Feedback (optional)"
                                  className="input flex-1 text-sm"
                                  value={grading[a.id]?.note ?? ''}
                                  onChange={e => setGrading(prev => ({
                                    ...prev,
                                    [a.id]: { ...prev[a.id], note: e.target.value },
                                  }))} />
                                <Button size="sm" onClick={() => handleGrade(a.id)}>Grade</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={14} className="text-gray-500" />}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-lg font-semibold font-mono ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}
