import api from './client';

export const questionBankApi = {
  // Categories
  listCategories:    (courseId)             => api.get(`/courses/${courseId}/question-bank/categories`),
  createCategory:    (courseId, data)       => api.post(`/courses/${courseId}/question-bank/categories`, data),
  updateCategory:    (courseId, id, data)   => api.patch(`/courses/${courseId}/question-bank/categories/${id}`, data),
  deleteCategory:    (courseId, id)         => api.delete(`/courses/${courseId}/question-bank/categories/${id}`),

  // Questions
  listQuestions:     (courseId, params)     => api.get(`/courses/${courseId}/question-bank/questions`, { params }),
  createQuestion:    (courseId, data)       => api.post(`/courses/${courseId}/question-bank/questions`, data),
  updateQuestion:    (courseId, id, data)   => api.patch(`/courses/${courseId}/question-bank/questions/${id}`, data),
  deleteQuestion:    (courseId, id)         => api.delete(`/courses/${courseId}/question-bank/questions/${id}`),

  // Import into quiz
  importToQuiz:      (courseId, quizId, data) => api.post(`/courses/${courseId}/question-bank/quizzes/${quizId}/import`, data),
};
