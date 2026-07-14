const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Database } = require('node-sqlite3-wasm');

const dbPath = path.join(app.getPath('userData'), 'love-life-hq.db');
let db;

function initDB() {
  db = new Database(dbPath);
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id            INTEGER PRIMARY KEY CHECK(id = 1),
      name          TEXT NOT NULL DEFAULT '',
      personality   TEXT NOT NULL DEFAULT '',
      core_values   TEXT NOT NULL DEFAULT '',
      goals         TEXT NOT NULL DEFAULT '',
      dealbreakers  TEXT NOT NULL DEFAULT '',
      hobbies       TEXT NOT NULL DEFAULT '',
      love_language TEXT NOT NULL DEFAULT '',
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  // Core person record — lightweight at creation
  db.run(`
    CREATE TABLE IF NOT EXISTS people (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      met        TEXT    NOT NULL DEFAULT '',
      status     TEXT    NOT NULL DEFAULT 'Talking',
      notes      TEXT    NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  // Structured questionnaire answers — one row per question per person
  db.run(`
    CREATE TABLE IF NOT EXISTS questionnaire_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id   INTEGER NOT NULL,
      question_key TEXT   NOT NULL,
      answer      TEXT    NOT NULL,
      answered_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      UNIQUE(person_id, question_key)
    )
  `);

  // Scenario follow-up answers — tied to a specific log entry
  db.run(`
    CREATE TABLE IF NOT EXISTS scenario_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id   INTEGER NOT NULL,
      log_id      INTEGER,
      question    TEXT    NOT NULL,
      answer      TEXT    NOT NULL,
      answered_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      criterion TEXT    NOT NULL,
      score     INTEGER NOT NULL DEFAULT 5,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS interaction_logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      entry     TEXT    NOT NULL,
      mood      TEXT    NOT NULL DEFAULT 'happy',
      vibe      INTEGER NOT NULL DEFAULT 5,
      logged_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clarity_messages (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      role      TEXT    NOT NULL,
      content   TEXT    NOT NULL,
      sent_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS person_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id   INTEGER NOT NULL,
      note        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_journal (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entry       TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS daily_checkin (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id   INTEGER,
      logged_date TEXT    NOT NULL UNIQUE,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
    )
  `);

  try { db.run(`ALTER TABLE user_profile ADD COLUMN pin TEXT DEFAULT ''`); } catch (e) {}
  try { db.run(`ALTER TABLE user_profile ADD COLUMN stealth_mode INTEGER DEFAULT 0`); } catch (e) {}
  try { db.run(`ALTER TABLE people ADD COLUMN priority_rank INTEGER DEFAULT 0`); } catch (e) {}
  try { db.run(`ALTER TABLE user_profile ADD COLUMN theme TEXT DEFAULT 'midnight'`); } catch (e) {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 800, minHeight: 560,
    title: 'Love Life HQ',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1224',
    show: false,
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  initDB();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const CRITERIA = ['Attraction', 'Chemistry', 'Values', 'Communication', 'Future goals', 'Fun factor'];

// ── User Profile ──────────────────────────────────────────────

ipcMain.handle('get-user-profile', () => {
  return db.get('SELECT * FROM user_profile WHERE id = 1') || null;
});

ipcMain.handle('save-user-profile', (_, data) => {
  const existing = db.get('SELECT id FROM user_profile WHERE id = 1');
  if (existing) {
    db.run(`UPDATE user_profile SET
      name=?, personality=?, core_values=?, goals=?, dealbreakers=?, hobbies=?, love_language=?,
      updated_at=(strftime('%s','now') * 1000) WHERE id=1`,
      [data.name, data.personality, data.core_values, data.goals, data.dealbreakers, data.hobbies, data.love_language]
    );
  } else {
    db.run(`INSERT INTO user_profile (id,name,personality,core_values,goals,dealbreakers,hobbies,love_language,pin,stealth_mode)
      VALUES (1,?,?,?,?,?,?,?,'',0)`,
      [data.name, data.personality, data.core_values, data.goals, data.dealbreakers, data.hobbies, data.love_language]
    );
  }
  return { success: true };
});

ipcMain.handle('save-pin', (_, pin) => {
  db.run('UPDATE user_profile SET pin = ? WHERE id = 1', [pin]);
  return { success: true };
});

ipcMain.handle('toggle-stealth', (_, enable) => {
  db.run('UPDATE user_profile SET stealth_mode = ? WHERE id = 1', [enable ? 1 : 0]);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.setTitle(enable ? 'Study Tracker' : 'Love Life HQ');
  return { success: true };
});

ipcMain.handle('export-data', () => {
  const data = {
    user_profile: db.get('SELECT * FROM user_profile WHERE id = 1'),
    people: db.all('SELECT * FROM people'),
    questionnaire_answers: db.all('SELECT * FROM questionnaire_answers'),
    scenario_answers: db.all('SELECT * FROM scenario_answers'),
    scores: db.all('SELECT * FROM scores'),
    interaction_logs: db.all('SELECT * FROM interaction_logs'),
    clarity_messages: db.all('SELECT * FROM clarity_messages'),
    person_notes: db.all('SELECT * FROM person_notes'),
    daily_journal: db.all('SELECT * FROM daily_journal'),
    daily_checkin: db.all('SELECT * FROM daily_checkin')
  };
  return JSON.stringify(data, null, 2);
});

// ── People ────────────────────────────────────────────────────

ipcMain.handle('get-people', () => {
  const rows = db.all('SELECT * FROM people ORDER BY created_at DESC');
  return rows.map(row => {
    const scoreRows = db.all('SELECT criterion, score FROM scores WHERE person_id = ?', [row.id]);
    const scoreMap  = Object.fromEntries(scoreRows.map(s => [s.criterion, s.score]));
    const scores    = CRITERIA.map(c => scoreMap[c] ?? 0);
    const logCount  = db.get('SELECT COUNT(*) as cnt FROM interaction_logs WHERE person_id = ?', [row.id]).cnt;
    const answerCount = db.get('SELECT COUNT(*) as cnt FROM questionnaire_answers WHERE person_id = ?', [row.id]).cnt;
    return { ...row, scores, log_count: logCount, answer_count: answerCount };
  });
});

ipcMain.handle('get-person', (_, id) => {
  const row = db.get('SELECT * FROM people WHERE id = ?', [id]);
  if (!row) return null;
  const scoreRows = db.all('SELECT criterion, score FROM scores WHERE person_id = ?', [id]);
  const scoreMap  = Object.fromEntries(scoreRows.map(s => [s.criterion, s.score]));
  row.scores = CRITERIA.map(c => scoreMap[c] ?? 0);
  return row;
});

ipcMain.handle('add-person', (_, data) => {
  db.run(
    `INSERT INTO people (name,met,status,notes) VALUES (?,?,?,?)`,
    [data.name, data.met || '', data.status || 'Talking', data.notes || '']
  );
  const id = db.get('SELECT last_insert_rowid() as id').id;
  return { id };
});

ipcMain.handle('update-person-notes', (_, { personId, notes }) => {
  db.run('UPDATE people SET notes = ? WHERE id = ?', [notes, personId]);
  return { success: true };
});

ipcMain.handle('save-scores', (_, { personId, scores }) => {
  db.run('DELETE FROM scores WHERE person_id = ?', [personId]);
  CRITERIA.forEach((criterion, i) => {
    db.run('INSERT INTO scores (person_id, criterion, score) VALUES (?, ?, ?)',
      [personId, criterion, Math.min(10, Math.max(0, Math.round(scores[i] ?? 5)))]);
  });
  return { success: true };
});

ipcMain.handle('delete-person', (_, id) => {
  db.run('DELETE FROM people WHERE id = ?', [id]);
  return { success: true };
});

ipcMain.handle('re-rank-priority', (_, rankMap) => {
  // rankMap is { personId: newRank }
  for (const [id, rank] of Object.entries(rankMap)) {
    db.run('UPDATE people SET priority_rank = ? WHERE id = ?', [rank, id]);
  }
  return { success: true };
});

// ── Questionnaire answers ───────────────────────────────────────

ipcMain.handle('get-questionnaire-answers', (_, personId) => {
  const rows = db.all('SELECT question_key, answer FROM questionnaire_answers WHERE person_id = ?', [personId]);
  return Object.fromEntries(rows.map(r => [r.question_key, r.answer]));
});

ipcMain.handle('save-questionnaire-answer', (_, { personId, questionKey, answer }) => {
  db.run(`
    INSERT INTO questionnaire_answers (person_id, question_key, answer)
    VALUES (?, ?, ?)
    ON CONFLICT(person_id, question_key) DO UPDATE SET answer=excluded.answer, answered_at=(strftime('%s','now') * 1000)
  `, [personId, questionKey, answer]);
  return { success: true };
});

ipcMain.handle('save-questionnaire-batch', (_, { personId, answers }) => {
  Object.entries(answers).forEach(([key, val]) => {
    if (val === undefined || val === null || val === '') return;
    db.run(`
      INSERT INTO questionnaire_answers (person_id, question_key, answer)
      VALUES (?, ?, ?)
      ON CONFLICT(person_id, question_key) DO UPDATE SET answer=excluded.answer, answered_at=(strftime('%s','now') * 1000)
    `, [personId, key, String(val)]);
  });
  return { success: true };
});

// ── Scenario answers ─────────────────────────────────────────────

ipcMain.handle('get-scenario-answers', (_, personId) => {
  return db.all('SELECT * FROM scenario_answers WHERE person_id = ? ORDER BY answered_at DESC', [personId]);
});

ipcMain.handle('save-scenario-answer', (_, { personId, logId, question, answer }) => {
  db.run('INSERT INTO scenario_answers (person_id, log_id, question, answer) VALUES (?, ?, ?, ?)',
    [personId, logId || null, question, answer]);
  return { success: true };
});

// ── Logs ──────────────────────────────────────────────────────

ipcMain.handle('get-logs', (_, personId) => {
  const rows = personId
    ? db.all('SELECT * FROM interaction_logs WHERE person_id = ? ORDER BY logged_at DESC', [personId])
    : db.all('SELECT * FROM interaction_logs ORDER BY logged_at DESC');
  return rows.map(r => ({ ...r, personId: r.person_id, text: r.entry, ts: r.logged_at }));
});

ipcMain.handle('add-log', (_, { personId, text, mood, vibe }) => {
  db.run('INSERT INTO interaction_logs (person_id, entry, mood, vibe) VALUES (?, ?, ?, ?)',
    [personId, text, mood, Math.min(10, Math.max(1, vibe))]);
  const id = db.get('SELECT last_insert_rowid() as id').id;
  return { id };
});

ipcMain.handle('delete-log', (_, id) => {
  db.run('DELETE FROM interaction_logs WHERE id = ?', [id]);
  return { success: true };
});

// ── Stats ─────────────────────────────────────────────────────

ipcMain.handle('get-stats', () => {
  const peopleCount = db.get('SELECT COUNT(*) as c FROM people').c;
  const logCount    = db.get('SELECT COUNT(*) as c FROM interaction_logs').c;
  const aiCount     = db.get("SELECT COUNT(*) as c FROM clarity_messages WHERE role='assistant'").c;
  const top = db.get(`SELECT p.name, AVG(s.score) as avg_score FROM people p
    JOIN scores s ON s.person_id = p.id GROUP BY p.id ORDER BY avg_score DESC LIMIT 1`);
  return {
    people_count: peopleCount, log_count: logCount, ai_count: aiCount,
    top_person: top ? `${top.name.split(' ')[0]} ${Math.round(top.avg_score * 10) / 10}` : null,
  };
});

// ── Clarity ───────────────────────────────────────────────────

ipcMain.handle('get-clarity-history', (_, personId) => {
  return db.all('SELECT role, content FROM clarity_messages WHERE person_id = ? ORDER BY sent_at ASC', [personId]);
});

ipcMain.handle('save-clarity-message', (_, { personId, role, content }) => {
  db.run('INSERT INTO clarity_messages (person_id, role, content) VALUES (?, ?, ?)', [personId, role, content]);
  return { success: true };
});

// ── AI: Auto-score compatibility via Groq ─────────────────────
// Now uses structured questionnaire + scenario answers instead of free text

ipcMain.handle('ai-score-compatibility', async (_, { userProfile, person, questionnaire, scenarios, apiKey }) => {
  const https = require('https');

  const systemPrompt = `You are a compatibility analyst. Given a user's profile and structured data about someone they're interested in, score their compatibility across 6 criteria on a scale of 0-10. Base scores on the STRUCTURED ANSWERS provided, not assumptions. Return ONLY valid JSON, no explanation, no markdown.`;

  const qLines = Object.entries(questionnaire || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || 'No questionnaire answers yet.';

  const sLines = (scenarios || [])
    .slice(0, 8)
    .map(s => `- Q: ${s.question}\n  A: ${s.answer}`)
    .join('\n') || 'No scenario answers yet.';

  const userMsg = `
MY PROFILE (the user):
- Personality: ${userProfile.personality || 'Not specified'}
- Core values: ${userProfile.core_values || 'Not specified'}
- Relationship goals: ${userProfile.goals || 'Not specified'}
- Dealbreakers: ${userProfile.dealbreakers || 'Not specified'}
- Hobbies & interests: ${userProfile.hobbies || 'Not specified'}
- Love language: ${userProfile.love_language || 'Not specified'}

STRUCTURED QUESTIONNAIRE ABOUT ${person.name}:
${qLines}

REAL SCENARIO OBSERVATIONS ABOUT ${person.name}:
${sLines}

EXTRA NOTES: ${person.notes || 'None'}

Score our compatibility on a 0-10 scale per category, weighing the structured questionnaire and scenario answers heavily (these reflect real observed behavior, not assumptions). If data is sparse, lean toward middling scores (4-6) rather than extremes, and note this in your reasoning.

Return exactly this JSON structure:
{
  "Attraction": <0-10>,
  "Chemistry": <0-10>,
  "Values": <0-10>,
  "Communication": <0-10>,
  "Future goals": <0-10>,
  "Fun factor": <0-10>,
  "reasoning": "<2-3 sentence explanation citing specific answers>"
}`;

  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 500,
    temperature: 0.3,
    messages: [{ role: 'user', content: userMsg }],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed  = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content ?? '{}';
          const clean   = content.replace(/```json|```/g, '').trim();
          const scores  = JSON.parse(clean);
          resolve({ success: true, scores });
        } catch(e) {
          resolve({ success: false, error: 'Could not parse AI scores: ' + e.message });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(payload);
    req.end();
  });
});

// ── AI: Generate scenario question based on a new log ─────────

ipcMain.handle('ai-generate-scenario-question', async (_, { person, logText, apiKey }) => {
  const https = require('https');

  const systemPrompt = `You generate ONE short, specific follow-up question to help understand a person better based on a journal entry about an interaction. The question should dig into behavior, communication style, or compatibility signals. Keep it under 20 words. Return ONLY the question text, nothing else — no quotes, no preamble.`;

  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 80,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Person: ${person.name}\nInteraction just logged: "${logText}"\n\nGenerate one probing follow-up question about this interaction.` }
    ],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const question = (parsed.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
          resolve({ success: true, question });
        } catch(e) {
          resolve({ success: false, error: e.message });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(payload);
    req.end();
  });
});

