import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSocketStore } from '../stores/socketStore';
import api from '../api/client';

export function useNotifications() {
  const queryClient = useQueryClient();
  const socket      = useSocketStore((s) => s.socket);

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn:  () => api.get('/notifications/unread-count').then(r => r.data.data.count),
    refetchInterval: 30000,
  });

  // Real-time: increment badge when new notification arrives
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [socket, queryClient]);

  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read', {}),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return { unreadCount: data ?? 0, markAllRead: markAllRead.mutate };
}