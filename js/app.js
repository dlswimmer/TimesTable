import { load, save, reset, setOnSave } from './storage.js';
import {
  LEVELS, factsFor, parseKey, pickFact, record, troubleFacts, stat, tipFor, MASTERED_BOX,
} from './facts.js';
import { makeQuestion, answerText, QTYPE_LABELS } from './questions.js';
import { rankFor, pointsFor, BADGES, checkBadges, touchDay } from './rewards.js';
import { sfx, setSound, confetti } from './fx.js';
import {
  syncConfigured, makeCode, formatCode, cleanCode, connect, disconnect, schedulePush, getStatus, onStatus,
} from './sync.js';

const app = document.getElementById('app');
let state = load();
setSound(state.settings.sound);

const ROUND_LENGTH = 10;
const BLITZ_SECONDS = 60;
const ALL_TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const CHEERS = ['Awesome!', 'Nice one!', 'You got it!', 'Brilliant!', 'Super!', 'Boom!', 'Yes!', 'Great job!', 'Smart!', 'Nailed it!'];
const OOPS = ['Almost!', 'So close!', 'Not quite.', 'Good try!'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function persist() {
  save(state);
}

// ---------- cloud sync ----------

// Which screen to redraw when synced data arrives (null while playing).
let screen = null;

const STATUS_TEXT = {
  off: 'Only on this device',
  connecting: 'Connecting…',
  saving: 'Saving…',
  synced: 'Synced ☁️',
  offline: 'Offline, will sync later',
};

function startSync() {
  if (!syncConfigured || !state.familyCode) return;
  connect(state.familyCode, {
    getLocal: () => state,
    applyRemote: (merged) => {
      state = merged;
      save(state, false);
      setSound(state.settings.sound);
      if (screen && screen !== renderSettings && !document.querySelector('.modal')) screen();
    },
  });
}

setOnSave((s) => schedulePush(s));
onStatus((st) => {
  document.querySelectorAll('.syncstatus').forEach((el) => {
    el.textContent = STATUS_TEXT[st] || st;
    el.dataset.status = st;
  });
});

function linkDevice(code) {
  state.familyCode = code;
  state.askedName = true;
  save(state, false);
  startSync();
}

// ---------- level helpers ----------

function currentLevel() {
  const id = state.settings.difficulty;
  if (id === 'custom') {
    const tables = (state.settings.customTables || []).filter((t) => ALL_TABLES.includes(t));
    return {
      id: 'custom',
      label: 'My Tables',
      emoji: '🎯',
      tables: tables.length ? tables : [2],
      maxFactor: 12,
      points: 15,
      qtypes: LEVELS.medium.qtypes,
    };
  }
  return { id, ...(LEVELS[id] || LEVELS.easy) };
}

function levelPool(level) {
  return factsFor(level.tables, level.maxFactor);
}

// ---------- home ----------

function renderHome() {
  stopTimer();
  screen = renderHome;
  const rank = rankFor(state.xp);
  const level = currentLevel();
  const pool = levelPool(level);
  const mastered = pool.filter((k) => stat(state, k).box >= MASTERED_BOX).length;
  const trouble = troubleFacts(state);
  const name = state.name ? esc(state.name) : 'Mathlete';
  const customTables = state.settings.customTables || [];

  app.innerHTML = `
    <header class="hero">
      <div class="avatar" aria-hidden="true">${rank.emoji}</div>
      <div class="hero-text">
        <h1>Hi, ${name}!</h1>
        <div class="rank">${rank.title}</div>
        <div class="xpbar" role="progressbar" aria-valuenow="${Math.round(rank.progress * 100)}" aria-valuemin="0" aria-valuemax="100">
          <span style="width:${Math.round(rank.progress * 100)}%"></span>
        </div>
        <div class="xptext">${state.xp} XP${rank.next ? ` · ${rank.next.xp - state.xp} to ${rank.next.emoji} ${rank.next.title}` : ' · Top rank!'}</div>
      </div>
      ${state.days.streak > 1 ? `<div class="daystreak" title="Days in a row">📅 ${state.days.streak}</div>` : ''}
    </header>

    <section class="card">
      <h2>1. Pick your level</h2>
      <div class="levels">
        ${Object.entries(LEVELS).map(([id, l]) => `
          <button class="level ${level.id === id ? 'on' : ''}" data-level="${id}">
            <span class="big">${l.emoji}</span><b>${l.label}</b><small>${l.blurb}</small>
          </button>`).join('')}
        <button class="level ${level.id === 'custom' ? 'on' : ''}" data-level="custom">
          <span class="big">🎯</span><b>My Tables</b><small>Pick which ones</small>
        </button>
      </div>
      ${level.id === 'custom' ? `
        <div class="tablepick">
          ${ALL_TABLES.map((t) => `<button class="chip ${customTables.includes(t) ? 'on' : ''}" data-table="${t}">×${t}</button>`).join('')}
        </div>` : ''}
      <div class="mastery">
        <div class="meter"><span style="width:${Math.round((mastered / pool.length) * 100)}%"></span></div>
        <small>${mastered} of ${pool.length} facts mastered at this level</small>
      </div>
    </section>

    <section class="card">
      <h2>2. Pick a question style</h2>
      <div class="chips">
        ${Object.entries(QTYPE_LABELS).map(([id, q]) => `
          <button class="chip ${state.settings.qtype === id ? 'on' : ''}" data-qtype="${id}">${q.emoji} ${q.label}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>3. Play!</h2>
      <div class="modes">
        <button class="mode go" data-mode="practice"><span class="big">⭐</span><b>Practice</b><small>${ROUND_LENGTH} questions</small></button>
        <button class="mode blitz" data-mode="blitz"><span class="big">⏱️</span><b>Beat the Clock</b><small>${BLITZ_SECONDS} seconds · best ${state.best.blitz}</small></button>
        <button class="mode fix" data-mode="fix" ${trouble.length ? '' : 'disabled'}>
          <span class="big">🔧</span><b>Fix My Mistakes</b><small>${trouble.length ? `${trouble.length} to fix` : 'Nothing to fix!'}</small>
        </button>
      </div>
    </section>

    <nav class="footer">
      <button class="link" data-go="badges">🏅 Badges (${Object.keys(state.badges).length}/${BADGES.length})</button>
      <button class="link" data-go="progress">📈 Progress</button>
      <button class="link" data-go="map">🗺️ Fact Map</button>
      <button class="link" data-go="settings">⚙️ Settings</button>
    </nav>
  `;

  app.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
    state.settings.difficulty = b.dataset.level;
    if (b.dataset.level === 'custom' && !(state.settings.customTables || []).length) {
      state.settings.customTables = [2, 3];
    }
    persist();
    renderHome();
  }));
  app.querySelectorAll('[data-table]').forEach((b) => b.addEventListener('click', () => {
    const t = Number(b.dataset.table);
    const set = new Set(state.settings.customTables || []);
    if (set.has(t)) { if (set.size > 1) set.delete(t); } else set.add(t);
    state.settings.customTables = [...set].sort((x, y) => x - y);
    persist();
    renderHome();
  }));
  app.querySelectorAll('[data-qtype]').forEach((b) => b.addEventListener('click', () => {
    state.settings.qtype = b.dataset.qtype;
    persist();
    renderHome();
  }));
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startRound(b.dataset.mode)));
  app.querySelector('[data-go="badges"]').addEventListener('click', renderBadges);
  app.querySelector('[data-go="map"]').addEventListener('click', renderMap);
  app.querySelector('[data-go="progress"]').addEventListener('click', renderProgress);
  app.querySelector('[data-go="settings"]').addEventListener('click', renderSettings);

  if (!state.name && !state.askedName && !document.querySelector('.modal')) askName();
}

function askName() {
  const dlg = document.createElement('div');
  dlg.className = 'modal';
  dlg.innerHTML = `
    <form class="modal-box">
      <div class="big">👋</div>
      <h2>Welcome to Times Table Quest!</h2>
      <label for="nm">What's your name?</label>
      <input id="nm" maxlength="20" autocomplete="off" placeholder="Your name">
      <button class="btn go" type="submit">Let's go!</button>
    </form>`;
  document.body.appendChild(dlg);
  const input = dlg.querySelector('input');
  input.focus();
  dlg.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.name = input.value.trim();
    state.askedName = true;
    persist();
    dlg.remove();
    renderHome();
  });
}

// ---------- playing ----------

let round = null;
let timer = null;

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startRound(mode) {
  screen = null;
  const level = currentLevel();
  let pool = levelPool(level);
  let total = ROUND_LENGTH;
  if (mode === 'fix') {
    pool = troubleFacts(state);
    if (!pool.length) return renderHome();
    total = Math.min(ROUND_LENGTH, Math.max(4, pool.length * 2));
  }
  round = {
    mode, level, pool, total,
    qtype: state.settings.qtype,
    index: 0, right: 0, streak: 0, bestStreak: 0, points: 0,
    missed: [], recent: [], answered: false,
    endsAt: mode === 'blitz' ? Date.now() + BLITZ_SECONDS * 1000 : 0,
  };
  if (mode === 'blitz') {
    total = Infinity;
    round.total = Infinity;
    timer = setInterval(updateClock, 200);
  }
  nextQuestion();
}

function updateClock() {
  if (!round) return;
  const left = Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000));
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = `⏱️ ${left}s`;
    el.classList.toggle('hurry', left <= 10);
  }
  if (left <= 0) {
    stopTimer();
    finishRound();
  }
}

function nextQuestion() {
  if (round.index >= round.total) return finishRound();
  const key = pickFact(state, round.pool, round.recent);
  const keep = Math.min(4, Math.floor(round.pool.length / 2));
  round.recent = keep ? [...round.recent, key].slice(-keep) : [];
  const [x, y] = parseKey(key);
  round.key = key;
  round.q = makeQuestion(x, y, round.qtype, round.level.qtypes);
  round.entry = '';
  round.answered = false;
  round.shownAt = Date.now();
  renderQuestion();
}

function promptHtml(q) {
  return q.prompt.map((t) => {
    if (t === '?') return `<span class="blank" id="blank">?</span>`;
    if (t === '×' || t === '=') return `<span class="op">${t}</span>`;
    return `<span class="num">${t}</span>`;
  }).join('');
}

function renderQuestion() {
  const q = round.q;
  const isBlitz = round.mode === 'blitz';
  const progress = isBlitz ? '' : `${round.index + 1} / ${round.total}`;
  const modeLabel = { practice: '⭐ Practice', blitz: '⏱️ Beat the Clock', fix: '🔧 Fix My Mistakes' }[round.mode];

  let answerArea = '';
  if (q.type === 'choice') {
    answerArea = `<div class="choices">${q.choices.map((c, i) => `<button class="choice" data-choice="${c}"><kbd>${i + 1}</kbd>${c}</button>`).join('')}</div>`;
  } else if (q.type === 'truefalse') {
    answerArea = `
      <p class="ask">Is this right?</p>
      <div class="choices two">
        <button class="choice yes" data-choice="yes">👍 Yes</button>
        <button class="choice no" data-choice="no">👎 No</button>
      </div>`;
  } else {
    answerArea = `
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}">${n}</button>`).join('')}
        <button data-key="back" aria-label="Delete">⌫</button>
        <button data-key="0">0</button>
        <button data-key="enter" class="enter" aria-label="Check">✓</button>
      </div>`;
  }

  app.innerHTML = `
    <div class="playbar">
      <button class="link quit" aria-label="Quit">✕</button>
      <span class="modelabel">${modeLabel}</span>
      ${isBlitz ? `<span id="clock" class="clock">⏱️ ${BLITZ_SECONDS}s</span>` : `<span class="progress">${progress}</span>`}
    </div>
    <div class="scorebar">
      <span class="score">⭐ ${round.points}</span>
      <span class="streak ${round.streak >= 3 ? 'hot' : ''}">${round.streak >= 2 ? `🔥 ${round.streak}` : ''}</span>
    </div>
    ${isBlitz ? '' : `<div class="dots">${Array.from({ length: round.total }, (_, i) => `<i class="${i < round.index ? (round.results?.[i] ? 'ok' : 'bad') : i === round.index ? 'cur' : ''}"></i>`).join('')}</div>`}
    <section class="question" id="qcard">
      <div class="eq">${promptHtml(q)}</div>
      ${answerArea}
      <div id="feedback" class="feedback" hidden></div>
    </section>
  `;
  if (isBlitz) updateClock();

  app.querySelector('.quit').addEventListener('click', () => {
    stopTimer();
    round = null;
    renderHome();
  });
  app.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.choice, b)));
  app.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => keypad(b.dataset.key)));
}

function keypad(key) {
  if (!round || round.answered) return;
  if (key === 'back') round.entry = round.entry.slice(0, -1);
  else if (key === 'enter') {
    if (round.entry) submit(round.entry);
    return;
  } else if (round.entry.length < 3) round.entry += key;
  const blank = document.getElementById('blank');
  if (blank) {
    blank.textContent = round.entry || '?';
    blank.classList.toggle('filled', !!round.entry);
  }
}

function submit(value, button) {
  if (!round || round.answered) return;
  round.answered = true;
  const q = round.q;
  const correct = String(value) === String(q.answer);
  const seconds = (Date.now() - round.shownAt) / 1000;
  const fixed = record(state, round.key, correct);
  if (fixed) state.fixed = (state.fixed || 0) + 1;
  round.results = round.results || [];
  round.results[round.index] = correct;

  const card = document.getElementById('qcard');
  const fb = document.getElementById('feedback');
  const blank = document.getElementById('blank');
  app.querySelectorAll('[data-choice]').forEach((b) => {
    b.disabled = true;
    if (b.dataset.choice === String(q.answer)) b.classList.add('right');
  });

  if (correct) {
    round.right++;
    round.streak++;
    round.bestStreak = Math.max(round.bestStreak, round.streak);
    state.best.streak = Math.max(state.best.streak, round.streak);
    const pts = pointsFor(round.level.points, round.streak - 1, seconds);
    round.points += pts;
    if (blank && q.type !== 'truefalse') blank.textContent = q.answer;
    card.classList.add('good');
    fb.hidden = false;
    fb.className = 'feedback good';
    fb.innerHTML = `<b>${fixed ? 'You fixed it! 🔧' : pick(CHEERS)}</b> <span class="plus">+${pts}</span>`;
    if (round.streak > 0 && round.streak % 5 === 0) {
      sfx.streak();
      confetti(60);
      fb.innerHTML += `<div class="streakmsg">🔥 ${round.streak} in a row!</div>`;
    } else {
      sfx.right();
    }
    persist();
    const at = round.index;
    setTimeout(() => advance(at), round.mode === 'blitz' ? 450 : 900);
  } else {
    round.streak = 0;
    if (!round.missed.includes(round.key)) round.missed.push(round.key);
    if (button) button.classList.add('wrong');
    if (blank && q.type !== 'truefalse') {
      blank.textContent = q.answer;
      blank.classList.add('fixed');
    }
    card.classList.add('bad');
    sfx.wrong();
    const [a, b] = parseKey(round.key);
    fb.hidden = false;
    fb.className = 'feedback bad';
    fb.innerHTML = `
      <b>${pick(OOPS)}</b>
      <div class="answer">${answerText(q)}</div>
      <div class="tip">💡 ${tipFor(a, b)}</div>
      <small>We'll practice this one again soon.</small>
      ${round.mode === 'blitz' ? '' : '<button class="btn go" id="gotit">Got it!</button>'}`;
    persist();
    const at = round.index;
    if (round.mode === 'blitz') setTimeout(() => advance(at), 1600);
    else document.getElementById('gotit').focus();
    document.getElementById('gotit')?.addEventListener('click', () => advance());
  }
}

function advance(at) {
  if (!round || !round.answered) return;
  if (at !== undefined && at !== round.index) return;
  round.index++;
  if (round.mode === 'blitz' && Date.now() >= round.endsAt) return finishRound();
  nextQuestion();
}

document.addEventListener('keydown', (e) => {
  if (!round || document.querySelector('.modal')) return;
  if (round.answered) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
    return;
  }
  if (e.key === 'Enter') e.preventDefault();
  const q = round.q;
  if (q.type === 'choice' && /^[1-4]$/.test(e.key)) {
    const btn = app.querySelectorAll('[data-choice]')[Number(e.key) - 1];
    if (btn) submit(btn.dataset.choice, btn);
  } else if (q.type === 'truefalse') {
    if (/^[y1]$/i.test(e.key)) submit('yes', app.querySelector('.yes'));
    if (/^[n2]$/i.test(e.key)) submit('no', app.querySelector('.no'));
  } else if (q.type === 'type' || q.type === 'missing') {
    if (/^[0-9]$/.test(e.key)) keypad(e.key);
    else if (e.key === 'Backspace') keypad('back');
    else if (e.key === 'Enter') keypad('enter');
  }
});

// ---------- results ----------

function starsFor(r) {
  if (r.mode === 'blitz') return r.right >= 30 ? 3 : r.right >= 20 ? 2 : r.right >= 10 ? 1 : 0;
  const pct = r.total ? r.right / r.total : 0;
  return pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.4 ? 1 : 0;
}

function finishRound() {
  stopTimer();
  const r = round;
  if (!r || r.finished) return;
  r.finished = true;
  if (r.mode === 'blitz') {
    r.total = r.index + (r.answered ? 1 : 0);
    if (r.answered) r.index = r.total;
    state.best.blitz = Math.max(state.best.blitz, r.right);
  }
  const before = rankFor(state.xp);
  const stars = starsFor(r);
  const bonus = stars * 10;
  state.xp += r.points + bonus;
  state.rounds++;
  touchDay(state);
  state.history = [...(state.history || []), {
    t: Date.now(),
    mode: r.mode,
    level: r.level.label,
    right: r.right,
    total: r.total,
    stars,
    points: r.points + bonus,
    missed: r.missed,
  }].slice(-100);
  const after = rankFor(state.xp);
  const newBadges = checkBadges(state, { mode: r.mode, right: r.right, total: r.total });
  persist();
  round = null;

  const rankUp = after.index > before.index;
  if (stars >= 2 || rankUp || newBadges.length) {
    sfx.fanfare();
    confetti(stars === 3 || rankUp ? 200 : 100);
  }

  const heading = stars === 3 ? 'Amazing!' : stars === 2 ? 'Great work!' : stars === 1 ? 'Good effort!' : 'Keep practicing!';
  app.innerHTML = `
    <section class="card results">
      <h1>${heading}</h1>
      <div class="stars">${[1, 2, 3].map((n) => `<span class="${n <= stars ? 'lit' : ''}" style="animation-delay:${n * 0.2}s">★</span>`).join('')}</div>
      <div class="stats">
        <div><b>${r.right}${r.mode === 'blitz' ? '' : ` / ${r.total}`}</b><small>correct</small></div>
        <div><b>${r.bestStreak}</b><small>best streak</small></div>
        <div><b>+${r.points + bonus}</b><small>XP${bonus ? ` (incl. ${bonus} star bonus)` : ''}</small></div>
      </div>
      ${r.mode === 'blitz' && r.right >= state.best.blitz && r.right > 0 ? '<p class="newbest">🏁 New personal best!</p>' : ''}
      ${rankUp ? `<div class="rankup"><span class="big">${after.emoji}</span><b>Rank up!</b> You're now a <b>${after.title}</b>!</div>` : ''}
      ${newBadges.length ? `
        <div class="newbadges"><h2>New badge${newBadges.length > 1 ? 's' : ''}!</h2>
          ${newBadges.map((b) => `<div class="badge got"><span class="big">${b.emoji}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}
        </div>` : ''}
      ${r.missed.length ? `
        <div class="missed"><h2>Facts to work on</h2>
          <div class="chips">${r.missed.map((k) => { const [a, b] = parseKey(k); return `<span class="chip">${a} × ${b} = ${a * b}</span>`; }).join('')}</div>
        </div>` : ''}
      <div class="actions">
        <button class="btn go" id="again">Play again</button>
        ${troubleFacts(state).length ? '<button class="btn fix" id="fix">🔧 Fix mistakes</button>' : ''}
        <button class="btn" id="home">Home</button>
      </div>
    </section>`;
  document.getElementById('again').addEventListener('click', () => startRound(r.mode === 'fix' && !troubleFacts(state).length ? 'practice' : r.mode));
  document.getElementById('fix')?.addEventListener('click', () => startRound('fix'));
  document.getElementById('home').addEventListener('click', renderHome);
  document.getElementById('again').focus();
}

