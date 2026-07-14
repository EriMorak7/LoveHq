// db.js — localStorage-backed database + Groq AI calls for LoveHQ
// Replaces Electron preload.js contextBridge.exposeInMainWorld('db', {...})

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const CRITERIA = ['Attraction', 'Chemistry', 'Values', 'Communication', 'Future goals', 'Fun factor'];
  const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
  const GROQ_MODEL = 'llama-3.3-70b-versatile';

  // ── Storage keys ───────────────────────────────────────────────────────────
  const KEYS = {
    profile:        'llhq_user_profile',
    people:         'llhq_people',
    scores:         'llhq_scores',
    questionnaire:  'llhq_questionnaire_answers',
    scenarios:      'llhq_scenario_answers',
    logs:           'llhq_interaction_logs',
    clarity:        'llhq_clarity_messages',
    personNotes:    'llhq_person_notes',
    dailyJournal:   'llhq_daily_journal',
    dailyCheckin:   'llhq_daily_checkin',
    nextId:         'llhq_next_id',
  };

  // ── Low-level helpers ──────────────────────────────────────────────────────

  function _get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function _getArray(key) {
    return _get(key) || [];
  }

  function _nextId() {
    let id = _get(KEYS.nextId) || 1;
    _set(KEYS.nextId, id + 1);
    return id;
  }

  // ── User Profile ───────────────────────────────────────────────────────────

  async function getUserProfile() {
    return _get(KEYS.profile) || null;
  }

  async function saveUserProfile(data) {
    const existing = _get(KEYS.profile) || {};
    _set(KEYS.profile, { ...existing, ...data });
    return { success: true };
  }

  // ── People ─────────────────────────────────────────────────────────────────

  async function getPeople() {
    const people = _getArray(KEYS.people);
    const scores = _getArray(KEYS.scores);
    const logs = _getArray(KEYS.logs);
    const answers = _getArray(KEYS.questionnaire);

    return people.map(p => {
      const personScores = scores.filter(s => s.person_id === p.id);
      const scoreObj = {};
      CRITERIA.forEach(c => {
        const found = personScores.find(s => s.criterion === c);
        scoreObj[c] = found ? found.score : null;
      });
      return {
        ...p,
        scores: scoreObj,
        log_count: logs.filter(l => l.person_id === p.id).length,
        answer_count: answers.filter(a => a.person_id === p.id).length,
      };
    });
  }

  async function getPerson(id) {
    const people = _getArray(KEYS.people);
    const person = people.find(p => p.id === id);
    if (!person) return null;

    const scores = _getArray(KEYS.scores);
    const personScores = scores.filter(s => s.person_id === id);
    const scoreObj = {};
    CRITERIA.forEach(c => {
      const found = personScores.find(s => s.criterion === c);
      scoreObj[c] = found ? found.score : null;
    });

    return { ...person, scores: scoreObj };
  }

  async function addPerson(data) {
    const people = _getArray(KEYS.people);
    const id = _nextId();
    const person = {
      id,
      name: data.name || '',
      nickname: data.nickname || '',
      notes: data.notes || '',
      priority: data.priority || null,
      created_at: Date.now(),
    };
    people.push(person);
    _set(KEYS.people, people);
    return { id };
  }

  async function updatePersonNotes(data) {
    const people = _getArray(KEYS.people);
    const idx = people.findIndex(p => p.id === data.personId);
    if (idx !== -1) {
      people[idx].notes = data.notes;
      _set(KEYS.people, people);
    }
    return { success: true };
  }

  async function saveScores(data) {
    const { personId, scores: scoreValues } = data;
    let allScores = _getArray(KEYS.scores);

    // Remove existing scores for this person
    allScores = allScores.filter(s => s.person_id !== personId);

    // Add new scores
    CRITERIA.forEach((criterion, i) => {
      allScores.push({
        person_id: personId,
        criterion,
        score: scoreValues[i] != null ? scoreValues[i] : null,
      });
    });

    _set(KEYS.scores, allScores);
    return { success: true };
  }

  async function deletePerson(id) {
    // Remove person
    let people = _getArray(KEYS.people);
    people = people.filter(p => p.id !== id);
    _set(KEYS.people, people);

    // Remove scores
    let scores = _getArray(KEYS.scores);
    scores = scores.filter(s => s.person_id !== id);
    _set(KEYS.scores, scores);

    // Remove questionnaire answers
    let qa = _getArray(KEYS.questionnaire);
    qa = qa.filter(a => a.person_id !== id);
    _set(KEYS.questionnaire, qa);

    // Remove scenario answers
    let sa = _getArray(KEYS.scenarios);
    sa = sa.filter(a => a.person_id !== id);
    _set(KEYS.scenarios, sa);

    // Remove logs
    let logs = _getArray(KEYS.logs);
    logs = logs.filter(l => l.person_id !== id);
    _set(KEYS.logs, logs);

    // Remove clarity messages
    let clarity = _getArray(KEYS.clarity);
    clarity = clarity.filter(c => c.person_id !== id);
    _set(KEYS.clarity, clarity);

    // Remove person notes
    let notes = _getArray(KEYS.personNotes);
    notes = notes.filter(n => n.person_id !== id);
    _set(KEYS.personNotes, notes);

    // Remove daily checkins
    let checkins = _getArray(KEYS.dailyCheckin);
    checkins = checkins.filter(c => c.person_id !== id);
    _set(KEYS.dailyCheckin, checkins);

    return { success: true };
  }

  // ── Questionnaire ──────────────────────────────────────────────────────────

  async function getQuestionnaireAnswers(pid) {
    const all = _getArray(KEYS.questionnaire);
    const filtered = all.filter(a => a.person_id === pid);
    const result = {};
    filtered.forEach(a => {
      result[a.question_key] = a.answer;
    });
    return result;
  }

  async function saveQuestionnaireAnswer(data) {
    const all = _getArray(KEYS.questionnaire);
    const idx = all.findIndex(a => a.person_id === data.personId && a.question_key === data.questionKey);

    if (idx !== -1) {
      all[idx].answer = data.answer;
      all[idx].answered_at = Date.now();
    } else {
      all.push({
        person_id: data.personId,
        question_key: data.questionKey,
        answer: data.answer,
        answered_at: Date.now(),
      });
    }

    _set(KEYS.questionnaire, all);
    return { success: true };
  }

  async function saveQuestionnaireBatch(data) {
    const all = _getArray(KEYS.questionnaire);

    for (const [key, val] of Object.entries(data.answers)) {
      const idx = all.findIndex(a => a.person_id === data.personId && a.question_key === key);
      if (idx !== -1) {
        all[idx].answer = val;
        all[idx].answered_at = Date.now();
      } else {
        all.push({
          person_id: data.personId,
          question_key: key,
          answer: val,
          answered_at: Date.now(),
        });
      }
    }

    _set(KEYS.questionnaire, all);
    return { success: true };
  }

  // ── Scenarios ──────────────────────────────────────────────────────────────

  async function getScenarioAnswers(pid) {
    const all = _getArray(KEYS.scenarios);
    return all
      .filter(a => a.person_id === pid)
      .map(a => ({
        question: a.question,
        answer: a.answer,
        answered_at: a.answered_at,
        person_id: a.person_id,
      }));
  }

  async function saveScenarioAnswer(data) {
    const all = _getArray(KEYS.scenarios);
    all.push({
      id: _nextId(),
      person_id: data.personId,
      log_id: data.logId || null,
      question: data.question,
      answer: data.answer,
      answered_at: Date.now(),
    });
    _set(KEYS.scenarios, all);
    return { success: true };
  }

  // ── Logs ───────────────────────────────────────────────────────────────────

  async function getLogs(pid) {
    const all = _getArray(KEYS.logs);
    const filtered = pid ? all.filter(l => l.person_id === pid) : all;

    return filtered.map(l => ({
      id: l.id,
      person_id: l.person_id,
      personId: l.person_id,
      entry: l.entry,
      text: l.entry,
      mood: l.mood || null,
      vibe: l.vibe || null,
      logged_at: l.logged_at,
      ts: l.logged_at,
    }));
  }

  async function addLog(data) {
    const all = _getArray(KEYS.logs);
    const id = _nextId();
    all.push({
      id,
      person_id: data.personId,
      entry: data.text || '',
      mood: data.mood || null,
      vibe: data.vibe || null,
      logged_at: Date.now(),
    });
    _set(KEYS.logs, all);
    return { id };
  }

  async function deleteLog(id) {
    let all = _getArray(KEYS.logs);
    all = all.filter(l => l.id !== id);
    _set(KEYS.logs, all);
    return { success: true };
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async function getStats() {
    const people = _getArray(KEYS.people);
    const logs = _getArray(KEYS.logs);
    const clarity = _getArray(KEYS.clarity);

    // Find top person by log count
    let topPerson = null;
    if (people.length > 0) {
      let maxLogs = 0;
      people.forEach(p => {
        const count = logs.filter(l => l.person_id === p.id).length;
        if (count > maxLogs) {
          maxLogs = count;
          topPerson = p.name;
        }
      });
    }

    return {
      people_count: people.length,
      log_count: logs.length,
      ai_count: clarity.filter(m => m.role === 'assistant').length,
      top_person: topPerson,
    };
  }

  // ── Clarity ────────────────────────────────────────────────────────────────

  async function getClarityHistory(pid) {
    const all = _getArray(KEYS.clarity);
    return all
      .filter(m => m.person_id === pid)
      .sort((a, b) => a.sent_at - b.sent_at)
      .map(m => ({ role: m.role, content: m.content }));
  }

  async function saveClarityMessage(data) {
    const all = _getArray(KEYS.clarity);
    all.push({
      id: _nextId(),
      person_id: data.personId,
      role: data.role,
      content: data.content,
      sent_at: Date.now(),
    });
    _set(KEYS.clarity, all);
    return { success: true };
  }

  // ── AI Helpers ─────────────────────────────────────────────────────────────

  async function _groqChat(messages, apiKey, temperature = 0.7) {
    const resp = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Groq API error ${resp.status}: ${errBody}`);
    }

    const json = await resp.json();
    return json.choices[0].message.content;
  }

  // ── AI: Score Compatibility ────────────────────────────────────────────────

  async function aiScoreCompatibility(data) {
    const { userProfile, person, questionnaire, scenarios, apiKey } = data;

    const systemPrompt = `You are a relationship compatibility analyst. Given a user profile, a person's profile, questionnaire answers about them, and scenario answers, score the compatibility on these 6 criteria: ${CRITERIA.join(', ')}. 

Return ONLY a valid JSON object with this exact format:
{
  "scores": [number, number, number, number, number, number],
  "summary": "brief overall summary"
}

Each score should be 1-10. The scores array must be in this order: ${CRITERIA.join(', ')}.`;

    const userMessage = `User profile: ${JSON.stringify(userProfile)}

Person: ${JSON.stringify(person)}

Questionnaire answers: ${JSON.stringify(questionnaire)}

Scenario answers: ${JSON.stringify(scenarios)}`;

    const content = await _groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], apiKey, 0.5);

    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { scores: [5, 5, 5, 5, 5, 5], summary: content };
    }
  }

  // ── AI: Generate Scenario Question ─────────────────────────────────────────

  async function aiGenerateScenarioQuestion(data) {
    const { person, logText, apiKey } = data;

    const systemPrompt = `You generate thoughtful relationship scenario questions. Given context about a person and an interaction log, create ONE short scenario question that helps evaluate compatibility. Return ONLY the question text, nothing else.`;

    const userMessage = `Person: ${JSON.stringify(person)}
Recent interaction: ${logText || 'No specific interaction provided.'}`;

    const content = await _groqChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], apiKey, 0.8);

    return { question: content.trim() };
  }

  // ── AI: Clarity Chat ──────────────────────────────────────────────────────

  async function aiClarityChat(data) {
    const { messages, systemPrompt, apiKey } = data;

    const chatMessages = [];
    if (systemPrompt) {
      chatMessages.push({ role: 'system', content: systemPrompt });
    }
    if (messages && messages.length) {
      chatMessages.push(...messages);
    }

    const content = await _groqChat(chatMessages, apiKey, 0.7);
    return { role: 'assistant', content };
  }

  // ── AI: Generic Call ──────────────────────────────────────────────────────

  async function aiGenericCall(data) {
    const { systemPrompt, userMessage, apiKey } = data;

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    if (userMessage) messages.push({ role: 'user', content: userMessage });

    const content = await _groqChat(messages, apiKey, 0.7);
    return { content };
  }

  // ── AI: Transcribe Audio ──────────────────────────────────────────────────

  async function aiTranscribeAudio(data) {
    const { audioBuffer, apiKey } = data;

    const blob = audioBuffer instanceof Blob
      ? audioBuffer
      : new Blob([audioBuffer], { type: 'audio/webm' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');

    const resp = await fetch(GROQ_AUDIO_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Groq Audio API error ${resp.status}: ${errBody}`);
    }

    const json = await resp.json();
    return { text: json.text };
  }

  // ── New Features: PIN & Stealth ────────────────────────────────────────────

  async function savePin(pin) {
    const profile = _get(KEYS.profile) || {};
    profile.pin = pin;
    _set(KEYS.profile, profile);
    return { success: true };
  }

  async function toggleStealth(enable) {
    const profile = _get(KEYS.profile) || {};
    profile.stealth = !!enable;
    _set(KEYS.profile, profile);

    if (enable) {
      document.title = 'Notes';
    } else {
      document.title = 'LoveHQ';
    }

    return { success: true };
  }

  // ── New Features: Export ───────────────────────────────────────────────────

  async function exportData() {
    const data = {};
    for (const [name, key] of Object.entries(KEYS)) {
      data[name] = _get(key);
    }
    return JSON.stringify(data, null, 2);
  }

  // ── New Features: Re-Rank Priority ─────────────────────────────────────────

  async function reRankPriority(data) {
    const people = _getArray(KEYS.people);
    for (const [personId, rank] of Object.entries(data)) {
      const id = Number(personId);
      const idx = people.findIndex(p => p.id === id);
      if (idx !== -1) {
        people[idx].priority = rank;
      }
    }
    _set(KEYS.people, people);
    return { success: true };
  }

  // ── New Features: Daily Journal ────────────────────────────────────────────

  async function getDailyJournal() {
    const all = _getArray(KEYS.dailyJournal);
    return all.slice().sort((a, b) => b.created_at - a.created_at);
  }

  async function addDailyJournal(entry) {
    const all = _getArray(KEYS.dailyJournal);
    const id = _nextId();
    all.push({
      id,
      entry: typeof entry === 'string' ? entry : (entry.entry || ''),
      created_at: Date.now(),
    });
    _set(KEYS.dailyJournal, all);
    return { id };
  }

  async function deleteDailyJournal(id) {
    let all = _getArray(KEYS.dailyJournal);
    all = all.filter(j => j.id !== id);
    _set(KEYS.dailyJournal, all);
    return { success: true };
  }

  // ── New Features: Person Notes ─────────────────────────────────────────────

  async function getPersonNotes(id) {
    const all = _getArray(KEYS.personNotes);
    return all.filter(n => n.person_id === id);
  }

  async function addPersonNote(data) {
    const all = _getArray(KEYS.personNotes);
    const id = _nextId();
    all.push({
      id,
      person_id: data.personId,
      note: data.note || '',
      created_at: Date.now(),
    });
    _set(KEYS.personNotes, all);
    return { id };
  }

  async function deletePersonNote(id) {
    let all = _getArray(KEYS.personNotes);
    all = all.filter(n => n.id !== id);
    _set(KEYS.personNotes, all);
    return { success: true };
  }

  // ── New Features: Daily Check-in ───────────────────────────────────────────

  async function getDailyCheckin(dateStr) {
    const all = _getArray(KEYS.dailyCheckin);
    const found = all.find(c => c.logged_date === dateStr);
    return found || null;
  }

  async function saveDailyCheckin(data) {
    const all = _getArray(KEYS.dailyCheckin);
    const existing = all.findIndex(c => c.logged_date === data.dateStr);

    if (existing !== -1) {
      all[existing].person_id = data.personId;
    } else {
      all.push({
        id: _nextId(),
        person_id: data.personId,
        logged_date: data.dateStr,
      });
    }

    _set(KEYS.dailyCheckin, all);
    return { success: true };
  }

  // ── Expose on window ──────────────────────────────────────────────────────

  window.db = {
    // User profile
    getUserProfile,
    saveUserProfile,

    // People
    getPeople,
    getPerson,
    addPerson,
    updatePersonNotes,
    saveScores,
    deletePerson,

    // Questionnaire
    getQuestionnaireAnswers,
    saveQuestionnaireAnswer,
    saveQuestionnaireBatch,

    // Scenarios
    getScenarioAnswers,
    saveScenarioAnswer,

    // Logs
    getLogs,
    addLog,
    deleteLog,

    // Stats
    getStats,

    // Clarity
    getClarityHistory,
    saveClarityMessage,

    // AI
    aiScoreCompatibility,
    aiGenerateScenarioQuestion,
    aiClarityChat,
    aiGenericCall,
    aiTranscribeAudio,

    // New features
    savePin,
    toggleStealth,
    exportData,
    reRankPriority,
    getDailyJournal,
    addDailyJournal,
    deleteDailyJournal,
    getPersonNotes,
    addPersonNote,
    deletePersonNote,
    getDailyCheckin,
    saveDailyCheckin,
  };

})();
