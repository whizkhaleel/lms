import api from './client';

export const authApi = {
  login:         (data)    => api.post('/auth/login', data),
  logout:        (data)    => api.post('/auth/logout', data),
  refresh:       (data)    => api.post('/auth/refresh', data),
  me:            ()        => api.get('/auth/me'),
  verifyEmail:   (token)   => api.get(`/auth/verify-email?token=${token}`),
  forgotPassword:(data)    => api.post('/auth/forgot-password', data),
  resetPassword: (data)    => api.post('/auth/reset-password', data),
};