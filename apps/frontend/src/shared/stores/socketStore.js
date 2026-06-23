import { create } from 'zustand';
import { io }     from 'socket.io-client';
import { useAuthStore } from './authStore';

export const useSocketStore = create((set, get) => ({
  socket:    null,
  connected: false,

  connect: (userId) => {
    if (get().socket?.connected) return;

    const token = useAuthStore.getState().accessToken;
    const socket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || '', {
      withCredentials: true,
      transports:      ['websocket', 'polling'],
      auth:            { token },
    });

    socket.on('connect', () => {
      set({ connected: true });
      socket.emit('join_user', userId);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socket.on('disconnect', () => set({ connected: false }));

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, connected: false });
  },
}));