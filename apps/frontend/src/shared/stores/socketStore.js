import { create } from 'zustand';
import { io }     from 'socket.io-client';

export const useSocketStore = create((set, get) => ({
  socket:    null,
  connected: false,

  connect: (userId) => {
    if (get().socket?.connected) return;

    const socket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || '', {
      withCredentials: true,
      transports:      ['websocket'],
    });

    socket.on('connect', () => {
      set({ connected: true });
      socket.emit('join_user', userId);
    });

    socket.on('disconnect', () => set({ connected: false }));

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, connected: false });
  },
}));