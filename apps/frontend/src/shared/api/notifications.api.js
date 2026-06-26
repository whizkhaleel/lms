import api from './client';

export const notificationsApi = {
  getPreferences:    ()                 => api.get('/notifications/preferences'),
  updatePreference:  (type, data)       => api.patch(`/notifications/preferences/${type}`, data),
};