// ── AI: Clarity chat via Groq ─────────────────────────────────

ipcMain.handle('ai-clarity-chat', async (_, { messages, systemPrompt, apiKey }) => {
  const https = require('https');

  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1000,
    temperature: 0.8,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ reply: parsed.choices?.[0]?.message?.content ?? 'No response from AI.' });
        } catch {
          resolve({ reply: 'Error parsing AI response.' });
        }
      });
    });
    req.on('error', e => resolve({ reply: 'Network error: ' + e.message }));
    req.write(payload);
    req.end();
  });
});

// ── Generic AI call ───────────────────────────────────────────
ipcMain.handle('ai-generic-call', async (_, { systemPrompt, userMessage, apiKey }) => {
  const https = require('https');
  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 800,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ success: true, reply: parsed.choices?.[0]?.message?.content ?? '' });
        } catch(e) {
          resolve({ success: false, error: e.message });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(payload);
    req.end();
  });
});

// ── Daily Journal ─────────────────────────────────────────────
ipcMain.handle('get-daily-journal', () => {
  return db.all('SELECT * FROM daily_journal ORDER BY created_at DESC');
});

ipcMain.handle('add-daily-journal', (_, entry) => {
  db.run('INSERT INTO daily_journal (entry) VALUES (?)', [entry]);
  return { success: true };
});

