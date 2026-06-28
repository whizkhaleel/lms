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

const NavItem = ({ to, icon: Icon, label, end = false, badge }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
      isActive
        ? 'bg-[#1A6FBF]/20 text-[#3B9EE8] border border-[#1A6FBF]/30'
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

const SectionLabel = ({ label }) => (
  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mt-5 mb-1">
    {label}
  </p>
);

export default function Sidebar({ open, onClose }) {
  const { user, isAdmin, isInstructor } = useAuth();
  const { unreadCount } = useNotifications();

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
        'bg-[#0D1B2A] border-r border-[rgba(59,158,232,0.1)]',
        'flex flex-col overflow-y-auto',
        'transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="flex flex-col gap-1 p-3 flex-1">

          {/* Student / Admin learning nav (hidden for pure instructors) */}
          {user && user.role !== 'instructor' && (
            <>
              <SectionLabel label="Learning" />
              <NavItem to="/dashboard"  icon={LayoutDashboard} label="My Dashboard" end />
              <NavItem to="/courses"    icon={Library}         label="Course Catalog" />
              <NavItem to="/messages"   icon={MessageSquare}   label="Messages" />
              <NavItem to="/notifications" icon={Bell}         label="Notifications" badge={unreadCount} />
            </>
          )}

          {/* Instructor nav */}
          {isInstructor && (
            <>
              <SectionLabel label="Teaching" />
              <NavItem to="/instructor"              icon={GraduationCap} label="Instructor Panel" end />
              <NavItem to="/instructor/courses"      icon={BookOpen}      label="My Courses" />
              <NavItem to="/instructor/students"   icon={Users}         label="My Students" />
              <NavItem to="/instructor/gradebook"  icon={Award}        label="Gradebook" />
              <NavItem to="/instructor/submissions"  icon={FileText}      label="Submissions" />
              <NavItem to="/instructor/analytics"    icon={BarChart3}     label="Analytics" />
            </>
          )}

          {/* Admin nav */}
          {isAdmin && (
            <>
              <SectionLabel label="Administration" />
              <NavItem to="/admin"             icon={Settings}        label="Admin Panel" end />
              <NavItem to="/admin/users"       icon={Users}           label="Users" />
              <NavItem to="/admin/courses"     icon={BookOpen}        label="All Courses" />
              <NavItem to="/admin/courses/new" icon={PlusCircle}     label="Create Course" />
              <NavItem to="/admin/enrollments" icon={GraduationCap}   label="Enrollments" />
              <NavItem to="/admin/analytics"   icon={BarChart3}       label="Analytics" />
              <NavItem to="/admin/payments"  icon={CreditCard}      label="Payments" />
              <NavItem to="/admin/audit-logs" icon={FileText}        label="Audit Logs" />
              <NavItem to="/admin/settings"   icon={Settings}        label="Settings" />
            </>
          )}

          {/* Separator + Calendar (visible to all roles) */}
          <div className="mt-2 pt-2 border-t border-gray-800">
            <NavItem to="/calendar" icon={CalendarIcon} label="Calendar" />
          </div>

        </div>

        {/* Bottom profile strip */}
        {user && (
          <div className="p-3 border-t border-gray-800">
            <NavLink
              to="/profile"
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#1A6FBF]
                              flex items-center justify-center
                              text-white text-xs font-bold flex-shrink-0">
                {user.first_name?.[0]}{user.last_name?.[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
            </NavLink>
          </div>
        )}
      </aside>
    </>
  );
}