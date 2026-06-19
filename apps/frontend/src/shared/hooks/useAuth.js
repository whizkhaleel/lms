import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore }   from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { authApi }        from '../api/auth.api';

export function useAuth() {
  const { user, setAuth, logout: clearAuth, isAuthenticated, isAdmin, isInstructor } = useAuthStore();
  const { connect, disconnect } = useSocketStore();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ data }) => {
      const { user, accessToken, refreshToken } = data.data;
      setAuth(user, accessToken, refreshToken);
      connect(user.id);
      toast.success(`Welcome back, ${user.first_name}!`);
      // Role-based redirect
      if (['admin','super_admin'].includes(user.role)) navigate('/admin');
      else if (user.role === 'instructor') navigate('/instructor');
      else navigate('/dashboard');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Login failed'),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => {
      toast.success('Account created! Please check your email to verify.');
      navigate('/login');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Registration failed'),
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout({ refreshToken: useAuthStore.getState().refreshToken }),
    onSettled: () => {
      clearAuth();
      disconnect();
      queryClient.clear();
      navigate('/login');
      toast.success('Logged out');
    },
  });

  return {
    user,
    isAuthenticated: isAuthenticated(),
    isAdmin:         isAdmin(),
    isInstructor:    isInstructor(),
    login:    loginMutation.mutate,
    register: registerMutation.mutate,
    logout:   logoutMutation.mutate,
    loginLoading:    loginMutation.isPending,
    registerLoading: registerMutation.isPending,
  };
}