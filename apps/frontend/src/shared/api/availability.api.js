import api from './client';

export const availabilityApi = {
  getAvailability: (courseId, lessonId) =>
    api.get(`/courses/${courseId}/lessons/${lessonId}/availability`).then(r => r.data.data),

  evaluateLesson: (courseId, lessonId) =>
    api.get(`/courses/${courseId}/lessons/${lessonId}/availability/check`).then(r => r.data.data),

  setAvailability: (courseId, lessonId, conditions) =>
    api.put(`/courses/${courseId}/lessons/${lessonId}/availability`, { conditions }),

  evaluateCourse: (courseId) =>
    api.get(`/courses/${courseId}/lessons/availability`).then(r => r.data.data),
};
