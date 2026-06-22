import api from './client';

export const coursesApi = {
  list:           (params) => api.get('/courses', { params }),
  get:            (slug)   => api.get(`/courses/${slug}`),
  categories:     ()       => api.get('/courses/categories'),
  myCourses:      (params) => api.get('/courses/my-courses', { params }),
  create:         (data)   => api.post('/courses', data),
  update:         (id, d)  => api.patch(`/courses/${id}`, d),
  publish:        (id)     => api.patch(`/courses/${id}/publish`),
  unpublish:      (id)     => api.patch(`/courses/${id}/unpublish`),
  delete:         (id)     => api.delete(`/courses/${id}`),
  uploadThumbnail:(id, fd) => api.post(`/courses/${id}/thumbnail`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  createSection:  (id, d)  => api.post(`/courses/${id}/sections`, d),
  updateSection:  (id,sid,d)=>api.patch(`/courses/${id}/sections/${sid}`, d),
  deleteSection:  (id,sid) => api.delete(`/courses/${id}/sections/${sid}`),
  reorderSections:(id,d)   => api.patch(`/courses/${id}/sections/reorder`, d),
};

export const lessonsApi = {
  list:           (courseId, lessonId) => api.get(`/courses/${courseId}/lessons/${lessonId}`),
  create:         (courseId, d)        => api.post(`/courses/${courseId}/lessons`, d),
  update:         (courseId, lessonId, d) => api.patch(`/courses/${courseId}/lessons/${lessonId}`, d),
  delete:         (courseId, lessonId) => api.delete(`/courses/${courseId}/lessons/${lessonId}`),
  reorder:        (courseId, d)        => api.patch(`/courses/${courseId}/lessons/reorder`, d),
  uploadVideo:    (courseId, lessonId, fd) =>
    api.post(`/courses/${courseId}/lessons/${lessonId}/video`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadResource: (courseId, lessonId, fd) =>
    api.post(`/courses/${courseId}/lessons/${lessonId}/resources`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteResource: (courseId, lessonId, resourceId) =>
    api.delete(`/courses/${courseId}/lessons/${lessonId}/resources/${resourceId}`),
};