// ---------- badges ----------

function renderBadges() {
  screen = renderBadges;
  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">🏅 Badges</span><span></span></div>
    <section class="badges">
      ${BADGES.map((b) => {
        const got = state.badges[b.id];
        return `<div class="badge ${got ? 'got' : ''}"><span class="big">${got ? b.emoji : '🔒'}</span><b>${b.name}</b><small>${b.desc}</small></div>`;
      }).join('')}
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
}

// ---------- fact map ----------

function boxClass(s) {
  if (s.box < 0) return 'new';
  if (s.box >= MASTERED_BOX) return 'master';
  if (s.box === 0) return 'miss';
  return s.box >= 3 ? 'almost' : 'learning';
}

function renderMap() {
  screen = renderMap;
  let grid = '<div class="cell head">×</div>' + ALL_TABLES.map((n) => `<div class="cell head">${n}</div>`).join('');
  for (const a of ALL_TABLES) {
    grid += `<div class="cell head">${a}</div>`;
    for (const b of ALL_TABLES) {
      const s = stat(state, a <= b ? `${a}x${b}` : `${b}x${a}`);
      grid += `<button class="cell ${boxClass(s)}" data-a="${a}" data-b="${b}" aria-label="${a} times ${b}">${a * b}</button>`;
    }
  }
  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">🗺️ Fact Map</span><span></span></div>
    <section class="card">
      <p class="hint">Every fact up to 12 × 12. 3 × 7 and 7 × 3 count as the same fact. Tap one to see how it's going.</p>
      <div class="grid">${grid}</div>
      <div class="legend">
        <span><i class="new"></i>Not tried</span>
        <span><i class="miss"></i>Just missed</span>
        <span><i class="learning"></i>Learning</span>
        <span><i class="almost"></i>Almost</span>
        <span><i class="master"></i>Mastered</span>
      </div>
      <div id="cellinfo" class="cellinfo">&nbsp;</div>
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  const info = document.getElementById('cellinfo');
  app.querySelectorAll('.cell[data-a]').forEach((c) => c.addEventListener('click', () => {
    const a = Number(c.dataset.a), b = Number(c.dataset.b);
    const s = stat(state, a <= b ? `${a}x${b}` : `${b}x${a}`);
    info.textContent = s.box < 0
      ? `${a} × ${b} = ${a * b} · not tried yet`
      : `${a} × ${b} = ${a * b} · right ${s.right} · missed ${s.wrong}${s.box >= MASTERED_BOX ? ' · mastered ✅' : ''}`;
  }));
}

