import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useAuthStore }   from './shared/stores/authStore';
import { useSocketStore } from './shared/stores/socketStore';

// Layouts & guards
import AppLayout, { AuthLayout, ClassroomLayout } from './shared/components/layout/AppLayout';
import { RequireAuth, RequireRole, GuestOnly }     from './app/guards';
import { PageLoader } from './shared/components/ui/spinner';

// ── Lazy pages ────────────────────────────────
const LoginPage           = lazy(() => import('./features/auth/pages/LoginPage'));
const ForgotPasswordPage  = lazy(() => import('./features/auth/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage   = lazy(() => import('./features/auth/pages/ForgotPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const ChangePasswordPage  = lazy(() => import('./features/auth/pages/ChangePasswordPage'));
const StudentDashboard    = lazy(() => import('./features/dashboard/StudentDashboard'));
const CourseCatalogPage   = lazy(() => import('./features/courses/pages/CourseCatalogPage'));
const CourseDetailPage    = lazy(() => import('./features/courses/pages/CourseDetailPage'));
const ClassroomPage       = lazy(() => import('./features/classroom/pages/ClassroomPage'));
const MessagesPage        = lazy(() => import('./features/messages/pages/MessagesPage'));
const InstructorDashboard = lazy(() => import('./features/instructor/pages/InstructorDashboardPage'));
const AdminDashboard      = lazy(() => import('./features/admin/pages/AdminDashboardPage'));
const ProfilePage         = lazy(() => import('./features/auth/pages/ProfilePage'));
const NotificationsPage   = lazy(() => import('./features/notifications/pages/NotificationsPage'));
const AdminUsersPage      = lazy(() => import('./features/admin/pages/AdminUsersPage'));
const AdminCoursesPage    = lazy(() => import('./features/admin/pages/AdminCoursesPage'));
const AdminCreateCoursePage = lazy(() => import('./features/admin/pages/AdminCreateCoursePage'));
const AdminEnrollmentsPage = lazy(() => import('./features/admin/pages/AdminEnrollmentsPage'));
const AdminAnalyticsPage = lazy(() => import('./features/admin/pages/AdminAnalyticsPage'));
const AuditLogPage       = lazy(() => import('./features/admin/pages/AuditLogPage'));
const AdminSettingsPage  = lazy(() => import('./features/admin/pages/AdminSettingsPage'));
const InstructorAnalyticsPage = lazy(() => import('./features/instructor/pages/InstructorAnalyticsPage'));
const CourseAnalyticsPage = lazy(() => import('./features/instructor/pages/CourseAnalyticsPage'));
const CourseBuilderPage = lazy(() => import('./features/instructor/pages/CourseBuilderPage'));
const SubmissionsPage = lazy(() => import('./features/instructor/pages/SubmissionsPage'));
const CertificatesPage = lazy(() => import('./features/certificates/pages/CertificatesPage'));
const LeaderboardPage = lazy(() => import('./features/certificates/pages/LeaderboardPage'));

// Connect Socket.io once the user is known
function SocketInit() {
  const user    = useAuthStore(s => s.user);
  const connect = useSocketStore(s => s.connect);
  const disconnect = useSocketStore(s => s.disconnect);
  useEffect(() => {
    if (user?.id) connect(user.id);
    else disconnect();
  }, [user?.id, connect, disconnect]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <SocketInit />
      <Suspense fallback={<PageLoader />}>
        <Routes>

          {/* ── Auth pages (centered, no sidebar) ── */}
          <Route element={<AuthLayout />}>
            <Route path="/login"           element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
            <Route path="/reset-password"  element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />
          </Route>

          {/* ── Forced/voluntary password change (logged in, centered) ── */}
          <Route element={<RequireAuth><AuthLayout /></RequireAuth>}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
          </Route>

          {/* ── Classroom (full width, requires login) ── */}
          <Route element={<RequireAuth />}>
            <Route element={<ClassroomLayout />}>
              <Route path="/learn/:courseId"                   element={<ClassroomPage />} />
              <Route path="/learn/:courseId/lessons/:lessonId" element={<ClassroomPage />} />
            </Route>
          </Route>

          {/* ── Main app shell (navbar + sidebar) ── */}
          <Route element={<AppLayout />}>

            {/* Public */}
            <Route index                  element={<Navigate to="/courses" replace />} />
            <Route path="/courses"        element={<CourseCatalogPage />} />
            <Route path="/courses/:slug"  element={<CourseDetailPage />} />

            {/* Student — requires login only */}
            <Route element={<RequireAuth />}>
              <Route path="/dashboard"     element={<StudentDashboard />} />
              <Route path="/profile"       element={<ProfilePage />} />
              <Route path="/messages"      element={<MessagesPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/achievements"  element={<CertificatesPage />} />
              <Route path="/leaderboard"   element={<LeaderboardPage />} />
            </Route>

            {/* Instructor — requires login + role */}
            <Route element={<RequireAuth />}>
              <Route element={<RequireRole roles={['instructor','admin','super_admin']} />}>
                <Route path="/instructor"                       element={<InstructorDashboard />} />
                <Route path="/instructor/courses"              element={<Navigate to="/instructor" replace />} />
                <Route path="/instructor/courses/:id/edit"      element={<CourseBuilderPage />} />
                <Route path="/instructor/courses/:id/analytics" element={<CourseAnalyticsPage />} />
                <Route path="/instructor/submissions"           element={<SubmissionsPage />} />
                <Route path="/instructor/analytics"             element={<InstructorAnalyticsPage />} />
              </Route>
            </Route>

            {/* Admin — requires login + role */}
            <Route element={<RequireAuth />}>
              <Route element={<RequireRole roles={['admin','super_admin']} />}>
                <Route path="/admin"             element={<AdminDashboard />} />
                <Route path="/admin/users"       element={<AdminUsersPage />} />
                <Route path="/admin/courses"     element={<AdminCoursesPage />} />
                <Route path="/admin/courses/new" element={<AdminCreateCoursePage />} />
                <Route path="/admin/enrollments" element={<AdminEnrollmentsPage />} />
                <Route path="/admin/analytics"   element={<AdminAnalyticsPage />} />
                <Route path="/admin/audit-logs" element={<AuditLogPage />} />
                <Route path="/admin/settings"   element={<AdminSettingsPage />} />
              </Route>
            </Route>

            <Route path="*" element={
              <div className="text-center py-32">
                <p className="text-7xl font-display font-black text-gray-800 mb-4">404</p>
                <p className="text-gray-400 text-lg">Page not found</p>
              </div>
            } />
          </Route>

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}