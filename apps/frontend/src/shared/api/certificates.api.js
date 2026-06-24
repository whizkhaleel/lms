import api from './client';

export const certificatesApi = {
  myCertificates: ()              => api.get('/certificates/my'),
  myXp:           ()              => api.get('/certificates/my/xp'),
  leaderboard:    (limit = 50)    => api.get('/certificates/leaderboard', { params: { limit } }),
  courseCertificates: (courseId)  => api.get(`/certificates/courses/${courseId}`),
};
