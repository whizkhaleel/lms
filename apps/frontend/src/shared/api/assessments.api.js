import api from './client';

export const assessmentsApi = {
  createQuiz: (data)          => api.post('/assessments/quizzes', data),
  updateQuiz: (id, data)      => api.patch(`/assessments/quizzes/${id}`, data),
  getQuiz:    (id)            => api.get(`/assessments/quizzes/${id}`),

  addQuestion:    (quizId, data)            => api.post(`/assessments/quizzes/${quizId}/questions`, data),
  updateQuestion: (quizId, questionId, data) => api.patch(`/assessments/quizzes/${quizId}/questions/${questionId}`, data),
  deleteQuestion: (quizId, questionId)       => api.delete(`/assessments/quizzes/${quizId}/questions/${questionId}`),
};
