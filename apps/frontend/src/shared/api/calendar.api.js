import api from './client';

export const calendarApi = {
  listEvents: (params) =>
    api.get('/calendar', { params }),

  createEvent: (data) =>
    api.post('/calendar', data),

  updateEvent: (id, data) =>
    api.patch(`/calendar/${id}`, data),

  deleteEvent: (id) =>
    api.delete(`/calendar/${id}`),
};
