const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('db', {
  // User profile
  getUserProfile:       ()     => ipcRenderer.invoke('get-user-profile'),
  saveUserProfile:      (data) => ipcRenderer.invoke('save-user-profile', data),

  // People
  getPeople:            ()     => ipcRenderer.invoke('get-people'),
  getPerson:            (id)   => ipcRenderer.invoke('get-person', id),
  addPerson:            (data) => ipcRenderer.invoke('add-person', data),
  updatePersonNotes:    (data) => ipcRenderer.invoke('update-person-notes', data),
  saveScores:           (data) => ipcRenderer.invoke('save-scores', data),
  deletePerson:         (id)   => ipcRenderer.invoke('delete-person', id),

  // Questionnaire
  getQuestionnaireAnswers:  (pid)  => ipcRenderer.invoke('get-questionnaire-answers', pid),
  saveQuestionnaireAnswer:  (data) => ipcRenderer.invoke('save-questionnaire-answer', data),
  saveQuestionnaireBatch:   (data) => ipcRenderer.invoke('save-questionnaire-batch', data),

  // Scenarios
  getScenarioAnswers:    (pid)  => ipcRenderer.invoke('get-scenario-answers', pid),
  saveScenarioAnswer:    (data) => ipcRenderer.invoke('save-scenario-answer', data),

  // Logs
  getLogs:               (pid)  => ipcRenderer.invoke('get-logs', pid),
  addLog:                (data) => ipcRenderer.invoke('add-log', data),
  deleteLog:             (id)   => ipcRenderer.invoke('delete-log', id),

  // Stats
  getStats:              ()     => ipcRenderer.invoke('get-stats'),

  // Clarity
  getClarityHistory:     (pid)  => ipcRenderer.invoke('get-clarity-history', pid),
  saveClarityMessage:    (data) => ipcRenderer.invoke('save-clarity-message', data),

  // AI
  aiScoreCompatibility:       (data) => ipcRenderer.invoke('ai-score-compatibility', data),
  aiGenerateScenarioQuestion: (data) => ipcRenderer.invoke('ai-generate-scenario-question', data),
  aiClarityChat:              (data) => ipcRenderer.invoke('ai-clarity-chat', data),
  aiGenericCall:              (data) => ipcRenderer.invoke('ai-generic-call', data),

  // New Features
  savePin:               (pin) => ipcRenderer.invoke('save-pin', pin),
  toggleStealth:         (enable) => ipcRenderer.invoke('toggle-stealth', enable),
  exportData:            () => ipcRenderer.invoke('export-data'),
  reRankPriority:        (data) => ipcRenderer.invoke('re-rank-priority', data),
  getDailyJournal:       () => ipcRenderer.invoke('get-daily-journal'),
  addDailyJournal:       (entry) => ipcRenderer.invoke('add-daily-journal', entry),
  deleteDailyJournal:    (id) => ipcRenderer.invoke('delete-daily-journal', id),
  getPersonNotes:        (id) => ipcRenderer.invoke('get-person-notes', id),
  addPersonNote:         (data) => ipcRenderer.invoke('add-person-note', data),
  deletePersonNote:      (id) => ipcRenderer.invoke('delete-person-note', id),
  getDailyCheckin:       (dateStr) => ipcRenderer.invoke('get-daily-checkin', dateStr),
  saveDailyCheckin:      (data) => ipcRenderer.invoke('save-daily-checkin', data),
  aiTranscribeAudio:     (data) => ipcRenderer.invoke('ai-transcribe-audio', data),
});
