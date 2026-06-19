import { useState } from 'react';
import { Outlet }   from 'react-router-dom';
import Navbar   from './Navbar';
import Sidebar  from './Sidebar';
import { useAuth } from '../../hooks/useAuth';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen">
      <Navbar onMenuToggle={() => setSidebarOpen(v => !v)} />

      <div className="flex pt-16">
        {isAuthenticated && (
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}

        <main className={`flex-1 min-w-0 transition-all duration-300 ${
          isAuthenticated ? 'lg:ml-64' : ''
        }`}>
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

// Auth layout — no sidebar, centered
export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4
                    bg-[#0D1B2A]">
      <Outlet />
    </div>
  );
}

// Classroom layout — full width, no padding
export function ClassroomLayout() {
  return (
    <div className="min-h-screen pt-16">
      <Navbar />
      <Outlet />
    </div>
  );
}