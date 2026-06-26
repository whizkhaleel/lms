import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery }  from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, MessageSquare, Megaphone, CalendarDays } from 'lucide-react';
import { clsx } from 'clsx';
import api            from '../../../shared/api/client';
import { announcementsApi } from '../../../shared/api/announcements.api';
import VideoPlayer    from '../VideoPlayer';
import CourseProgress from '../CourseProgress';
import QuizPlayer     from '../../assessments/QuizPlayer';
import AssignmentSubmission from '../AssignmentSubmission';
import SCORMPlayer from '../SCORMPlayer';
import LTILaunch from '../LTILaunch';
import Spinner        from '../../../shared/components/ui/spinner';

export default function ClassroomPage() {
  const { courseId, lessonId } = useParams();
  const navigate               = useNavigate();
  const [view, setView] = useState('lesson'); // 'lesson' | 'announcements'

  // Load full course progress (sections + lessons list)
  const { data: progress, refetch: refetchProgress } = useQuery({
    queryKey: ['course-progress', courseId],
    queryFn:  () => api.get(`/progress/courses/${courseId}`).then(r => r.data.data.progress),
  });

  // Determine active lesson — URL param or first incomplete
  const allLessons = progress?.lessons || [];
  const activeLessonId = lessonId || progress?.nextLessonId || allLessons[0]?.id;
  const activeLesson   = allLessons.find(l => l.id === activeLessonId);

  // Load lesson content
  const { data: lessonData, isLoading: lessonLoading } = useQuery({
    queryKey: ['lesson', activeLessonId, courseId],
    queryFn:  () => api.get(`/courses/${courseId}/lessons/${activeLessonId}`).then(r => r.data.data.lesson),
    enabled:  !!activeLessonId,
  });

  // Quiz data if lesson type = quiz
  const { data: quizData } = useQuery({
    queryKey: ['quiz-for-lesson', activeLessonId],
    queryFn:  () => api.get(`/assessments/quizzes/by-lesson/${activeLessonId}`).then(r => r.data.data),
    enabled:  lessonData?.type === 'quiz',
  });

  // Announcements
  const { data: announcements = [] } = useQuery({
    queryKey: ['classroom-announcements', courseId],
    queryFn:  () => announcementsApi.list(courseId).then(r => r.data.data || []),
  });

  // Navigate to next lesson
  const currentIndex = allLessons.findIndex(l => l.id === activeLessonId);
  const nextLesson   = allLessons[currentIndex + 1];
  const prevLesson   = allLessons[currentIndex - 1];

  const goToLesson = (id) => navigate(`/learn/${courseId}/lessons/${id}`);

  const handleLessonComplete = () => {
    refetchProgress();
    if (nextLesson) setTimeout(() => goToLesson(nextLesson.id), 1500);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ── Sidebar: lesson list ── */}
      <aside className="hidden lg:flex flex-col w-72 flex-shrink-0
                        border-r border-gray-800 bg-[#0D1B2A] overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold text-white text-sm line-clamp-2">
            {progress?.course_title || 'Course'}
          </h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {progress
            ? <CourseProgress
                courseId={courseId}
                activeLessonId={activeLessonId}
                onSelectLesson={(id) => { setView('lesson'); goToLesson(id); }}
              />
            : <div className="flex justify-center py-10"><Spinner /></div>
          }
        </div>
        {/* Sidebar footer links */}
        <div className="border-t border-gray-800 p-3 space-y-1">
          <button onClick={() => setView(view === 'announcements' ? 'lesson' : 'announcements')}
            className={clsx('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              view === 'announcements'
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            )}>
            <Megaphone size={15} />
            Announcements
            {announcements.length > 0 && (
              <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                {announcements.length}
              </span>
            )}
          </button>
          <Link to={`/learn/${courseId}/forums`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <MessageSquare size={15} />
            Discussions
          </Link>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3
                        border-b border-gray-800 bg-[#0D1B2A] flex-shrink-0">
          {view === 'announcements' ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setView('lesson')}
                className="btn-ghost p-1.5 rounded-lg">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-white font-medium">Announcements</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => prevLesson && goToLesson(prevLesson.id)}
                disabled={!prevLesson}
                className="btn-ghost p-1.5 rounded-lg disabled:opacity-30">
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-white font-medium line-clamp-1">
                {lessonData?.title || 'Loading…'}
              </span>
              <button onClick={() => nextLesson && goToLesson(nextLesson.id)}
                disabled={!nextLesson}
                className="btn-ghost p-1.5 rounded-lg disabled:opacity-30">
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{progress?.percent_complete ?? 0}% complete</span>
            <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${progress?.percent_complete ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Lesson content */}
        <div className="flex-1 overflow-y-auto p-5">
          {view === 'announcements' ? (
            <div className="max-w-3xl mx-auto space-y-4">
              <h2 className="font-display font-bold text-xl text-white flex items-center gap-2">
                <Megaphone size={20} className="text-blue-400" />
                Announcements
              </h2>
              {announcements.length === 0 ? (
                <p className="text-gray-500 text-sm py-8">No announcements yet.</p>
              ) : (
                announcements.map(a => (
                  <div key={a.id} className="bg-[#0A1628] rounded-xl p-5 border border-gray-800 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{a.title}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {a.first_name} {a.last_name} &middot; {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {a.body && <p className="text-sm text-gray-300 whitespace-pre-wrap mt-2">{a.body}</p>}
                  </div>
                ))
              )}
            </div>
          ) : lessonLoading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : !lessonData ? (
            <div className="text-center py-20 text-gray-400">Lesson not found.</div>
          ) : (
            <div className="max-w-4xl mx-auto flex flex-col gap-6">

              {/* VIDEO lesson */}
              {lessonData.type === 'video' && lessonData.video_file_id && (
                <VideoPlayer
                  lessonId={lessonData.id}
                  courseId={courseId}
                  videoUrl={`/api/v1/files/${lessonData.video_file_id}`}
                  durationSecs={lessonData.duration_seconds}
                  onComplete={handleLessonComplete}
                  onNext={nextLesson ? () => goToLesson(nextLesson.id) : undefined}
                />
              )}

              {/* TEXT lesson */}
              {lessonData.type === 'text' && (
                <div className="card prose prose-invert max-w-none">
                  <div
                    className="text-gray-300 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: lessonData.content || '' }}
                  />
                </div>
              )}

              {/* QUIZ lesson */}
              {lessonData.type === 'quiz' && quizData?.quiz && (
                <QuizPlayer
                  quizId={quizData.quiz.id}
                  courseId={courseId}
                  onComplete={handleLessonComplete}
                />
              )}

              {/* ASSIGNMENT lesson */}
              {lessonData.type === 'assignment' && (
                <AssignmentSubmission
                  lessonId={lessonData.id}
                  courseId={courseId}
                  onComplete={handleLessonComplete}
                />
              )}

              {/* SCORM lesson */}
              {lessonData.type === 'scorm' && <ScormLesson
                lessonId={lessonData.id}
                courseId={courseId}
                onComplete={handleLessonComplete}
              />}

              {/* LTI lesson */}
              {lessonData.type === 'lti' && (
                <LTILaunch
                  lessonId={lessonData.id}
                  courseId={courseId}
                  onComplete={handleLessonComplete}
                />
              )}

              {/* Lesson title + resources */}
              <div className="card">
                <h1 className="font-display font-bold text-xl text-white mb-3">
                  {lessonData.title}
                </h1>

                {lessonData.resources?.length > 0 && (
                  <div className="mt-4 border-t border-gray-700 pt-4">
                    <p className="text-sm font-semibold text-gray-400 mb-3">
                      Resources
                    </p>
                    <div className="flex flex-col gap-2">
                      {lessonData.resources.map(r => (
                        <a
                          key={r.id}
                          href={`/api/v1/files/${r.file_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-sm text-[#3B9EE8]
                                     hover:underline"
                        >
                          <FileText size={14} />
                          {r.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Course forum link */}
              <div className="flex justify-end">
                <Link
                  to={`/learn/${courseId}/forums`}
                  className="btn-ghost text-sm flex items-center gap-2"
                >
                  <MessageSquare size={15} />
                  Course discussions
                </Link>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SCORM sub-component ───────────────────────
function ScormLesson({ lessonId, courseId, onComplete }) {
  const { data: pkg, isLoading, error } = useQuery({
    queryKey: ['scorm-package', courseId, lessonId],
    queryFn: () => api.get(`/scorm/courses/${courseId}/lessons/${lessonId}/package`).then(r => r.data.data.package),
    enabled: !!lessonId,
  });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error) return <div className="card text-center py-12 text-red-400">Failed to load SCORM content</div>;
  if (!pkg) return <div className="card text-center py-12 text-gray-500">No SCORM package uploaded yet</div>;

  return <SCORMPlayer packageId={pkg.id} lessonId={lessonId} courseId={courseId} onComplete={onComplete} />;
}