// ---------- settings ----------

function shareLink(code) {
  return `${location.origin}${location.pathname}?family=${formatCode(code)}`;
}

function syncCardHtml() {
  if (!syncConfigured) {
    return `
      <h2>☁️ Cloud sync</h2>
      <p class="hint">Cloud sync isn't set up on this site yet, so progress stays in this browser.</p>`;
  }
  if (!state.familyCode) {
    return `
      <h2>☁️ Cloud sync</h2>
      <p class="hint">Turn this on to see progress from a parent's phone or another device. You'll get a family code to open on the other device.</p>
      <button class="btn go" id="syncon">Turn on sync</button>
      <label class="joinlabel">Already have a family code?
        <span class="joinrow"><input id="joincode" placeholder="ABCD-EFGH-JKMN" autocapitalize="characters" autocomplete="off"><button class="btn" id="join">Link</button></span>
      </label>
      <p class="hint" id="joinerr" hidden>That code doesn't look right. It has 12 letters and numbers.</p>`;
  }
  return `
    <h2>☁️ Cloud sync</h2>
    <p>Status: <b class="syncstatus" data-status="${getStatus()}">${STATUS_TEXT[getStatus()] || ''}</b></p>
    <p class="hint">Family code</p>
    <div class="familycode">${formatCode(state.familyCode)}</div>
    <p class="hint">Open this link on another device to see the same progress:</p>
    <div class="joinrow"><input id="sharelink" readonly value="${esc(shareLink(state.familyCode))}"><button class="btn" id="copy">Copy</button></div>
    <p class="hint">Anyone with the code or link can see and change this progress, so only share it with family.</p>
    <button class="btn" id="unlink">Unlink this device</button>`;
}

