import api from './client';

export const forumsApi = {
  listThreads: (courseId, params) =>
    api.get(`/courses/${courseId}/forums`, { params }),

  createThread: (courseId, data) =>
    api.post(`/courses/${courseId}/forums`, data),

  getThread: (courseId, threadId) =>
    api.get(`/courses/${courseId}/forums/${threadId}`),

  updateThread: (courseId, threadId, data) =>
    api.patch(`/courses/${courseId}/forums/${threadId}`, data),

  deleteThread: (courseId, threadId) =>
    api.delete(`/courses/${courseId}/forums/${threadId}`),

  pinThread: (courseId, threadId) =>
    api.patch(`/courses/${courseId}/forums/${threadId}/pin`),

  lockThread: (courseId, threadId) =>
    api.patch(`/courses/${courseId}/forums/${threadId}/lock`),

  listPosts: (courseId, threadId, params) =>
    api.get(`/courses/${courseId}/forums/${threadId}/posts`, { params }),

  createPost: (courseId, threadId, data) =>
    api.post(`/courses/${courseId}/forums/${threadId}/posts`, data),

  updatePost: (courseId, threadId, postId, data) =>
    api.patch(`/courses/${courseId}/forums/${threadId}/posts/${postId}`, data),

  deletePost: (courseId, threadId, postId) =>
    api.delete(`/courses/${courseId}/forums/${threadId}/posts/${postId}`),

  markAsAnswer: (courseId, threadId, postId) =>
    api.patch(`/courses/${courseId}/forums/${threadId}/posts/${postId}/answer`),

  toggleReaction: (courseId, threadId, postId, emoji) =>
    api.post(`/courses/${courseId}/forums/${threadId}/posts/${postId}/react`, { emoji }),
};
