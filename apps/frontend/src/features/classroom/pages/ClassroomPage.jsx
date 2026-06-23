import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery }  from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, MessageSquare } from 'lucide-react';
import api            from '../../../shared/api/client';
import VideoPlayer    from '../VideoPlayer';
import CourseProgress from '../CourseProgress';
import QuizPlayer     from '../../assessments/QuizPlayer';
import Spinner        from '../../../shared/components/ui/spinner';

export default function ClassroomPage() {
  const { courseId, lessonId } = useParams();
  const navigate               = useNavigate();

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
                onSelectLesson={goToLesson}
              />
            : <div className="flex justify-center py-10"><Spinner /></div>
          }
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3
                        border-b border-gray-800 bg-[#0D1B2A] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => prevLesson && goToLesson(prevLesson.id)}
              disabled={!prevLesson}
              className="btn-ghost p-1.5 rounded-lg disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-white font-medium line-clamp-1">
              {lessonData?.title || 'Loading…'}
            </span>
            <button
              onClick={() => nextLesson && goToLesson(nextLesson.id)}
              disabled={!nextLesson}
              className="btn-ghost p-1.5 rounded-lg disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>

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
          {lessonLoading ? (
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
                <a
                  href={`/courses/${courseId}/forums`}
                  className="btn-ghost text-sm flex items-center gap-2"
                >
                  <MessageSquare size={15} />
                  Course discussions
                </a>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}