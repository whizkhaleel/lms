import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../shared/stores/authStore';

// ── Wraps <Outlet/> for nested routes — use as a layout route element ──
export function RequireAuth({ children }) {
  const { isAuthenticated } = useAuthStore();
  const location            = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children ? children : <Outlet />;
}

// ── Role guard — also works as layout route element ──
export function RequireRole({ roles, children }) {
  const { user } = useAuthStore();
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children ? children : <Outlet />;
}

// ── Redirects logged-in users away from auth pages ──
export function GuestOnly({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated()) {
    const dest = ['admin', 'super_admin'].includes(user?.role) ? '/admin'
               : user?.role === 'instructor' ? '/instructor'
               : '/dashboard';
    return <Navigate to={dest} replace />;
  }
  return children;
}
