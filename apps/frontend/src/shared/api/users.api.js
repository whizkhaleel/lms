import api from './client';

export const usersApi = {
  getProfile:     ()        => api.get('/users/profile'),
  updateProfile:  (data)    => api.patch('/users/profile', data),
  changePassword: (data)    => api.patch('/users/password', data),

  // Admin
  list:           (params)  => api.get('/users', { params }),
  get:            (id)      => api.get(`/users/${id}`),
  updateRole:     (id, role)   => api.patch(`/users/${id}/role`,   { role }),
  updateStatus:   (id, status) => api.patch(`/users/${id}/status`, { status }),
  delete:         (id)      => api.delete(`/users/${id}`),
};