ipcMain.handle('delete-daily-journal', (_, id) => {
  db.run('DELETE FROM daily_journal WHERE id = ?', [id]);
  return { success: true };
});

// ── Person Notes ──────────────────────────────────────────────
ipcMain.handle('get-person-notes', (_, personId) => {
  return db.all('SELECT * FROM person_notes WHERE person_id = ? ORDER BY created_at DESC', [personId]);
});

ipcMain.handle('add-person-note', (_, { personId, note }) => {
  db.run('INSERT INTO person_notes (person_id, note) VALUES (?, ?)', [personId, note]);
  return { success: true };
});

ipcMain.handle('delete-person-note', (_, id) => {
  db.run('DELETE FROM person_notes WHERE id = ?', [id]);
  return { success: true };
});

// ── Daily Checkin ─────────────────────────────────────────────
ipcMain.handle('get-daily-checkin', (_, dateStr) => {
  // dateStr is 'YYYY-MM-DD'
  return db.get('SELECT * FROM daily_checkin WHERE logged_date = ?', [dateStr]) || null;
});

ipcMain.handle('save-daily-checkin', (_, { personId, dateStr }) => {
  db.run('INSERT INTO daily_checkin (person_id, logged_date) VALUES (?, ?)', [personId || null, dateStr]);
  return { success: true };
});

// ── AI: Audio transcription via Groq Whisper ──────────────────
ipcMain.handle('ai-transcribe-audio', async (_, { audioBuffer, apiKey }) => {
  const https = require('https');
  const crypto = require('crypto');

  // Build multipart form data manually
  const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');
  const buf = Buffer.from(audioBuffer);

  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n--${boundary}--\r\n`
  );
  const body = Buffer.concat([preamble, buf, modelPart]);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ success: true, text: parsed.text || '' });
        } catch (e) {
          resolve({ success: false, error: 'Transcription parse error: ' + e.message });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(body);
    req.end();
  });
});
