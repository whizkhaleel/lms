import api from './client';

export const announcementsApi = {
  list:   (courseId)              => api.get(`/courses/${courseId}/announcements`),
  create: (courseId, data)        => api.post(`/courses/${courseId}/announcements`, data),
  update: (courseId, id, data)    => api.patch(`/courses/${courseId}/announcements/${id}`, data),
  delete: (courseId, id)          => api.delete(`/courses/${courseId}/announcements/${id}`),
};
