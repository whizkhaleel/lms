import api from './client';

export const paymentsApi = {
  listPending: (params) =>
    api.get('/enrollments/pending', { params }),

  approve: (paymentId) =>
    api.post(`/enrollments/pending/${paymentId}/approve`),

  reject: (paymentId, reason) =>
    api.post(`/enrollments/pending/${paymentId}/reject`, { reason }),
};
