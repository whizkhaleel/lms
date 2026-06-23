import api from './client';

export const analyticsApi = {
  courseAnalytics: (courseId) => api.get(`/progress/analytics/courses/${courseId}`),
};
