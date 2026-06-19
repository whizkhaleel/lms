import api from './client';

export const coursesApi = {
  list:           (params) => api.get('/courses', { params }),
  get:            (slug)   => api.get(`/courses/${slug}`),
  categories:     ()       => api.get('/courses/categories'),
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
  myCourses:      ()       => api.get('/users/profile/courses'),
};