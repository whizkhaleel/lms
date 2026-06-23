import api from './client';

export const enrollmentsApi = {
  enroll:         (courseId)                => api.post('/enrollments/enroll', { courseId }),
  myEnrollments:  ()                        => api.get('/enrollments/my'),
  list:           (params)                  => api.get('/enrollments', { params }),
  manualEnroll:   (data)                    => api.post('/enrollments/manual', data),
  revoke:         (enrollmentId)            => api.patch(`/enrollments/${enrollmentId}/revoke`),
  courseEnrollments: (courseId)             => api.get(`/enrollments/course/${courseId}`),
  listPayments:   (params)                  => api.get('/enrollments/payments', { params }),
  recordPayment:  (data)                    => api.post('/enrollments/payments', data),
  confirmPayment: (id)                      => api.patch(`/enrollments/payments/${id}/confirm`),
  rejectPayment:  (id, reason)              => api.patch(`/enrollments/payments/${id}/reject`, { reason }),
  listGateway:    (params)                  => api.get('/enrollments/payments/gateway', { params }),
  approveGateway: (id)                      => api.patch(`/enrollments/payments/gateway/${id}/approve`),
  rejectGateway:  (id, reason)              => api.patch(`/enrollments/payments/gateway/${id}/reject`, { reason }),
};