function renderSettings() {
  screen = renderSettings;
  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">⚙️ Settings</span><span></span></div>
    <section class="card settings">
      <label>Player name <input id="name" maxlength="20" value="${esc(state.name)}"></label>
      <label class="row"><input type="checkbox" id="sound" ${state.settings.sound ? 'checked' : ''}> Sounds</label>
    </section>
    <section class="card settings">${syncCardHtml()}</section>
    <section class="card settings">
      <button class="btn danger" id="reset">Start over (erase progress)</button>
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  document.getElementById('name').addEventListener('input', (e) => {
    state.name = e.target.value.trim();
    persist();
  });
  document.getElementById('sound').addEventListener('change', (e) => {
    state.settings.sound = e.target.checked;
    setSound(e.target.checked);
    persist();
  });
  document.getElementById('syncon')?.addEventListener('click', () => {
    linkDevice(makeCode());
    renderSettings();
  });
  document.getElementById('join')?.addEventListener('click', () => {
    const code = cleanCode(document.getElementById('joincode').value);
    if (!code) {
      document.getElementById('joinerr').hidden = false;
      return;
    }
    linkDevice(code);
    renderSettings();
  });
  document.getElementById('copy')?.addEventListener('click', async (e) => {
    const input = document.getElementById('sharelink');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    e.target.textContent = 'Copied!';
  });
  document.getElementById('unlink')?.addEventListener('click', () => {
    if (!confirm('Stop syncing this device? Progress stays saved here and in the cloud.')) return;
    disconnect();
    state.familyCode = '';
    save(state, false);
    renderSettings();
  });
  document.getElementById('reset').addEventListener('click', () => {
    const msg = state.familyCode
      ? 'Erase all progress on this device? This device will also be unlinked from cloud sync (the cloud copy is kept).'
      : 'Erase all progress, XP and badges? This cannot be undone.';
    if (confirm(msg)) {
      disconnect();
      state = reset();
      persist();
      renderHome();
    }
  });
}

