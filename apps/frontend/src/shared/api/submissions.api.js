import api from './client';

export const submissionsApi = {
  // Assignments (instructor)
  createAssignment: (data)              => api.post('/submissions/assignments', data),
  updateAssignment: (id, data)          => api.patch(`/submissions/assignments/${id}`, data),
  getAssignment:    (id)                => api.get(`/submissions/assignments/${id}`),
  listAssignmentsByCourse: (courseId)   => api.get('/submissions/assignments', { params: { courseId } }),

  // Student submission
  submit:           (assignmentId, fd)  => api.post(`/submissions/assignments/${assignmentId}/submit`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  mySubmission:     (assignmentId)      => api.get(`/submissions/assignments/${assignmentId}/my-submission`),

  // Grading (instructor)
  listSubmissions:  (assignmentId)      => api.get(`/submissions/assignments/${assignmentId}/submissions`),
  getSubmission:    (submissionId)      => api.get(`/submissions/submissions/${submissionId}`),
  grade:            (submissionId, data)=> api.patch(`/submissions/submissions/${submissionId}/grade`, data),

  // Gradebook
  gradebook:        (courseId)          => api.get(`/submissions/gradebook/${courseId}`),
  gradebookForUser: (courseId, userId)  => api.get(`/submissions/gradebook/${courseId}/user/${userId}`),
};