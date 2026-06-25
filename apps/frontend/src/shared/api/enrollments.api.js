import api from './client';

export const enrollmentsApi = {
  enroll:         (courseId)                => api.post('/enrollments/enroll', { courseId }),
  myEnrollments:  ()                        => api.get('/enrollments/my'),
  list:           (params)                  => api.get('/enrollments', { params }),
  manualEnroll:   (data)                    => api.post('/enrollments/manual', data),
  revoke:         (enrollmentId)            => api.patch(`/enrollments/${enrollmentId}/revoke`),
  courseEnrollments: (courseId)             => api.get(`/enrollments/course/${courseId}`),
};