// ---------- progress (for grown-ups) ----------

const MODE_ICON = { practice: '⭐', blitz: '⏱️', fix: '🔧' };

function renderProgress() {
  screen = renderProgress;
  const history = state.history || [];
  const weekAgo = Date.now() - 7 * 864e5;
  const week = history.filter((h) => h.t >= weekAgo);
  const wRight = week.reduce((n, h) => n + h.right, 0);
  const wTotal = week.reduce((n, h) => n + h.total, 0);
  const all = factsFor(ALL_TABLES, 12);
  const mastered = all.filter((k) => stat(state, k).box >= MASTERED_BOX).length;
  const trouble = troubleFacts(state).slice(0, 12);
  const rank = rankFor(state.xp);

  // Rounds per day, last 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    const start = d.getTime();
    const n = history.filter((h) => h.t >= start && h.t < start + 864e5).length;
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), n };
  });
  const most = Math.max(1, ...days.map((d) => d.n));

  const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">📈 Progress</span><span></span></div>
    <section class="card">
      <h2>${esc(state.name || 'Player')} · ${rank.emoji} ${rank.title}</h2>
      <p class="hint">${syncConfigured && state.familyCode ? `Cloud sync: <span class="syncstatus">${STATUS_TEXT[getStatus()] || ''}</span>` : 'Progress saved on this device only. Turn on cloud sync in Settings to see it elsewhere.'}</p>
      <div class="stats four">
        <div><b>${state.rounds}</b><small>rounds played</small></div>
        <div><b>${wTotal ? Math.round((wRight / wTotal) * 100) + '%' : '–'}</b><small>right this week</small></div>
        <div><b>${mastered}/${all.length}</b><small>facts mastered</small></div>
        <div><b>${state.days.streak || 0}</b><small>days in a row</small></div>
      </div>
    </section>
    <section class="card">
      <h2>Rounds this week</h2>
      <div class="bars">
        ${days.map((d) => `<div class="bar"><span style="height:${(d.n / most) * 100}%"></span><b>${d.n || ''}</b><small>${d.label}</small></div>`).join('')}
      </div>
    </section>
    <section class="card">
      <h2>Needs practice</h2>
      ${trouble.length ? `<div class="chips">${trouble.map((k) => {
        const [a, b] = parseKey(k);
        const s = stat(state, k);
        return `<span class="chip trouble">${a} × ${b} = ${a * b} <small>missed ${s.wrong}×</small></span>`;
      }).join('')}</div>` : '<p class="hint">Nothing right now. 🎉</p>'}
      <button class="link" id="tomap">See the full Fact Map →</button>
    </section>
    <section class="card">
      <h2>Recent rounds</h2>
      ${history.length ? `<ul class="rounds">${history.slice(-20).reverse().map((h) => `
        <li>
          <span class="ricon">${MODE_ICON[h.mode] || '⭐'}</span>
          <span class="rmain"><b>${h.right}${h.mode === 'blitz' ? ' right' : ` / ${h.total}`}</b> · ${esc(h.level)}<small>${when(h.t)}</small></span>
          <span class="rstars">${'★'.repeat(h.stars)}${'☆'.repeat(3 - h.stars)}</span>
        </li>`).join('')}</ul>` : '<p class="hint">No rounds yet.</p>'}
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  document.getElementById('tomap').addEventListener('click', renderMap);
}

// ---------- start up ----------

function joinFromLink() {
  const params = new URLSearchParams(location.search);
  const code = cleanCode(params.get('family'));
  if (!params.has('family')) return;
  history.replaceState(null, '', location.pathname);
  if (!code || !syncConfigured || code === state.familyCode) return;
  const dlg = document.createElement('div');
  dlg.className = 'modal';
  dlg.innerHTML = `
    <div class="modal-box">
      <div class="big">☁️</div>
      <h2>Link this device?</h2>
      <p>This device will share progress with family code <b>${formatCode(code)}</b>.</p>
      <button class="btn go" id="dolink">Link it</button>
      <button class="btn" id="nolink">Not now</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('#dolink').addEventListener('click', () => {
    dlg.remove();
    linkDevice(code);
    renderHome();
  });
  dlg.querySelector('#nolink').addEventListener('click', () => {
    dlg.remove();
    renderHome();
  });
}

joinFromLink();
startSync();
renderHome();
