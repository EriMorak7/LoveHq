
// ── Constants ────────────────────────────────────────────────
const CRITERIA = ['Attraction','Chemistry','Values','Communication','Future goals','Fun factor'];
const COLORS   = ['#e8607a','#c4aee8','#6ec47a','#e8b860','#60a8e8','#e87860'];
const AVATARBG = ['#5a2d4e','#2d3a5a','#2d5a3a','#5a4a2d','#4a2d5a','#2d4a5a'];
const PROFILE_FIELDS = [
  {key:'personality', icon:'ti-mood-happy', label:'Personality & vibe'},
  {key:'core_values', icon:'ti-heart',      label:'Core values'},
  {key:'goals',       icon:'ti-target',     label:'Relationship goals'},
  {key:'dealbreakers',icon:'ti-ban',        label:'Dealbreakers'},
  {key:'hobbies',     icon:'ti-device-gamepad-2', label:'Hobbies & interests'},
  {key:'love_language',icon:'ti-language',  label:'Love language'},
];

// ── State ────────────────────────────────────────────────────
let people = [], logs = [], userProfile = null;
let currentViewId = null, clarityPersonId = null;
let apiKey = localStorage.getItem('llhq_apikey') || '';
let obCurrentStep = 0;
const OB_STEPS = 7;

// Questionnaire modal state
let questPersonId = null;
let questAnswers = {};   // local working copy: { key: value }

// ── Utils ────────────────────────────────────────────────────
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const avatarEl = (name,idx,size=36) =>
  `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${size<40?11:14}px;background:${AVATARBG[idx%AVATARBG.length]};color:#fff">${initials(name)}</div>`;
const avgScore = p => {
  if(!p.scores?.length) return null;
  const v = p.scores.filter(x=>x>0);
  return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10 : null;
};
const vibeColor = v => v>=8?'var(--green)':v>=5?'var(--amber)':'var(--rose)';
const moodEmoji = m => ({butterflies:'🦋',happy:'😊',comfortable:'😌',confused:'😕',anxious:'😟',meh:'😐',drained:'😓'}[m]||'💬');
const timeAgo = ts => {
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
};
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}
const personIndex = id => people.findIndex(p=>p.id===id);
const openExt = url => { try{ require('electron').shell.openExternal(url); }catch{} };

function profileCompleteness(person){
  const answered = person.answer_count || 0;
  return Math.min(100, Math.round((answered / QUESTIONNAIRE.length) * 100));
}

// ── API key ──────────────────────────────────────────────────
function saveApiKey(val){
  apiKey=val.trim(); localStorage.setItem('llhq_apikey',apiKey);
  document.getElementById('api-key-saved').style.display = apiKey?'inline':'none';
}

// ── Onboarding (user profile setup) ─────────────────────────
function buildStepDots(){
  const dots = document.getElementById('step-dots');
  dots.innerHTML = Array.from({length:OB_STEPS},(_,i)=>
    `<div class="step-dot${i===0?' active':''}" id="dot-${i}"></div>`).join('');
}
function obStep(dir){
  const steps = document.querySelectorAll('.onboarding-step');
  if(dir>0 && obCurrentStep===0 && !document.getElementById('ob-name').value.trim()){
    showToast('Please enter your name'); return;
  }
  steps[obCurrentStep].classList.remove('active');
  document.getElementById('dot-'+obCurrentStep).classList.remove('active');
  document.getElementById('dot-'+obCurrentStep).classList.add('done');
  obCurrentStep += dir;
  if(obCurrentStep < 0) obCurrentStep = 0;
  if(obCurrentStep >= OB_STEPS){ saveOnboarding(); return; }
  steps[obCurrentStep].classList.add('active');
  document.getElementById('dot-'+obCurrentStep).classList.add('active');
  document.getElementById('dot-'+obCurrentStep).classList.remove('done');
  document.getElementById('ob-back').style.display = obCurrentStep>0?'inline-flex':'none';
  document.getElementById('ob-next').textContent = obCurrentStep===OB_STEPS-1 ? '✓ Get started' : 'Next →';
}
async function saveOnboarding(){
  const data = {
    name:         document.getElementById('ob-name').value.trim(),
    personality:  document.getElementById('ob-personality').value.trim(),
    core_values:  document.getElementById('ob-core-values').value.trim(),
    goals:        document.getElementById('ob-goals').value.trim(),
    dealbreakers: document.getElementById('ob-dealbreakers').value.trim(),
    hobbies:      document.getElementById('ob-hobbies').value.trim(),
    love_language:document.getElementById('ob-lovelang').value,
  };
  await window.db.saveUserProfile(data);
  userProfile = data;
  document.getElementById('onboarding').style.display='none';
  document.getElementById('main-app').style.display='flex';
  document.getElementById('sidebar-username').textContent = data.name ? `Hi, ${data.name} 👋` : 'Your private clarity space';
  await refresh(); loadDashboard(); loadClarityList();
}

// ── Navigation ───────────────────────────────────────────────
function goPage(id,el,clarityId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
  if(id==='dashboard') loadDashboard();
  if(id==='profiles')  loadProfiles();
  if(id==='log')       { loadLog(); renderScenarioBanner(); }
  if(id==='compare')   { loadCompare(); loadPriorityList(); }
  if(id==='clarity')   { loadClarityList(); if(clarityId) startClarity(clarityId); }
  if(id==='my-profile') loadMyProfile();
  if(id==='journal')    loadDailyJournal();
  if(id==='insights-hub') loadInsightsHubInit();
  if(id==='planner')      loadPlannerInit();
}
function openModal(id){ document.getElementById(id).style.display='block'; }
function closeModal(id){ document.getElementById(id).style.display='none'; }

// ── Phase 1: Add Person (quick) ─────────────────────────────
function openAddPerson(){
  document.getElementById('inp-name').value='';
  document.getElementById('inp-met').value='';
  document.getElementById('inp-status').value='Talking';
  openModal('modal-add-person');
  setTimeout(()=>document.getElementById('inp-name').focus(),100);
}

async function savePerson(){
  const name = document.getElementById('inp-name').value.trim();
  if(!name){ showToast('Please enter a name'); return; }
  const btn = document.getElementById('btn-save-person');
  btn.disabled=true; btn.textContent='Adding…';

  const { id } = await window.db.addPerson({
    name,
    met: document.getElementById('inp-met').value.trim(),
    status: document.getElementById('inp-status').value,
    notes: ''
  });

  closeModal('modal-add-person');
  await refresh();
  loadDashboard(); loadProfiles(); loadClarityList();
  btn.disabled=false; btn.textContent='Add & continue →';

  showToast(`${name} added — let's learn more about them`);
  openQuestionnaire(id);
}

// ── Phase 2: Questionnaire ──────────────────────────────────
async function openQuestionnaire(personId){
  questPersonId = personId;
  const p = people.find(x=>x.id===personId) || await window.db.getPerson(personId);
  document.getElementById('quest-title').textContent = `Tell us about ${p.name}`;

  questAnswers = await window.db.getQuestionnaireAnswers(personId);
  renderQuestionnaire();
  openModal('modal-questionnaire');
}

