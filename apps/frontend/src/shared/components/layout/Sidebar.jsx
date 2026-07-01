import { NavLink } from 'react-router-dom';
import { clsx }    from 'clsx';
import {
  LayoutDashboard, BookOpen, GraduationCap, MessageSquare,
  Bell, Users, Settings, BarChart3, FileText, X,
  PlusCircle, Library, Calendar as CalendarIcon,
  CreditCard, Award,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { useTheme } from '../../contexts/ThemeContext';

const NavItem = ({ to, icon: Icon, label, end = false, badge, light, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) => clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
      isActive
        ? 'bg-[#1A6FBF]/20 text-[#3B9EE8] border border-[#1A6FBF]/30'
        : light
          ? 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
    )}
  >
    <Icon size={18} />
    <span className="flex-1">{label}</span>
    {badge > 0 && (
      <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </NavLink>
);

const SectionLabel = ({ label, light }) => (
  <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mt-5 mb-1"
     style={{ color: light ? '#64748B' : '#4B5563' }}>
    {label}
  </p>
);

export default function Sidebar({ open, onClose }) {
  const { user, isAdmin, isInstructor } = useAuth();
  const { unreadCount } = useNotifications();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside className={clsx(
        'fixed top-16 left-0 bottom-0 z-30 w-64',
        'border-r flex flex-col overflow-y-auto',
        'transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )} style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
        <div className="flex flex-col gap-1 p-3 flex-1">

          {/* Student / Admin learning nav (hidden for pure instructors) */}
          {user && user.role !== 'instructor' && (
            <>
              <SectionLabel label="Learning" light={isLight} />
              <NavItem to="/dashboard"  icon={LayoutDashboard} label="My Dashboard" end light={isLight} onClick={onClose} />
              <NavItem to="/courses"    icon={Library}         label="Course Catalog" light={isLight} onClick={onClose} />
              <NavItem to="/messages"   icon={MessageSquare}   label="Messages" light={isLight} onClick={onClose} />
              <NavItem to="/notifications" icon={Bell}         label="Notifications" badge={unreadCount} light={isLight} onClick={onClose} />
            </>
          )}

          {/* Instructor nav */}
          {isInstructor && (
            <>
              <SectionLabel label="Teaching" light={isLight} />
              <NavItem to="/instructor"              icon={GraduationCap} label="Instructor Panel" end light={isLight} onClick={onClose} />
              <NavItem to="/instructor/courses"      icon={BookOpen}      label="My Courses" light={isLight} onClick={onClose} />
              <NavItem to="/instructor/students"   icon={Users}         label="My Students" light={isLight} onClick={onClose} />
              <NavItem to="/instructor/gradebook"  icon={Award}        label="Gradebook" light={isLight} onClick={onClose} />
              <NavItem to="/instructor/submissions"  icon={FileText}      label="Submissions" light={isLight} onClick={onClose} />
              <NavItem to="/instructor/analytics"    icon={BarChart3}     label="Analytics" light={isLight} onClick={onClose} />
            </>
          )}

          {/* Admin nav */}
          {isAdmin && (
            <>
              <SectionLabel label="Administration" light={isLight} />
              <NavItem to="/admin"             icon={Settings}        label="Admin Panel" end light={isLight} onClick={onClose} />
              <NavItem to="/admin/users"       icon={Users}           label="Users" light={isLight} onClick={onClose} />
              <NavItem to="/admin/courses"     icon={BookOpen}        label="All Courses" light={isLight} onClick={onClose} />
              <NavItem to="/admin/courses/new" icon={PlusCircle}     label="Create Course" light={isLight} onClick={onClose} />
              <NavItem to="/admin/enrollments" icon={GraduationCap}   label="Enrollments" light={isLight} onClick={onClose} />
              <NavItem to="/admin/analytics"   icon={BarChart3}       label="Analytics" light={isLight} onClick={onClose} />
              <NavItem to="/admin/payments"  icon={CreditCard}      label="Payments" light={isLight} onClick={onClose} />
              <NavItem to="/admin/audit-logs" icon={FileText}        label="Audit Logs" light={isLight} onClick={onClose} />
              <NavItem to="/admin/settings"   icon={Settings}        label="Settings" light={isLight} onClick={onClose} />
            </>
          )}

          {/* Separator + Calendar (visible to all roles) */}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            <NavItem to="/calendar" icon={CalendarIcon} label="Calendar" light={isLight} onClick={onClose} />
          </div>

        </div>

        {/* Bottom profile strip */}
        {user && (
          <div className="p-3" style={{ borderTop: '1px solid var(--border-color)' }}>
            <NavLink
              to="/profile"
              onClick={onClose}
              className={clsx('flex items-center gap-3 p-2.5 rounded-xl transition-colors', isLight ? 'hover:bg-black/5' : 'hover:bg-white/5')}
            >
              <div className="w-8 h-8 rounded-full bg-[#1A6FBF]
                              flex items-center justify-center
                              text-white text-xs font-bold flex-shrink-0">
                {user.first_name?.[0]}{user.last_name?.[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate"
                   style={{ color: 'var(--text-primary)' }}>
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-xs capitalize"
                   style={{ color: 'var(--text-secondary)' }}>{user.role}</p>
              </div>
            </NavLink>
          </div>
        )}
      </aside>
    </>
  );
}