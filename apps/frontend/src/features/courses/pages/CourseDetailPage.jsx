import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Clock, Users, Star, BookOpen, CheckCircle, Lock, Play } from 'lucide-react';
import toast      from 'react-hot-toast';
import api        from '../../../shared/api/client';
import { coursesApi } from '../../../shared/api/courses.api';
import { useAuthStore } from '../../../shared/stores/authStore';
import Spinner    from '../../../shared/components/ui/spinner';
import Button     from '../../../shared/components/ui/Button';

export default function CourseDetailPage() {
  const { slug }        = useParams();
  const { user }        = useAuthStore();
  const navigate        = useNavigate();
  const queryClient     = useQueryClient();

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', slug],
    queryFn:  () => coursesApi.get(slug).then(r => r.data.data.course),
  });

  const enrollMutation = useMutation({
    mutationFn: () => api.post('/enrollments/enroll', { courseId: course.id }),
    onSuccess:  () => {
      toast.success('Enrolled successfully!');
      queryClient.invalidateQueries({ queryKey: ['course', slug] });
      navigate(`/learn/${course.id}`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Enrollment failed'),
  });

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (isLoading) return <div className="flex justify-center py-32"><Spinner size="lg" /></div>;
  if (!course)   return <div className="text-center py-32 text-gray-400">Course not found.</div>;

  const isEnrolled   = course.isEnrolled;
  const isOwner      = user?.id === course.instructor_id ||
                       ['admin','super_admin'].includes(user?.role);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="grid lg:grid-cols-3 gap-8 mb-10">
        <div className="lg:col-span-2">
          {course.category_name && (
            <p className="text-[#3B9EE8] text-sm font-medium mb-2">{course.category_name}</p>
          )}
          <h1 className="font-display font-bold text-3xl text-white leading-tight mb-3">
            {course.title}
          </h1>
          {course.short_description && (
            <p className="text-gray-300 text-base leading-relaxed mb-4">
              {course.short_description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
            <span className="flex items-center gap-1.5">
              <Users size={14} /> {course.student_count || 0} students
            </span>
            {course.duration_seconds > 0 && (
              <span className="flex items-center gap-1.5">
                <Clock size={14} /> {formatDuration(course.duration_seconds)}
              </span>
            )}
            {course.rating_average > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <Star size={14} fill="currentColor" />
                {parseFloat(course.rating_average).toFixed(1)}
              </span>
            )}
            <span className="badge-gray badge capitalize">{course.level}</span>
          </div>
          <p className="text-gray-400 text-sm">
            Instructor:{' '}
            <span className="text-white font-medium">{course.instructor_name}</span>
          </p>
        </div>

        {/* Enroll card */}
        <div className="card flex flex-col gap-4 h-fit lg:sticky lg:top-24">
          {course.thumbnail_path && (
            <img
              src={`/lmsdata/${course.thumbnail_path}`}
              alt={course.title}
              className="w-full h-40 object-cover rounded-xl"
            />
          )}
          {isEnrolled ? (
            <Link to={`/learn/${course.id}`} className="btn-primary btn w-full">
              <Play size={16} /> Continue Learning
            </Link>
          ) : isOwner ? (
            <Link to={`/instructor/courses/${course.id}/edit`} className="btn-secondary btn w-full">
              Edit Course
            </Link>
          ) : (
            <Button
              className="w-full"
              loading={enrollMutation.isPending}
              onClick={() => user ? enrollMutation.mutate() : navigate('/login')}
            >
              Enroll Now
            </Button>
          )}

          <div className="flex flex-col gap-1.5 text-xs text-gray-400 border-t border-gray-700 pt-3">
            <span className="flex items-center gap-2"><BookOpen size={13} /> {course.lesson_count || 0} lessons</span>
            {course.language && <span className="flex items-center gap-2">🌐 {course.language}</span>}
          </div>
        </div>
      </div>

      {/* What you'll learn */}
      {course.objectives?.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-display font-bold text-lg text-white mb-4">What you'll learn</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {course.objectives.map((obj, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <CheckCircle size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                {obj}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {course.requirements?.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-display font-bold text-lg text-white mb-4">Requirements</h2>
          <ul className="flex flex-col gap-2">
            {course.requirements.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-gray-600 mt-0.5">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Course content */}
      {course.sections?.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-display font-bold text-lg text-white mb-4">Course Content</h2>
          <div className="flex flex-col gap-2">
            {course.sections.map(section => (
              <details key={section.id} className="group">
                <summary className="flex items-center justify-between p-3 rounded-lg
                                    bg-[#0D1B2A] cursor-pointer hover:bg-[#0D1B2A]/70
                                    list-none select-none">
                  <span className="font-medium text-white text-sm">{section.title}</span>
                  <span className="text-gray-500 text-xs">
                    {section.lessons?.length || 0} lessons
                  </span>
                </summary>
                <div className="mt-1 flex flex-col gap-px">
                  {section.lessons?.map(lesson => (
                    <div key={lesson.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm
                                 text-gray-400 rounded-lg hover:bg-white/3">
                      <span className="flex items-center gap-2">
                        {isEnrolled
                          ? <Play size={13} className="text-[#3B9EE8]" />
                          : <Lock size={13} className="text-gray-600" />
                        }
                        {lesson.title}
                      </span>
                      {lesson.duration_seconds > 0 && (
                        <span className="text-xs text-gray-600">
                          {Math.floor(lesson.duration_seconds / 60)}m
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {course.description && (
        <div className="card">
          <h2 className="font-display font-bold text-lg text-white mb-3">About this course</h2>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
            {course.description}
          </p>
        </div>
      )}
    </div>
  );
}