function renderQuestionnaire(){
  const wrap = document.getElementById('quest-questions');
  wrap.innerHTML = QUESTIONNAIRE.map((q,i) => {
    const current = questAnswers[q.key];
    if(q.type === 'choice'){
      return `<div class="quest-question">
        <div class="quest-label">${q.label}<span class="quest-criterion-tag">${q.criterion}</span></div>
        <div class="quest-choices">
          ${q.options.map(opt => `<div class="quest-choice${current===opt?' selected':''}" onclick="selectChoice('${q.key}','${opt.replace(/'/g,"\\'")}')">${opt}</div>`).join('')}
        </div>
      </div>`;
    }
    if(q.type === 'slider'){
      const val = current ? parseInt(current) : Math.round((q.min+q.max)/2);
      return `<div class="quest-question">
        <div class="quest-label">${q.label}<span class="quest-criterion-tag">${q.criterion}</span></div>
        <div class="quest-slider-wrap">
          <input type="range" min="${q.min}" max="${q.max}" value="${val}" id="qslider-${q.key}"
            style="width:100%;accent-color:var(--rose)"
            oninput="questAnswers['${q.key}']=this.value">
          <div class="quest-slider-labels"><span>${q.labels[0]}</span><span>${q.labels[1]}</span></div>
        </div>
      </div>`;
    }
    if(q.type === 'multi'){
      const selected = current ? current.split('|') : [];
      return `<div class="quest-question">
        <div class="quest-label">${q.label}<span class="quest-criterion-tag">${q.criterion}</span></div>
        <div class="quest-multi">
          ${q.options.map(opt => `<div class="quest-choice${selected.includes(opt)?' selected':''}" onclick="toggleMulti('${q.key}','${opt.replace(/'/g,"\\'")}',this)">${opt}</div>`).join('')}
        </div>
      </div>`;
    }
    return '';
  }).join('');
  updateQuestProgress();
}

function selectChoice(key, val){
  questAnswers[key] = val;
  renderQuestionnaire();
}

function toggleMulti(key, val, el){
  let current = questAnswers[key] ? questAnswers[key].split('|') : [];
  if(current.includes(val)) current = current.filter(x=>x!==val);
  else current.push(val);
  questAnswers[key] = current.join('|');
  el.classList.toggle('selected');
  updateQuestProgress();
}

function updateQuestProgress(){
  const answered = QUESTIONNAIRE.filter(q => questAnswers[q.key]).length;
  const pct = Math.round((answered / QUESTIONNAIRE.length) * 100);
  document.getElementById('quest-progress-fill').style.width = pct+'%';
  document.getElementById('quest-progress-text').textContent = `${answered}/${QUESTIONNAIRE.length} answered`;
}

async function saveQuestionnaireAndScore(){
  const btn = document.getElementById('btn-save-questionnaire');
  btn.disabled=true; btn.innerHTML='<span class="spinner-inline"></span> Saving…';

  await window.db.saveQuestionnaireBatch({ personId: questPersonId, answers: questAnswers });

  closeModal('modal-questionnaire');
  await refresh();
  loadDashboard(); loadProfiles();

  if(apiKey && userProfile){
    showToast('Scoring compatibility with AI…');
    await scorePersonWithAI(questPersonId);
  } else {
    showToast('Saved. Add your Groq key in AI Clarity to enable AI scoring.');
  }

  btn.disabled=false; btn.innerHTML='<i class="ti ti-sparkles"></i> Save & Score';
}

async function scorePersonWithAI(personId){
  const p = await window.db.getPerson(personId);
  const questionnaire = await window.db.getQuestionnaireAnswers(personId);
  const scenarios = await window.db.getScenarioAnswers(personId);

  // Map question keys to readable labels for the AI prompt
  const readableAnswers = {};
  QUESTIONNAIRE.forEach(q => {
    if(questionnaire[q.key]) readableAnswers[q.label] = questionnaire[q.key];
  });

  const result = await window.db.aiScoreCompatibility({
    userProfile, person: p, questionnaire: readableAnswers, scenarios, apiKey
  });

  if(result.success){
    const scores = CRITERIA.map(c => result.scores[c] ?? 5);
    await window.db.saveScores({ personId, scores });
    await refresh();
    loadDashboard(); loadProfiles(); loadCompare();
    showToast(`${p.name} compatibility scored ✓`);
    return result.scores.reasoning;
  } else {
    showToast('AI scoring failed: '+(result.error||'unknown'));
    return null;
  }
}

// ── Phase 3: Scenario follow-ups (after logging interaction) ──
let pendingScenario = null; // {personId, logId, question}

function renderScenarioBanner(){
  const slot = document.getElementById('scenario-banner-slot');
  if(!pendingScenario){ slot.innerHTML=''; return; }
  const p = people.find(x=>x.id===pendingScenario.personId);
  slot.innerHTML = `
    <div class="scenario-banner">
      <i class="ti ti-help-circle"></i>
      <div class="scenario-banner-text">
        <div class="scenario-banner-q">Quick follow-up about ${p?p.name:'them'}: ${pendingScenario.question}</div>
        <textarea id="scenario-answer-inp" placeholder="Type your answer (or skip)..."></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="submitScenarioAnswer()">Submit</button>
          <button class="btn btn-ghost btn-sm" onclick="dismissScenario()">Skip</button>
        </div>
      </div>
    </div>`;
}

async function submitScenarioAnswer(){
  const text = document.getElementById('scenario-answer-inp').value.trim();
  if(!text){ dismissScenario(); return; }
  await window.db.saveScenarioAnswer({
    personId: pendingScenario.personId,
    logId: pendingScenario.logId,
    question: pendingScenario.question,
    answer: text
  });
  showToast('Got it — noted for compatibility scoring');
  const pid = pendingScenario.personId;
  pendingScenario = null;
  renderScenarioBanner();
  // Re-score in background if we have enough new info
  if(apiKey && userProfile) scorePersonWithAI(pid);
}

function dismissScenario(){
  pendingScenario = null;
  renderScenarioBanner();
}

// ── Delete Person ────────────────────────────────────────────
function confirmDeletePerson(){
  const p=people.find(x=>x.id===currentViewId);
  if(!confirm(`Remove ${p?p.name:'this person'} and all their logs?`)) return;
  deletePerson(currentViewId);
}
async function deletePerson(id){
  await window.db.deletePerson(id);
  const p=people.find(x=>x.id===id);
  showToast(p?`${p.name} removed`:'Removed');
  closeModal('modal-profile-view');
  await refresh();
  loadDashboard(); loadProfiles(); loadLog(); loadCompare(); loadClarityList();
}

// ── Log ──────────────────────────────────────────────────────
function openAddLog(){
  if(!people.length){ showToast('Add a person first'); return; }
  document.getElementById('log-person-sel').innerHTML=people.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('log-text').value='';
  document.getElementById('log-vibe').value=7;
  document.getElementById('log-vibe-val').textContent=7;
  openModal('modal-add-log');
}

async function saveLog(){
  const text=document.getElementById('log-text').value.trim();
  if(!text){ showToast('Describe the interaction'); return; }
  const personId = parseInt(document.getElementById('log-person-sel').value);
  const btn=document.getElementById('btn-save-log');
  btn.disabled=true; btn.textContent='Saving…';

  const { id: logId } = await window.db.addLog({
    personId, text,
    mood:document.getElementById('log-mood').value,
    vibe:parseInt(document.getElementById('log-vibe').value)
  });

  closeModal('modal-add-log');
  showToast('Interaction logged');
  await refresh(); loadDashboard(); loadLog();
  btn.disabled=false; btn.textContent='Save log';

  // Generate a scenario follow-up question
  const p = people.find(x=>x.id===personId);
  if(apiKey && p){
    const result = await window.db.aiGenerateScenarioQuestion({ person:p, logText:text, apiKey });
    if(result.success && result.question){
      pendingScenario = { personId, logId, question: result.question };
    } else {
      const fallback = SCENARIO_FALLBACK_QUESTIONS[Math.floor(Math.random()*SCENARIO_FALLBACK_QUESTIONS.length)];
      pendingScenario = { personId, logId, question: fallback };
    }
  } else if(p) {
    const fallback = SCENARIO_FALLBACK_QUESTIONS[Math.floor(Math.random()*SCENARIO_FALLBACK_QUESTIONS.length)];
    pendingScenario = { personId, logId, question: fallback };
  }
  renderScenarioBanner();
}

async function deleteLog(id){
  await window.db.deleteLog(id);
  showToast('Log removed');
  await refresh(); loadDashboard(); loadLog();
}

// ── Data ─────────────────────────────────────────────────────
async function refresh(){
  people = await window.db.getPeople();
  logs   = await window.db.getLogs();
}

// ── Profile View (tabbed) ───────────────────────────────────
async function openProfileView(id){
  currentViewId=id;
  const p=people.find(x=>x.id===id); if(!p) return;
  const idx=personIndex(id);
  const pLogs=logs.filter(x=>(x.personId||x.person_id)===id);
  const avg=avgScore(p);
  const avgVibe=pLogs.length?Math.round(pLogs.reduce((a,b)=>a+b.vibe,0)/pLogs.length*10)/10:null;
  const completeness = profileCompleteness(p);

  const answers = await window.db.getQuestionnaireAnswers(id);
  const scenarios = await window.db.getScenarioAnswers(id);
  const notes = await window.db.getPersonNotes(id);

  // Vibe timeline chart HTML
  const chartBars = pLogs.slice().reverse().slice(-10).map(l => 
    `<div class="vibe-chart-bar" style="height:${l.vibe * 10}%;background:${vibeColor(l.vibe)}" data-val="${l.vibe}" title="Vibe ${l.vibe} (${timeAgo(l.ts||l.logged_at)})"></div>`
  ).join('') || '<div style="font-size:12px;color:var(--text3);padding:20px 0">Log some vibes to see a timeline</div>';

  // Notes list HTML
  const notesList = notes.map(n => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3);margin-bottom:3px">
        <span>${timeAgo(n.created_at)}</span>
        <span onclick="deletePersonNote(${n.id}, ${id})" style="cursor:pointer;color:var(--rose)" title="Delete"><i class="ti ti-trash"></i></span>
      </div>
      <div style="font-size:12px;color:var(--text2)">${n.note}</div>
    </div>
  `).join('') || '<div style="font-size:12px;color:var(--text3);padding:10px 0">No private notes yet</div>';

  document.getElementById('profile-view-content').innerHTML=`
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">
      ${avatarEl(p.name,idx,52)}
      <div style="flex:1">
        <div style="font-size:17px;font-weight:600">${p.name}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${p.status}${p.met?' · Met via '+p.met:''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${avg!==null?`<span style="font-size:12px;padding:3px 10px;border-radius:20px;background:var(--rose-bg2);color:var(--rose2)">Compat: ${avg}/10</span>`:''}
          ${avgVibe!==null?`<span style="font-size:12px;padding:3px 10px;border-radius:20px;background:var(--lav-bg);color:var(--lavender)">Avg vibe: ${avgVibe}</span>`:''}
          <span style="font-size:12px;padding:3px 10px;border-radius:20px;background:var(--border);color:var(--text2)">${pLogs.length} log${pLogs.length!==1?'s':''}</span>
        </div>
        <div class="completeness-wrap">
          <div class="completeness-label"><span>Profile completeness</span><span>${completeness}%</span></div>
          <div class="completeness-bar"><div class="completeness-fill" style="width:${completeness}%"></div></div>
        </div>
      </div>
    </div>

    <div class="tab-row" style="flex-wrap:wrap">
      <div class="tab-btn active" onclick="switchTab(event,'tab-scores')">Scores</div>
      <div class="tab-btn" onclick="switchTab(event,'tab-questionnaire')">Questionnaire</div>
      <div class="tab-btn" onclick="switchTab(event,'tab-scenarios')">Scenario notes</div>
      <div class="tab-btn" onclick="switchTab(event,'tab-notes')">Private Notes</div>
      <div class="tab-btn" onclick="switchTab(event,'tab-insights')">AI Insights</div>
      <div class="tab-btn" onclick="switchTab(event,'tab-psych')">Psychology & Sim</div>
    </div>

    <div class="tab-content active" id="tab-scores">
      ${CRITERIA.map((cr,i)=>`
        <div class="criteria-row">
          <span class="criteria-name">${cr}</span>
          <div class="criteria-bar"><div class="criteria-fill" style="width:${(p.scores[i]||0)*10}%;background:${COLORS[i]}"></div></div>
          <span style="font-size:12px;color:${COLORS[i]};font-weight:500;min-width:20px;text-align:right">${p.scores[i]||0}</span>
        </div>`).join('')}
      ${apiKey?`<button class="btn btn-lav btn-sm" style="margin-top:10px" onclick="reScorePerson(${id})"><i class="ti ti-refresh"></i> Re-score with AI</button>`:''}
      ${pLogs.length?`<div style="margin-top:18px"><div class="section-head">Recent interactions</div>${pLogs.slice(0,3).map(l=>`
        <div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">${moodEmoji(l.mood)} ${timeAgo(l.ts||l.logged_at)} · vibe ${l.vibe}/10</div>
          <div style="font-size:12px;color:var(--text2)">${l.text||l.entry}</div>
        </div>`).join('')}</div>`:''}
    </div>

    <div class="tab-content" id="tab-questionnaire">
      <button class="btn btn-lav btn-sm" style="margin-bottom:14px" onclick="closeModal('modal-profile-view');openQuestionnaire(${id})"><i class="ti ti-edit"></i> Edit answers</button>
      ${QUESTIONNAIRE.filter(q=>answers[q.key]).map(q=>`
        <div style="margin-bottom:12px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:3px">${q.label}</div>
          <div style="font-size:13px;color:var(--text2)">${answers[q.key].replace(/\|/g,', ')}</div>
        </div>`).join('') || '<div class="empty-state" style="padding:20px"><p>No questionnaire answers yet</p></div>'}
    </div>

    <div class="tab-content" id="tab-scenarios">
      ${scenarios.length ? scenarios.map(s=>`
        <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">${timeAgo(s.answered_at)}</div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:4px;font-style:italic">${s.question}</div>
          <div style="font-size:13px;color:var(--text2)">${s.answer}</div>
        </div>`).join('') : '<div class="empty-state" style="padding:20px"><p>No scenario notes yet — these appear after you log interactions</p></div>'}
    </div>

    <div class="tab-content" id="tab-notes">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input class="form-input" id="new-person-note" placeholder="Add a private note..." style="flex:1" onkeydown="if(event.key==='Enter') savePersonNote(${id})" />
        <button class="btn btn-primary btn-sm" onclick="savePersonNote(${id})">Save</button>
      </div>
      <div style="max-height:220px;overflow-y:auto;padding-right:4px">${notesList}</div>
    </div>

    <div class="tab-content" id="tab-insights">
      <div class="section-head" style="margin-bottom:6px">Mood / Vibe Timeline (last 10 logs)</div>
      <div class="vibe-chart-wrap" style="margin-bottom:18px">${chartBars}</div>

      <div class="section-head">AI Clarities & Actions</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <button class="btn btn-ghost btn-sm" onclick="runAIInsight('verdict', ${id})"><i class="ti ti-gavel"></i> The Verdict</button>
        <button class="btn btn-ghost btn-sm" onclick="openShouldText(${id})"><i class="ti ti-message"></i> Should I text?</button>
        <button class="btn btn-ghost btn-sm" onclick="runAIInsight('redflags', ${id})"><i class="ti ti-flag"></i> Red Flags</button>
        <button class="btn btn-ghost btn-sm" onclick="runAIInsight('drift', ${id})"><i class="ti ti-trending-up"></i> Feeling Drift</button>
      </div>
      <div id="insight-result" style="display:none;padding:12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:1.5;color:var(--text2)"></div>
    </div>

    <div class="tab-content" id="tab-psych">
      <div class="section-head" style="margin-bottom:6px">Attachment Style Detector</div>
      <button class="btn btn-ghost btn-sm" onclick="runPsych('attachment', ${id})"><i class="ti ti-magnet"></i> Analyze Attachment</button>
      
      <div class="section-head" style="margin-top:16px;margin-bottom:6px">Reaction Sandbox</div>
      <textarea class="form-input" id="psych-sim-input" placeholder="If I told them I need more space..." style="min-height:60px;margin-bottom:8px"></textarea>
      <button class="btn btn-ghost btn-sm" onclick="runPsych('simulate', ${id})"><i class="ti ti-test-pipe"></i> Simulate Reaction</button>
      
      <div id="psych-result" style="display:none;margin-top:14px;padding:12px;background:var(--card2);border:1px solid var(--border);border-radius:8px;font-size:12px;line-height:1.5;color:var(--text2)"></div>
    </div>
  `;
  openModal('modal-profile-view');
}

function switchTab(evt, tabId){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  evt.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

async function reScorePerson(id){
  if(!apiKey||!userProfile){ showToast('Set your Groq API key first'); return; }
  showToast('Re-scoring with AI…');
  await scorePersonWithAI(id);
  openProfileView(id);
}

// ── Private Notes per person ─────────────────────────────────
async function savePersonNote(personId) {
  const inp = document.getElementById('new-person-note');
  const note = inp.value.trim();
  if (!note) return;
  await window.db.addPersonNote({ personId, note });
  inp.value = '';
  showToast('Note added ✓');
  await refresh();
  openProfileView(personId);
}

async function deletePersonNote(id, personId) {
  if (!confirm('Delete this note?')) return;
  await window.db.deletePersonNote(id);
  showToast('Note deleted');
  await refresh();
  openProfileView(personId);
}

// ── Daily Journal ─────────────────────────────────────────────
async function loadDailyJournal() {
  const list = document.getElementById('journal-list');
  const entries = await window.db.getDailyJournal();
  list.innerHTML = entries.map(e => `
    <div class="journal-entry">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div class="journal-entry-date">${new Date(e.created_at).toLocaleString()}</div>
        <span onclick="deleteDailyJournal(${e.id})" style="cursor:pointer;color:var(--text3)" title="Delete"><i class="ti ti-trash"></i></span>
      </div>
      <div class="journal-entry-text">${e.entry.replace(/\n/g, '<br>')}</div>
    </div>
  `).join('') || '<div class="empty-state"><i class="ti ti-book-off"></i><p>No journal entries yet. Tap "New entry" to write how you are feeling generally today.</p></div>';
}

function openAddJournal() {
  document.getElementById('journal-text').value = '';
  openModal('modal-add-journal');
}

async function saveJournal() {
  const text = document.getElementById('journal-text').value.trim();
  if (!text) return;
  await window.db.addDailyJournal(text);
  closeModal('modal-add-journal');
  showToast('Journal entry saved ✓');
  loadDailyJournal();
}

async function deleteDailyJournal(id) {
  if (!confirm('Delete this entry?')) return;
  await window.db.deleteDailyJournal(id);
  showToast('Entry removed');
  loadDailyJournal();
}

// ── Privacy & Data Export ─────────────────────────────────────
async function exportData() {
  try {
    const jsonStr = await window.db.exportData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `love_hq_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!');
  } catch (e) {
    showToast('Export failed: ' + e.message);
  }
}

function checkPin(val) {
  if (val.length === 4) {
    if (val === (userProfile.pin || '')) {
      document.getElementById('lock-screen').style.display = 'none';
      document.getElementById('main-app').style.display = 'flex';
      document.getElementById('pin-input').value = '';
      document.getElementById('pin-error').style.display = 'none';
      checkDailyCheckin();
    } else {
      document.getElementById('pin-error').style.display = 'block';
      document.getElementById('pin-input').value = '';
    }
  }
}

// ── Daily Check-in ─────────────────────────────────────────────
async function checkDailyCheckin() {
  if (!people.length) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const existing = await window.db.getDailyCheckin(todayStr);
  if (!existing) {
    const sel = document.getElementById('checkin-sel');
    sel.innerHTML = '<option value="">Choose person...</option>' + 
      people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    document.getElementById('checkin-popup').style.display = 'flex';
  }
}

async function saveCheckin() {
  const val = document.getElementById('checkin-sel').value;
  if (!val) {
    closeCheckin();
    return;
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  await window.db.saveDailyCheckin({ personId: parseInt(val), dateStr: todayStr });
  closeCheckin();
  showToast('Logged check-in ✓');
}

function closeCheckin() {
  document.getElementById('checkin-popup').style.display = 'none';
}

// ── Last contact & Streak calculation ─────────────────────────
function getLastContactInfo(personId) {
  const pLogs = logs.filter(l => (l.personId || l.person_id) === personId);
  if (!pLogs.length) return { text: 'No logs yet', days: 999 };
  const lastLog = pLogs[0];
  const days = Math.floor((Date.now() - (lastLog.ts || lastLog.logged_at)) / (24 * 3600 * 1000));
  return {
    text: days === 0 ? 'Logged today' : days === 1 ? '1 day ago' : `${days} days ago`,
    days
  };
}

function calculateStreak(personId) {
  const pLogs = logs.filter(l => (l.personId || l.person_id) === personId)
                    .map(l => l.ts || l.logged_at)
                    .sort((a,b) => b - a); // Newest first
  if (!pLogs.length) return 0;
  
  let streak = 0;
  let currentRef = Date.now();
  
  for (let i = 0; i < pLogs.length; i++) {
    const diff = (currentRef - pLogs[i]) / (24 * 3600 * 1000);
    if (diff <= 3) {
      streak++;
      currentRef = pLogs[i];
    } else {
      break;
    }
  }
  return streak;
}

// ── Drag & Drop Priority List ────────────────────────────────
function loadPriorityList() {
  const listEl = document.getElementById('priority-list');
  const sorted = people.slice().sort((a,b) => (a.priority_rank || 0) - (b.priority_rank || 0));
  listEl.innerHTML = sorted.map((p, idx) => `
    <div class="drag-item" draggable="true" data-id="${p.id}" ondragstart="dragStart(event)" ondragover="dragOver(event)" ondrop="dragDrop(event)">
      <span class="drag-handle">☰</span>
      <span style="font-weight:500;width:30px;color:var(--text3)">#${idx+1}</span>
      <span style="flex:1">${p.name}</span>
      <span style="font-size:11px;color:var(--text3)">${p.status}</span>
    </div>
  `).join('') || '<div class="empty-state" style="padding:10px"><p>No one added yet</p></div>';
}

let dragSrcEl = null;
function dragStart(e) {
  dragSrcEl = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
  e.currentTarget.classList.add('dragging');
}
function dragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}
async function dragDrop(e) {
  e.stopPropagation();
  if (dragSrcEl !== e.currentTarget) {
    const list = document.getElementById('priority-list');
    const children = Array.from(list.children);
    const srcIdx = children.indexOf(dragSrcEl);
    const destIdx = children.indexOf(e.currentTarget);
    
    if (srcIdx < destIdx) {
      e.currentTarget.after(dragSrcEl);
    } else {
      e.currentTarget.before(dragSrcEl);
    }
    await savePriorityRanking();
  }
  dragSrcEl.classList.remove('dragging');
  return false;
}

async function savePriorityRanking() {
  const list = document.getElementById('priority-list');
  const items = Array.from(list.children);
  const rankMap = {};
  items.forEach((item, idx) => {
    const id = item.getAttribute('data-id');
    if (id) rankMap[id] = idx + 1;
  });
  await window.db.reRankPriority(rankMap);
  await refresh();
  loadPriorityList();
}

async function checkPriorityAlignment() {
  if (!apiKey) {
    showToast('Enter Groq API Key first');
    return;
  }
  const btn = document.getElementById('btn-align');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-inline"></span> Aligning...';

  const sorted = people.slice().sort((a,b) => (a.priority_rank || 0) - (b.priority_rank || 0));
  const rankingSummary = sorted.map((p, idx) => {
    const avg = avgScore(p) || 'N/A';
    return `#${idx+1} Name: ${p.name} (Compat score: ${avg}, Status: ${p.status})`;
  }).join('\n');

  const systemPrompt = `You are a relationship alignment expert. Analyze the user's manual priority ranking against the compatibility score database. Highlight if the manual ranking conflicts with the actual data (e.g. someone manual rank #1 has a low score, or a high compat person is ranked low). Give clear, direct comments in 3-4 sentences.`;
  
  const userMessage = `User's Manual Ranking:\n${rankingSummary}\n\nComment on this alignment.`;
  
  const res = await window.db.aiGenericCall({ systemPrompt, userMessage, apiKey });
  if (res.success) {
    const box = document.getElementById('priority-alignment-result');
    box.innerHTML = `<div class="rank-align-box"><div style="font-weight:600;margin-bottom:6px;color:var(--lavender)">🧠 AI Alignment Report</div>${res.reply}</div>`;
  } else {
    showToast('AI call failed: ' + res.error);
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-brain"></i> Check Alignment';
}

// ── Should I Text ────────────────────────────────────────────
let shouldTextPersonId = null;
function openShouldText(personId) {
  shouldTextPersonId = personId;
  document.getElementById('should-text-inp').value = '';
  document.getElementById('should-text-result').style.display = 'none';
  openModal('modal-should-text');
}

async function submitShouldText() {
  const situation = document.getElementById('should-text-inp').value.trim();
  if (!situation || !apiKey) {
    showToast('Situation and API Key required');
    return;
  }
  const act = document.getElementById('should-text-actions');
  const btn = act.querySelector('.btn-primary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> Thinking...';

  const p = people.find(x => x.id === shouldTextPersonId);
  const pLogs = logs.filter(l => (l.personId || l.person_id) === shouldTextPersonId);
  const logSummary = pLogs.slice(0, 5).map(l => `[${timeAgo(l.ts||l.logged_at)}] Mood: ${l.mood}, Vibe: ${l.vibe}, Entry: "${l.text || l.entry}"`).join('; ');

  const systemPrompt = `You are a direct, wise dating advisor. Given the user's history with ${p.name} and a new situation, deliver a direct yes/no verdict first, then explain why in 2 clear sentences.`;
  
  const userMessage = `My history with ${p.name}:\n${logSummary}\n\nSituation:\n"${situation}"\n\nShould I text them?`;
  
  const res = await window.db.aiGenericCall({ systemPrompt, userMessage, apiKey });
  const box = document.getElementById('should-text-result');
  if (res.success) {
    box.innerHTML = `<div style="font-weight:600;font-size:14px;color:var(--rose2);margin-bottom:6px">🧠 AI Verdict</div>${res.reply}`;
    box.style.display = 'block';
  } else {
    showToast('AI call failed: ' + res.error);
  }
  btn.disabled = false;
  btn.innerHTML = 'Ask AI';
}

// ── AI Insights (Verdict, Red Flags, Feeling Drift) ─────────
async function runAIInsight(type, personId) {
  if (!apiKey) {
    showToast('Enter Groq API Key first');
    return;
  }
  const p = people.find(x => x.id === personId);
  const pLogs = logs.filter(l => (l.personId || l.person_id) === personId);
  const answers = await window.db.getQuestionnaireAnswers(personId);
  const scenarios = await window.db.getScenarioAnswers(personId);

  const resBox = document.getElementById('insight-result');
  resBox.style.display = 'block';
  resBox.innerHTML = '<span class="spinner-inline"></span> Computing insight...';

  const qStr = QUESTIONNAIRE.filter(q=>answers[q.key]).map(q=>`${q.label}: ${answers[q.key]}`).join('; ');
  const sStr = scenarios.map(s=>`Q:${s.question} A:${s.answer}`).join('; ');
  const logStr = pLogs.map(l => `[${timeAgo(l.ts||l.logged_at)}] Vibe: ${l.vibe}, Entry: "${l.text||l.entry}"`).join('; ');

  let systemPrompt = '';
  let userMessage = '';

  if (type === 'verdict') {
    // Condition check
    const trackDays = Math.floor((Date.now() - p.created_at) / (24 * 3600 * 1000));
    if (pLogs.length < 5 && trackDays < 30) {
      resBox.innerHTML = `<i class="ti ti-lock"></i> <strong>Verdict Locked</strong><br>Requires 5+ logs or 30 days of tracking to unlock the Verdict (currently: ${pLogs.length} logs, tracked for ${trackDays} days)`;
      return;
    }

    systemPrompt = `You are a direct, brutally honest dating analyst. Look at the data and deliver a final verdict: Pursue, Keep watching, or Move on. Give 2-3 specific reasons based on the data.`;
    userMessage = `Person: ${p.name}\nStatus: ${p.status}\nLogs:\n${logStr}\n\nQuestionnaire:\n${qStr}\n\nVerdict?`;
  } 
  else if (type === 'redflags') {
    systemPrompt = `You are an analytical relationship coach. Review the user's dealbreakers against the logs and questionnaire answers of the person they are tracking. Surface any warning signs or dealbreaker alignment.`;
    userMessage = `User Dealbreakers: "${userProfile.dealbreakers}"\nTracked Person: ${p.name}\nLogs:\n${logStr}\nQuestionnaire:\n${qStr}\nScenario notes:\n${sStr}`;
  } 
  else if (type === 'drift') {
    systemPrompt = `You are a relationship analyst. Analyze the vibe and emotional tone of logs from the first 1-2 weeks of tracking compared to the most recent logs. Determine if the user's feelings have genuinely changed, and if so, how.`;
    userMessage = `Tracked Person: ${p.name}\nLogs chronologically:\n${pLogs.slice().reverse().map(l => `[Vibe ${l.vibe}] ${l.text||l.entry}`).join('\n')}`;
  }

  const res = await window.db.aiGenericCall({ systemPrompt, userMessage, apiKey });
  if (res.success) {
    resBox.innerHTML = `<strong>${type.toUpperCase()} ANALYSIS:</strong><br>${res.reply}`;
  } else {
    resBox.innerHTML = 'AI analysis failed: ' + res.error;
  }
}

// ── Dashboard ────────────────────────────────────────────────
async function loadDashboard(){
  const stats=await window.db.getStats();
  document.getElementById('stat-count').textContent=stats.people_count;
  document.getElementById('stat-logs').textContent=stats.log_count;
  document.getElementById('stat-ai').textContent=stats.ai_count;
  document.getElementById('stat-top').textContent=stats.top_person||'—';

  const pl=document.getElementById('dash-people-list');
  pl.innerHTML=!people.length
    ?'<div class="empty-state" style="padding:20px"><i class="ti ti-user-off"></i><p>No one added yet</p></div>'
    :people.slice(0,6).map((p,i)=>{
      const avg=avgScore(p);
      const contact = getLastContactInfo(p.id);
      const streak = calculateStreak(p.id);
      const contactNudge = contact.days >= 7 ? ` <span style="color:var(--rose)">⚠️ ${contact.text}</span>` : ` <span style="color:var(--text3)">(${contact.text})</span>`;
      const streakBadge = streak > 0 ? ` <span style="color:var(--amber)" title="Streak: ${streak} logs">🔥 ${streak}</span>` : '';
      return `<div class="person-row" onclick="openProfileView(${p.id})">
        ${avatarEl(p.name,i,32)}
        <div style="flex:1">
          <div class="person-name">${p.name}${streakBadge}</div>
          <div class="person-meta">${p.status} · ${contactNudge}</div>
        </div>
        ${avg!==null?`<div style="text-align:right">
          <div class="vibe-bar"><div class="vibe-fill" style="width:${avg*10}%;background:${vibeColor(avg)}"></div></div>
          <div style="font-size:11px;color:${vibeColor(avg)};font-weight:500;margin-top:3px">${avg}</div>
        </div>`:''}
      </div>`;}).join('');

  const ll=document.getElementById('dash-log-list');
  ll.innerHTML=!logs.length
    ?'<div class="empty-state" style="padding:20px"><i class="ti ti-notes-off"></i><p>No interactions yet</p></div>'
    :logs.slice(0,5).map(l=>{
      const p=people.find(x=>x.id===(l.personId||l.person_id));
      const idx=p?personIndex(p.id):0;
      return `<div class="log-item">
        <div class="log-dot" style="background:${COLORS[idx%COLORS.length]}"></div>
        <div class="log-content">
          <div class="log-top"><span class="log-person">${p?p.name:'?'}</span><span class="log-time">${timeAgo(l.ts||l.logged_at)}</span></div>
          <div class="log-text">${(l.text||l.entry||'').slice(0,80)}${(l.text||l.entry||'').length>80?'…':''}</div>
          <span class="mood-tag">${moodEmoji(l.mood)} ${l.mood}</span>
        </div>
      </div>`;}).join('');
}

// ── Profiles ─────────────────────────────────────────────────
function loadProfiles(){
  const g=document.getElementById('profiles-grid');
  g.innerHTML=!people.length
    ?`<div class="empty-state"><i class="ti ti-user-heart"></i><p>Add your first person to get started</p><button class="btn btn-primary btn-sm" onclick="openAddPerson()">Add someone</button></div>`
    :people.map((p,i)=>{
      const avg=avgScore(p);
      const completeness = profileCompleteness(p);
      const contact = getLastContactInfo(p.id);
      const streak = calculateStreak(p.id);
      const contactNudge = contact.days >= 7 ? ` <span style="color:var(--rose)">⚠️ It's been ${contact.text}!</span>` : ` <span style="color:var(--text3)">Last: ${contact.text}</span>`;
      const streakBadge = streak > 0 ? ` <span style="color:var(--amber)" title="Interaction streak: ${streak} logs">🔥 ${streak}</span>` : '';
      return `<div class="profile-card" onclick="openProfileView(${p.id})">
        <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start">
          ${avatarEl(p.name,i,48)}
          ${streakBadge}
        </div>
        <h3 style="font-size:14px;margin-bottom:3px">${p.name}</h3>
        <div style="font-size:12px;color:var(--text3);margin-bottom:4px">${p.status}${p.met?' · '+p.met:''}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">${contactNudge}</div>
        <div class="completeness-wrap" style="margin-bottom:8px">
          <div class="completeness-label"><span>Profile</span><span>${completeness}%</span></div>
          <div class="completeness-bar"><div class="completeness-fill" style="width:${completeness}%"></div></div>
        </div>
        ${avg!==null
          ?`<div class="score-row"><span class="score-label">Compat score</span><span class="score-val" style="color:${vibeColor(avg)}">${avg}</span></div>`
          :`<div class="score-row"><span style="font-size:11px;color:var(--text3)">Not scored yet</span></div>`}
      </div>`;}).join('');
}

// ── Log ──────────────────────────────────────────────────────
function loadLog(){
  const ll=document.getElementById('log-list');
  ll.innerHTML=!logs.length
    ?'<div class="empty-state"><i class="ti ti-notes"></i><p>Nothing logged yet</p></div>'
    :logs.map(l=>{
      const p=people.find(x=>x.id===(l.personId||l.person_id));
      const idx=p?personIndex(p.id):0;
      return `<div class="log-item">
        <div class="log-dot" style="background:${COLORS[idx%COLORS.length]};margin-top:6px"></div>
        <div class="log-content">
          <div class="log-top">
            <span class="log-person">${p?p.name:'Unknown'}</span>
            <span class="log-time">${timeAgo(l.ts||l.logged_at)}</span>
            <span style="font-size:11px;color:${vibeColor(l.vibe)};margin-left:auto">vibe ${l.vibe}/10</span>
            <span onclick="deleteLog(${l.id})" style="cursor:pointer;color:var(--text3);margin-left:6px" title="Delete"><i class="ti ti-x" style="font-size:12px"></i></span>
          </div>
          <div class="log-text">${l.text||l.entry}</div>
          <span class="mood-tag">${moodEmoji(l.mood)} ${l.mood}</span>
        </div>
      </div>`;}).join('');
}

// ── Compare ──────────────────────────────────────────────────
function createRadarChart(person, colorIdx) {
  const size = 180;
  const center = size / 2;
  const radius = size * 0.35;
  const numCriteria = CRITERIA.length;
  const angleStep = (Math.PI * 2) / numCriteria;

  let bgPolygons = '';
  for (let level = 1; level <= 5; level++) {
    const r = radius * (level / 5);
    const points = Array.from({length: numCriteria}).map((_, i) => {
      const angle = i * angleStep - Math.PI / 2;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(' ');
    bgPolygons += `<polygon points="${points}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
  }

  const dataPoints = CRITERIA.map((_, i) => {
    const score = person.scores[i] || 0;
    const r = radius * (score / 10);
    const angle = i * angleStep - Math.PI / 2;
    return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
  }).join(' ');

  const fillColor = colorIdx === 0 ? 'var(--rose-bg)' : colorIdx === 1 ? 'var(--lav-bg)' : 'var(--border2)';
  const strokeColor = colorIdx === 0 ? 'var(--rose)' : colorIdx === 1 ? 'var(--lavender)' : 'var(--text3)';

  const labels = CRITERIA.map((cr, i) => {
    const r = radius * 1.25;
    const angle = i * angleStep - Math.PI / 2;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `<text x="${x}" y="${y}" fill="var(--text2)" font-size="9" text-anchor="middle" dominant-baseline="middle">${cr.substring(0,7)}</text>`;
  }).join('');

  return `
    <div style="display:flex;flex-direction:column;align-items:center;background:var(--card2);padding:10px;border-radius:12px;border:1px solid var(--border);">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:${strokeColor}">${person.name}</div>
      <svg width="${size}" height="${size}">
        ${bgPolygons}
        <polygon points="${dataPoints}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>
        ${labels}
      </svg>
    </div>
  `;
}

function loadCompare(){
  const c=document.getElementById('compare-content');
  const scored=people.filter(p=>p.scores?.some(s=>s>0));
  if(!scored.length){
    c.innerHTML='<div class="empty-state"><i class="ti ti-chart-bar-off"></i><p>Add people with AI scores to compare</p></div>';
    return;
  }
  const sorted=scored.slice().sort((a,b)=>(avgScore(b)||0)-(avgScore(a)||0));
  
  let radarHTML = '<div style="display:flex;gap:20px;margin-bottom:30px;flex-wrap:wrap;justify-content:center;">';
  sorted.slice(0, 3).forEach((p, idx) => {
    radarHTML += createRadarChart(p, idx);
  });
  radarHTML += '</div>';

  c.innerHTML=`${radarHTML}<table class="compare-table">
    <thead><tr><th>#</th><th>Name</th><th>Status</th>${CRITERIA.map(cr=>`<th>${cr}</th>`).join('')}<th>Overall</th></tr></thead>
    <tbody>${sorted.map((p,i)=>{
      const avg=avgScore(p); const idx=personIndex(p.id);
      return `<tr onclick="openProfileView(${p.id})" style="cursor:pointer">
        <td><span class="rank-badge" style="background:${i===0?'var(--rose-bg2)':i===1?'var(--lav-bg)':'var(--border)'};color:${i===0?'var(--rose)':i===1?'var(--lavender)':'var(--text2)'}">${i+1}</span></td>
        <td><div style="display:flex;align-items:center;gap:8px">${avatarEl(p.name,idx,24)}<span>${p.name}</span></div></td>
        <td><span style="font-size:11px;color:var(--text3)">${p.status}</span></td>
        ${CRITERIA.map((_,ci)=>{const v=p.scores[ci]||0;return `<td><div style="display:flex;align-items:center;gap:4px"><div class="mini-bar"><div class="mini-fill" style="width:${v*10}%;background:${COLORS[ci]}"></div></div><span style="font-size:12px;color:${COLORS[ci]}">${v}</span></div></td>`;}).join('')}
        <td><span style="font-size:15px;font-weight:600;color:${vibeColor(avg||0)}">${avg!==null?avg:'—'}</span></td>
      </tr>`;}).join('')}</tbody></table>`;
}

// ── My Profile ───────────────────────────────────────────────
function loadMyProfile(){
  const c=document.getElementById('my-profile-content');
  if(!userProfile){
    c.innerHTML='<div class="empty-state"><i class="ti ti-user-off"></i><p>No profile set up yet</p></div>';
    return;
  }
  c.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px">
      ${avatarEl(userProfile.name||'Me',0,52)}
      <div>
        <div style="font-size:18px;font-weight:600">${userProfile.name||'You'}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:3px">Your profile · used for AI compatibility scoring</div>
      </div>
    </div>
    ${PROFILE_FIELDS.map(f=>`
      <div class="profile-field">
        <div class="profile-field-label"><i class="ti ${f.icon}"></i> ${f.label}</div>
        <div class="profile-field-val">${userProfile[f.key]||'<span style="color:var(--text3);font-style:italic">Not set</span>'}</div>
      </div>`).join('')}`;
}

function openEditProfile(){
  if(!userProfile) return;
  document.getElementById('ep-name').value         = userProfile.name||'';
  document.getElementById('ep-personality').value  = userProfile.personality||'';
  document.getElementById('ep-core-values').value  = userProfile.core_values||'';
  document.getElementById('ep-goals').value        = userProfile.goals||'';
  document.getElementById('ep-dealbreakers').value = userProfile.dealbreakers||'';
  document.getElementById('ep-hobbies').value      = userProfile.hobbies||'';
  document.getElementById('ep-lovelang').value     = userProfile.love_language||'';
  document.getElementById('ep-pin').value         = userProfile.pin||'';
  document.getElementById('ep-stealth').checked    = !!userProfile.stealth_mode;
  openModal('modal-edit-profile');
}

async function saveEditProfile(){
  const pinVal = document.getElementById('ep-pin').value.trim();
  if (pinVal && !/^\d{4}$/.test(pinVal)) {
    showToast('PIN must be 4 digits');
    return;
  }

  const data={
    name:         document.getElementById('ep-name').value.trim(),
    personality:  document.getElementById('ep-personality').value.trim(),
    core_values:  document.getElementById('ep-core-values').value.trim(),
    goals:        document.getElementById('ep-goals').value.trim(),
    dealbreakers: document.getElementById('ep-dealbreakers').value.trim(),
    hobbies:      document.getElementById('ep-hobbies').value.trim(),
    love_language:document.getElementById('ep-lovelang').value,
  };
  await window.db.saveUserProfile(data);
  await window.db.savePin(pinVal);
  
  const stealthVal = document.getElementById('ep-stealth').checked;
  await window.db.toggleStealth(stealthVal);

  userProfile = await window.db.getUserProfile();
  document.getElementById('sidebar-username').textContent = userProfile.name?`Hi, ${userProfile.name} 👋`:'Your private clarity space';
  closeModal('modal-edit-profile');
  showToast('Profile updated ✓');
  loadMyProfile();
}

// ── Themes ────────────────────────────────────────────────────
function changeTheme(themeName) {
  document.body.className = themeName === 'midnight' ? '' : 'theme-' + themeName;
}

// ── Voice Recording ───────────────────────────────────────────
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

async function toggleRecordLog() {
  const btn = document.getElementById('btn-record-log');
  const statusEl = document.getElementById('record-status');
  const textArea = document.getElementById('log-text');
  if (!apiKey) { showToast('Enter your Groq API key in AI Clarity first'); return; }

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        statusEl.textContent = 'Transcribing...';
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const res = await window.db.aiTranscribeAudio({ audioBuffer: arrayBuffer, apiKey });
        if (res.success) {
          textArea.value = (textArea.value + ' ' + res.text).trim();
          statusEl.style.display = 'none';
        } else {
          statusEl.textContent = 'Transcription failed: ' + res.error;
          setTimeout(() => statusEl.style.display = 'none', 3000);
        }
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      btn.innerHTML = '<i class="ti ti-square"></i> Stop';
      btn.classList.replace('btn-ghost', 'btn-primary');
      statusEl.style.display = 'block';
      statusEl.textContent = 'Recording... Click Stop to finish.';
    } catch (e) {
      showToast('Microphone access denied or error: ' + e.message);
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btn.innerHTML = '<i class="ti ti-microphone"></i> Record';
    btn.classList.replace('btn-primary', 'btn-ghost');
  }
}

// ── AI Insights Hub ───────────────────────────────────────────
function loadInsightsHubInit() {
  const sel = document.getElementById('hub-person-sel');
  sel.innerHTML = '<option value="">Select a person</option>' + people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('hub-content').style.display = 'none';
}

function loadInsightsHub() {
  const personId = parseInt(document.getElementById('hub-person-sel').value);
  if (!personId) { document.getElementById('hub-content').style.display = 'none'; return; }
  document.getElementById('hub-content').style.display = 'block';
  
  // Render timeline chart
  const pLogs = logs.filter(x => (x.personId || x.person_id) === personId);
  const chartEl = document.getElementById('hub-vibe-chart');
  chartEl.innerHTML = pLogs.slice().reverse().slice(-15).map(l => 
    `<div class="vibe-chart-bar" style="height:${l.vibe * 10}%;background:${vibeColor(l.vibe)};flex:1" title="Vibe ${l.vibe}"></div>`
  ).join('') || '<div style="font-size:12px;color:var(--text3)">No logs yet.</div>';
}

function switchHubTab(evt, tabId) {
  document.getElementById('hub-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('hub-content').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  evt.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

async function hubShouldText() {
  const personId = parseInt(document.getElementById('hub-person-sel').value);
  const situation = document.getElementById('hub-text-situation').value.trim();
  const resEl = document.getElementById('hub-text-result');
  if (!personId || !situation) return;
  if (!apiKey) { showToast('Need Groq API key (AI Clarity page)'); return; }
  
  const p = people.find(x => x.id === personId);
  resEl.style.display = 'block';
  resEl.textContent = 'Thinking...';
  
  const sysPrompt = `You are a texting strategist. The user is wondering if they should text ${p.name}. Give a clear YES or NO, followed by concise reasoning and an example text if appropriate.`;
  const res = await window.db.aiGenericCall({ systemPrompt: sysPrompt, userMessage: situation, apiKey });
  resEl.innerHTML = res.success ? res.reply.replace(/\n/g, '<br>') : 'Error: ' + res.error;
}

async function hubRunInsight(type) {
  const personId = parseInt(document.getElementById('hub-person-sel').value);
  if (!personId) return;
  const resEl = document.getElementById(`hub-${type}-result`);
  if (!apiKey) { showToast('Need Groq API key (AI Clarity page)'); return; }
  
  const p = people.find(x => x.id === personId);
  const pLogs = logs.filter(x => (x.personId || x.person_id) === personId);
  const logStr = pLogs.map(l => l.text || l.entry).join('\n');
  const answers = await window.db.getQuestionnaireAnswers(personId);
  const qStr = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
  
  resEl.style.display = 'block';
  resEl.textContent = 'Generating...';
  
  let sysPrompt = '';
  if (type === 'verdict') sysPrompt = `Give a brutally honest overall verdict on the relationship with ${p.name} based on their behavior, questionnaire answers, and logs. Focus on long-term viability.`;
  if (type === 'redflags') sysPrompt = `Scan the logs and questionnaire answers for ${p.name} and explicitly list any potential RED FLAGS or concerns. If none, say so, but look closely for subtle signs.`;
  if (type === 'drift') sysPrompt = `Analyze the timeline of logs for ${p.name}. Has the user's feeling or the vibe drifted (improved or worsened) over time? Point out the trend.`;
  
  const userMsg = `Questionnaire:\n${qStr}\n\nLogs:\n${logStr}`;
  const res = await window.db.aiGenericCall({ systemPrompt: sysPrompt, userMessage: userMsg, apiKey });
  resEl.innerHTML = res.success ? res.reply.replace(/\n/g, '<br>') : 'Error: ' + res.error;
}

// ── Date Planner ──────────────────────────────────────────────
function loadPlannerInit() {
  const sel = document.getElementById('planner-person-sel');
  sel.innerHTML = '<option value="">General (No person selected)</option>' + people.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

async function generateDatePlan() {
  const personId = document.getElementById('planner-person-sel').value;
  const budget = document.getElementById('planner-budget').value;
  const vibe = document.getElementById('planner-vibe').value;
  const resEl = document.getElementById('planner-result');
  
  if (!apiKey) { showToast('Need Groq API key'); return; }
  
  let pName = 'this person';
  let pContext = '';
  if (personId) {
    const p = people.find(x => x.id == personId);
    if (p) {
      pName = p.name;
      const answers = await window.db.getQuestionnaireAnswers(p.id);
      pContext = '\\nThey are interested in: ' + (answers['q4']||'unknown') + '. Perfect date: ' + (answers['q9']||'unknown') + '.';
    }
  }
  
  resEl.style.display = 'block';
  resEl.textContent = 'Brainstorming date ideas...';
  
  const sysPrompt = `You are an expert date planner. Suggest 3 highly specific, creative, and actionable date ideas for ${pName}. Budget: ${budget}. Vibe: ${vibe}.${pContext} Format with clear headings and bullet points.`;
  const res = await window.db.aiGenericCall({ systemPrompt: sysPrompt, userMessage: "Give me the date ideas.", apiKey });
  resEl.innerHTML = res.success ? res.reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>') : 'Error: ' + res.error;
}

// ── Psychology & Sim ──────────────────────────────────────────
async function runPsych(type, personId) {
  const resEl = document.getElementById('psych-result');
  if (!apiKey) { showToast('Need Groq API key'); return; }
  
  const p = people.find(x => x.id === personId);
  const pLogs = logs.filter(x => (x.personId || x.person_id) === personId);
  const logStr = pLogs.map(l => l.text || l.entry).join('\n');
  const answers = await window.db.getQuestionnaireAnswers(personId);
  const qStr = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
  
  resEl.style.display = 'block';
  resEl.textContent = 'Simulating...';
  
  let sysPrompt = '';
  let userMsg = `Questionnaire:\n${qStr}\n\nLogs:\n${logStr}`;
  
  if (type === 'attachment') {
    sysPrompt = `Analyze the behavior, questionnaire, and logs of ${p.name}. Estimate their likely attachment style (Secure, Anxious, Avoidant, or Disorganized) and provide a brief rationale based on evidence.`;
  } else if (type === 'simulate') {
    const scenario = document.getElementById('psych-sim-input').value.trim();
    if (!scenario) { resEl.textContent = 'Enter a scenario first.'; return; }
    sysPrompt = `You are a psychological simulator. Based on the profile of ${p.name}, predict how they would react to the following scenario. Be realistic, considering their attachment style and past behavior.`;
    userMsg += `\n\nSCENARIO: ${scenario}`;
  }
  
  const res = await window.db.aiGenericCall({ systemPrompt: sysPrompt, userMessage: userMsg, apiKey });
  resEl.innerHTML = res.success ? res.reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>') : 'Error: ' + res.error;
}

// ── AI Clarity ───────────────────────────────────────────────
function loadClarityList(){
  const cl=document.getElementById('clarity-people-list');
  cl.innerHTML='<div style="font-size:11px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em">Select person</div>';
  if(!people.length){ cl.innerHTML+='<div style="font-size:12px;color:var(--text3);padding:8px 0">Add someone first</div>'; return; }
  cl.innerHTML+=people.map((p,i)=>`
    <div class="clarity-person-item" id="cp-${p.id}" onclick="startClarity(${p.id})">
      ${avatarEl(p.name,i,28)}<span class="name">${p.name}</span>
    </div>`).join('');
  const inp=document.getElementById('api-key-input');
  if(inp&&apiKey){ inp.value=apiKey; document.getElementById('api-key-saved').style.display='inline'; }
}

async function startClarity(id){
  clarityPersonId=id;
  document.querySelectorAll('.clarity-person-item').forEach(el=>el.classList.remove('active'));
  const el=document.getElementById('cp-'+id); if(el) el.classList.add('active');

  const cc=document.getElementById('clarity-chat');
  cc.innerHTML=`
    <div class="chat-messages" id="chat-msgs"></div>
    <div class="chat-input-row">
      <textarea id="chat-inp" placeholder="Tell me how you really feel…"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat()}"></textarea>
      <button class="btn btn-primary btn-sm" onclick="sendChat()"><i class="ti ti-send"></i></button>
    </div>`;

  const hist=await window.db.getClarityHistory(id);
  const p=people.find(x=>x.id===id);
  if(!hist.length&&p) hist.push({role:'assistant',content:`Hey! Let's talk about **${p.name}**. Tell me what's on your mind — how do you feel around her? What made you start tracking her?`});
  renderMessages(hist);
}

function renderMessages(hist){
  const msgs=document.getElementById('chat-msgs'); if(!msgs) return;
  msgs.innerHTML=hist.map(m=>`
    <div class="msg msg-${m.role==='user'?'user':'ai'}">
      ${m.role==='assistant'?'<div class="ai-label">🧠 Clarity AI</div>':''}
      ${m.content.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}
    </div>`).join('');
  msgs.scrollTop=msgs.scrollHeight;
}

async function sendChat(){
  const inp=document.getElementById('chat-inp');
  const text=inp.value.trim();
  if(!text||!clarityPersonId) return;
  if(!apiKey){ showToast('Enter your Groq API key above first'); return; }
  inp.value='';

  const p=people.find(x=>x.id===clarityPersonId);
  const pLogs=logs.filter(x=>(x.personId||x.person_id)===clarityPersonId);
  const answers = await window.db.getQuestionnaireAnswers(clarityPersonId);
  const scenarios = await window.db.getScenarioAnswers(clarityPersonId);

  await window.db.saveClarityMessage({personId:clarityPersonId,role:'user',content:text});
  const msgs=document.getElementById('chat-msgs');
  msgs.innerHTML+=`<div class="msg msg-user">${text}</div>`;
  const typing=document.createElement('div');
  typing.className='msg msg-ai typing';
  typing.innerHTML='<div class="ai-label">🧠 Clarity AI</div>thinking…';
  msgs.appendChild(typing); msgs.scrollTop=msgs.scrollHeight;

  const hist=await window.db.getClarityHistory(clarityPersonId);
  const logSummary=pLogs.length?'Recent interactions: '+pLogs.slice(0,5).map(l=>`"${(l.text||l.entry||'').slice(0,60)}" (mood:${l.mood}, vibe:${l.vibe}/10)`).join('; '):'No interactions logged yet.';
  const compStr=p.scores?CRITERIA.map((c,i)=>`${c}:${p.scores[i]}/10`).join(', '):'Not scored.';
  const qStr = QUESTIONNAIRE.filter(q=>answers[q.key]).map(q=>`${q.label}: ${answers[q.key]}`).join('; ') || 'No questionnaire data yet.';
  const sStr = scenarios.slice(0,5).map(s=>`Q:${s.question} A:${s.answer}`).join('; ') || 'No scenario notes yet.';

  const myStr=userProfile?`
MY PROFILE (the user):
- Name: ${userProfile.name}
- Personality: ${userProfile.personality||'N/A'}
- Values: ${userProfile.core_values||'N/A'}
- Goals: ${userProfile.goals||'N/A'}
- Dealbreakers: ${userProfile.dealbreakers||'N/A'}
- Love language: ${userProfile.love_language||'N/A'}`:'';

  const systemPrompt=`You are a warm, perceptive, and honest relationship clarity assistant. The user is trying to figure out their genuine feelings for someone. You help them see through confusion, infatuation, or social pressure.
${myStr}

ABOUT ${p.name}:
- Status: ${p.status} · Met via: ${p.met||'unknown'}
- Compatibility scores — ${compStr}
- Structured questionnaire: ${qStr}
- Scenario observations: ${sStr}
- ${logSummary}
- Their notes: ${p.notes||'None'}

Ask insightful probing questions, notice contradictions, challenge confusion gently. Be concise (2-4 sentences). Occasionally offer a "Clarity Check" — a direct honest observation. Be like a wise, direct friend. Use what you know about the user's own values and goals, and the structured data about ${p.name}, to give sharper advice.`;

  const result=await window.db.aiClarityChat({messages:hist,systemPrompt,apiKey});
  typing.remove();
  await window.db.saveClarityMessage({personId:clarityPersonId,role:'assistant',content:result.reply});
  msgs.innerHTML+=`<div class="msg msg-ai"><div class="ai-label">🧠 Clarity AI</div>${result.reply.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')}</div>`;
  msgs.scrollTop=msgs.scrollHeight;
  const stats=await window.db.getStats();
  document.getElementById('stat-ai').textContent=stats.ai_count;
}

// ── Boot ─────────────────────────────────────────────────────
(async()=>{
  buildStepDots();
  userProfile = await window.db.getUserProfile();

  if(!userProfile){
    document.getElementById('onboarding').style.display='flex';
  } else {
    // Check stealth mode at boot
    if (userProfile.stealth_mode) {
      await window.db.toggleStealth(true);
    }

    await refresh();
    loadClarityList();

    // Check PIN at boot
    if (userProfile.pin) {
      document.getElementById('lock-screen').style.display = 'flex';
      document.getElementById('pin-input').focus();
    } else {
      document.getElementById('main-app').style.display='flex';
      document.getElementById('sidebar-username').textContent =
        userProfile.name ? `Hi, ${userProfile.name} 👋` : 'Your private clarity space';
      loadDashboard();
      checkDailyCheckin();
    }
  }
})();
