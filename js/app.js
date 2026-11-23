import { load, save, reset, setOnSave } from './storage.js';
import {
  LEVELS, factsFor, parseKey, pickFact, record, troubleFacts, stat, tipFor, MASTERED_BOX,
  divisionUnlocked, divisionMode, canDivide, masteredTableCount, DIVISION_TABLES_NEEDED,
} from './facts.js';
import { makeQuestion, answerText, spokenText, QTYPE_LABELS } from './questions.js';
import { rankFor, pointsFor, BADGES, checkBadges, touchDay } from './rewards.js';
import { sfx, setSound, confetti } from './fx.js';
import {
  syncConfigured, makeCode, formatCode, cleanCode, connect, disconnect, schedulePush, getStatus, getLastError, onStatus,
  pushReport, deleteReport, REPORT_CODE_LENGTH,
} from './sync.js';
import { buildSnapshot, summaryText } from './report-data.js';
import {
  today, dateStreak, gems, addGems, DAILY_LENGTH, dailyDoneToday, dailyPool, openChest, markDailyDone,
  roundsToday, checkGoal, AVATARS, THEMES, owns, buy, avatarEmoji, applyTheme,
  BOSSES, BOSS_HP, BOSS_HEARTS, bossBeaten, markBossBeaten, weeklySummary, canSpeak, speak, dotGridHtml,
} from './extras.js';

const app = document.getElementById('app');
let state = load();
setSound(state.settings.sound);
applyTheme(state);

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
      applyTheme(state);
      if (screen && screen !== renderSettings && !document.querySelector('.modal')) screen();
    },
  });
}

setOnSave((s) => {
  schedulePush(s);
  if (s.reportCode) pushReport(s.reportCode, buildSnapshot(s));
});
const ERROR_HELP = {
  'permission-denied': 'The cloud database refused access. Check that the Firestore rules from firestore.rules are published.',
  'not-found': 'The cloud database was not found. Check that a Firestore database named (default) exists.',
  'failed-precondition': 'The cloud database is not set up yet. Create the Firestore database in the Firebase console.',
  unavailable: 'Can\'t reach the internet right now. It will sync when the connection is back.',
};

function errorText() {
  const code = getLastError();
  if (!code) return '';
  return `${ERROR_HELP[code] || 'Something went wrong talking to the cloud.'} (${code})`;
}

onStatus((st) => {
  document.querySelectorAll('.syncstatus').forEach((el) => {
    el.textContent = STATUS_TEXT[st] || st;
    el.dataset.status = st;
  });
  document.querySelectorAll('.syncerror').forEach((el) => {
    el.textContent = st === 'offline' ? errorText() : '';
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

/** The chosen question style, falling back to the mix if division is locked. */
function currentQtype() {
  const q = state.settings.qtype;
  return q === 'divide' && !divisionUnlocked(state) ? 'mixed' : q;
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
  const goal = state.settings.goal || {};
  const dailyDone = dailyDoneToday(state);
  const dailyStreak = dateStreak(state.dailyDone);
  const doneToday = roundsToday(state);
  const bossesBeaten = (state.bosses || []).length;

  app.innerHTML = `
    <header class="hero">
      <div class="avatar" aria-hidden="true">${avatarEmoji(state, rank.emoji)}</div>
      <div class="hero-text">
        <h1>Hi, ${name}!</h1>
        <div class="rank">${rank.title}</div>
        <div class="xpbar" role="progressbar" aria-valuenow="${Math.round(rank.progress * 100)}" aria-valuemin="0" aria-valuemax="100">
          <span style="width:${Math.round(rank.progress * 100)}%"></span>
        </div>
        <div class="xptext">${state.xp} XP${rank.next ? ` · ${rank.next.xp - state.xp} to ${rank.next.emoji} ${rank.next.title}` : ' · Top rank!'}</div>
      </div>
      <div class="pills">
        <button class="pill" data-go="shop" title="Gems: spend them in the shop">💎 ${gems(state)}</button>
        ${state.days.streak > 1 ? `<span class="pill" title="Days in a row">📅 ${state.days.streak}</span>` : ''}
      </div>
    </header>

    <section class="card today">
      <button class="daily ${dailyDone ? 'done' : ''}" data-mode="daily" ${dailyDone ? 'disabled' : ''}>
        <span class="big">${dailyDone ? '✅' : '🎁'}</span>
        <span class="dtext"><b>${dailyDone ? 'Daily challenge done!' : 'Daily challenge'}</b>
          <small>${dailyDone ? 'Come back tomorrow for a new chest.' : `${DAILY_LENGTH} questions, win a treasure chest`}${dailyStreak > 1 ? ` · 🔥 ${dailyStreak} days` : ''}</small></span>
      </button>
      ${goal.rounds ? `
        <div class="goal">
          <div class="goalrow"><b>🎯 Today's goal</b><span>${Math.min(doneToday, goal.rounds)} / ${goal.rounds} rounds${doneToday >= goal.rounds ? ' ✅' : ''}</span></div>
          <div class="meter"><span style="width:${Math.min(100, (doneToday / goal.rounds) * 100)}%"></span></div>
        </div>` : ''}
      ${(goal.tables || []).length ? `
        <button class="btn focus" data-mode="focus">⭐ Practice my focus tables: ${goal.tables.map((t) => `×${t}`).join(' ')}</button>` : ''}
    </section>

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
        ${Object.entries(QTYPE_LABELS).filter(([id]) => id !== 'divide' || divisionMode(state) !== 'off').map(([id, q]) => {
          const locked = id === 'divide' && !divisionUnlocked(state);
          return `<button class="chip ${currentQtype() === id ? 'on' : ''} ${locked ? 'locked' : ''}" data-qtype="${id}">${locked ? '🔒' : q.emoji} ${q.label}</button>`;
        }).join('')}
      </div>
      ${divisionMode(state) === 'auto' && !divisionUnlocked(state) ? `
        <p class="hint lockhint" id="lockhint">🔒 Division unlocks when you master ${DIVISION_TABLES_NEEDED} tables (${masteredTableCount(state)} of ${DIVISION_TABLES_NEEDED} so far).</p>` : ''}
    </section>

    <section class="card">
      <h2>3. Play!</h2>
      <div class="modes">
        <button class="mode go" data-mode="practice"><span class="big">⭐</span><b>Practice</b><small>${ROUND_LENGTH} questions</small></button>
        <button class="mode blitz" data-mode="blitz"><span class="big">⏱️</span><b>Beat the Clock</b><small>${BLITZ_SECONDS} seconds · best ${state.best.blitz}</small></button>
        <button class="mode fix" data-mode="fix" ${trouble.length ? '' : 'disabled'}>
          <span class="big">🔧</span><b>Fix My Mistakes</b><small>${trouble.length ? `${trouble.length} to fix` : 'Nothing to fix!'}</small>
        </button>
        <button class="mode boss" data-go="bosses"><span class="big">👾</span><b>Boss Battles</b><small>${bossesBeaten} of 12 beaten</small></button>
      </div>
    </section>

    <nav class="footer">
      <button class="link" data-go="shop">🛍️ Shop</button>
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
    if (b.classList.contains('locked')) {
      const hint = document.getElementById('lockhint');
      hint?.classList.remove('shake');
      void hint?.offsetWidth;
      hint?.classList.add('shake');
      return;
    }
    state.settings.qtype = b.dataset.qtype;
    persist();
    renderHome();
  }));
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startRound(b.dataset.mode)));
  app.querySelector('[data-go="badges"]').addEventListener('click', renderBadges);
  app.querySelector('[data-go="map"]').addEventListener('click', renderMap);
  app.querySelector('[data-go="progress"]').addEventListener('click', renderProgress);
  app.querySelector('[data-go="settings"]').addEventListener('click', renderSettings);
  app.querySelectorAll('[data-go="shop"]').forEach((b) => b.addEventListener('click', renderShop));
  app.querySelector('[data-go="bosses"]').addEventListener('click', renderBosses);

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

const BOSS_QTYPES = { choice: 1, type: 4, missing: 2, truefalse: 1 };

function startRound(mode, opts = {}) {
  screen = null;
  let level = currentLevel();
  let pool = levelPool(level);
  let total = ROUND_LENGTH;
  let qtype = currentQtype();
  if (mode === 'fix') {
    pool = troubleFacts(state);
    if (!pool.length) return renderHome();
    total = Math.min(ROUND_LENGTH, Math.max(4, pool.length * 2));
  } else if (mode === 'daily') {
    pool = dailyPool(state, pool);
    total = DAILY_LENGTH;
    qtype = 'mixed';
  } else if (mode === 'focus') {
    const tables = state.settings.goal?.tables || [];
    if (!tables.length) return renderHome();
    pool = factsFor(tables, 12);
    level = { ...level, label: 'Focus tables' };
  } else if (mode === 'boss') {
    pool = factsFor([opts.table], 12);
    total = Infinity;
    qtype = 'mixed';
    level = { ...level, label: `Boss ×${opts.table}`, qtypes: BOSS_QTYPES, points: 20 };
  }
  if (qtype === 'divide' && mode !== 'boss') {
    // Only divide facts he has mastered; if this level has none yet, use any mastered fact.
    const ok = pool.filter((k) => canDivide(state, k));
    const any = Object.keys(state.facts).filter((k) => canDivide(state, k));
    pool = ok.length ? ok : any.length ? any : pool;
    if (!ok.length && !any.length) qtype = 'mixed';
  }
  round = {
    mode, level, pool, total, qtype,
    table: opts.table, hp: BOSS_HP, hearts: BOSS_HEARTS,
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
  const weights = canDivide(state, key) ? round.level.qtypes : { ...round.level.qtypes, divide: 0 };
  const qtype = round.qtype === 'divide' && !canDivide(state, key) ? 'type' : round.qtype;
  round.q = makeQuestion(x, y, qtype, weights);
  round.entry = '';
  round.answered = false;
  round.shownAt = Date.now();
  renderQuestion();
  if (state.settings.voice) speak(spokenText(round.q));
}

function promptHtml(q) {
  return q.prompt.map((t) => {
    if (t === '?') return `<span class="blank" id="blank">?</span>`;
    if (t === '×' || t === '=' || t === '÷') return `<span class="op">${t}</span>`;
    return `<span class="num">${t}</span>`;
  }).join('');
}

function renderQuestion() {
  const q = round.q;
  const isBlitz = round.mode === 'blitz';
  const progress = isBlitz ? '' : `${round.index + 1} / ${round.total}`;
  const modeLabel = {
    practice: '⭐ Practice', blitz: '⏱️ Beat the Clock', fix: '🔧 Fix My Mistakes',
    daily: '🎁 Daily Challenge', focus: '🎯 Focus Tables', boss: `👾 ${BOSSES[round.table]?.name || 'Boss'}`,
  }[round.mode];
  const isBoss = round.mode === 'boss';

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
      ${isBlitz ? `<span id="clock" class="clock">⏱️ ${BLITZ_SECONDS}s</span>` : isBoss ? `<span class="hearts">${'❤️'.repeat(round.hearts)}${'🖤'.repeat(BOSS_HEARTS - round.hearts)}</span>` : `<span class="progress">${progress}</span>`}
    </div>
    ${isBoss ? `
      <div class="bossbar">
        <span class="bossface" id="bossface">${BOSSES[round.table].emoji}</span>
        <div class="hp"><span style="width:${(round.hp / BOSS_HP) * 100}%"></span></div>
        <small>${round.hp} / ${BOSS_HP}</small>
      </div>` : ''}
    <div class="scorebar">
      <span class="score">⭐ ${round.points}</span>
      <span class="streak ${round.streak >= 3 ? 'hot' : ''}">${round.streak >= 2 ? `🔥 ${round.streak}` : ''}</span>
    </div>
    ${isBlitz || isBoss ? '' : `<div class="dots">${Array.from({ length: round.total }, (_, i) => `<i class="${i < round.index ? (round.results?.[i] ? 'ok' : 'bad') : i === round.index ? 'cur' : ''}"></i>`).join('')}</div>`}
    <section class="question" id="qcard">
      ${state.settings.voice && canSpeak() ? '<button class="link sayit" aria-label="Read it again">🔊</button>' : ''}
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
  app.querySelector('.sayit')?.addEventListener('click', () => speak(spokenText(q)));
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
  const { fixed, slow, mastered } = record(state, round.key, correct, seconds, state.settings.speed ?? 6);
  if (fixed) state.fixed = (state.fixed || 0) + 1;
  if (round.mode === 'boss') {
    if (correct) round.hp = Math.max(0, round.hp - (seconds < 3 ? 2 : 1));
    else round.hearts--;
    updateBoss(correct, seconds < 3);
  }
  round.results = round.results || [];
  round.results[round.index] = correct;
  round.times = [...(round.times || []), Math.min(seconds, 60)];

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
    fb.innerHTML = `<b>${fixed ? 'You fixed it! 🔧' : pick(CHEERS)}</b> <span class="plus">+${pts}</span>
      ${mastered ? '<div class="masteredmsg">🌟 Mastered!</div>' : ''}
      ${slow ? '<div class="slowmsg">Right! Answer a little faster to master it ⚡</div>' : ''}
      ${round.mode === 'boss' && seconds < 3 ? '<div class="crit">💥 Critical hit!</div>' : ''}`;
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
      ${q.type === 'divide' ? '' : dotGridHtml(Math.min(a, b), Math.max(a, b))}
      <div class="tip">💡 ${tipFor(a, b)}</div>
      <small>We'll practice this one again soon.</small>
      ${round.mode === 'blitz' ? '' : '<button class="btn go" id="gotit">Got it!</button>'}`;
    persist();
    const at = round.index;
    if (round.mode === 'blitz') setTimeout(() => advance(at), 2200);
    else document.getElementById('gotit').focus();
    document.getElementById('gotit')?.addEventListener('click', () => advance());
  }
}

function updateBoss(hit, crit) {
  const face = document.getElementById('bossface');
  const bar = document.querySelector('.hp span');
  const hearts = document.querySelector('.hearts');
  if (bar) bar.style.width = `${(round.hp / BOSS_HP) * 100}%`;
  if (bar) bar.parentElement.nextElementSibling.textContent = `${round.hp} / ${BOSS_HP}`;
  if (hearts) hearts.textContent = '❤️'.repeat(Math.max(0, round.hearts)) + '🖤'.repeat(BOSS_HEARTS - Math.max(0, round.hearts));
  if (face) {
    face.classList.remove('hit', 'crit', 'laugh');
    void face.offsetWidth;
    face.classList.add(hit ? (crit ? 'crit' : 'hit') : 'laugh');
  }
}

function advance(at) {
  if (!round || !round.answered) return;
  if (at !== undefined && at !== round.index) return;
  // finishRound counts the just-answered question itself, so end before moving on.
  if (round.mode === 'blitz' && Date.now() >= round.endsAt) return finishRound();
  if (round.mode === 'boss' && (round.hp <= 0 || round.hearts <= 0)) return finishRound();
  round.index++;
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
  } else if (q.type === 'type' || q.type === 'missing' || q.type === 'divide') {
    if (/^[0-9]$/.test(e.key)) keypad(e.key);
    else if (e.key === 'Backspace') keypad('back');
    else if (e.key === 'Enter') keypad('enter');
  }
});

// ---------- results ----------

function starsFor(r) {
  if (r.mode === 'boss') return r.hp <= 0 ? Math.max(1, r.hearts) : 0;
  if (r.mode === 'blitz') return r.right >= 30 ? 3 : r.right >= 20 ? 2 : r.right >= 10 ? 1 : 0;
  const pct = r.total ? r.right / r.total : 0;
  return pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.4 ? 1 : 0;
}

function finishRound() {
  stopTimer();
  const r = round;
  if (!r || r.finished) return;
  r.finished = true;
  if (r.mode === 'blitz' || r.mode === 'boss') {
    r.total = r.index + (r.answered ? 1 : 0);
    if (r.answered) r.index = r.total;
  }
  if (r.mode === 'blitz') state.best.blitz = Math.max(state.best.blitz, r.right);
  const bossWon = r.mode === 'boss' && r.hp <= 0;
  const bossFirstWin = bossWon && !bossBeaten(state, r.table);
  if (bossWon) markBossBeaten(state, r.table);
  let chest = null;
  if (r.mode === 'daily') {
    markDailyDone(state);
    chest = openChest(state);
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
    secs: r.times?.length ? Math.round((r.times.reduce((x, y) => x + y, 0) / r.times.length) * 10) / 10 : 0,
  }].slice(-100);
  const gemsWon = Math.max(1, Math.round((r.points + bonus) / 10)) + (bossFirstWin ? 60 : 0);
  addGems(state, gemsWon);
  const goalGems = checkGoal(state);
  const after = rankFor(state.xp);
  const divisionJustUnlocked = divisionMode(state) === 'auto' && divisionUnlocked(state) && !state.divisionUnlocked;
  if (divisionJustUnlocked) state.divisionUnlocked = new Date().toISOString();
  const newBadges = checkBadges(state, { mode: r.mode, right: r.right, total: r.total });
  persist();
  round = null;

  const rankUp = after.index > before.index;
  if (stars >= 2 || rankUp || newBadges.length || divisionJustUnlocked) {
    sfx.fanfare();
    confetti(stars === 3 || rankUp ? 200 : 100);
  }

  let heading = stars === 3 ? 'Amazing!' : stars === 2 ? 'Great work!' : stars === 1 ? 'Good effort!' : 'Keep practicing!';
  if (r.mode === 'boss') heading = bossWon ? `You beat ${BOSSES[r.table].name}!` : `${BOSSES[r.table].name} wins this time!`;
  app.innerHTML = `
    <section class="card results">
      <h1>${heading}</h1>
      <div class="stars">${[1, 2, 3].map((n) => `<span class="${n <= stars ? 'lit' : ''}" style="animation-delay:${n * 0.2}s">★</span>`).join('')}</div>
      <div class="stats">
        <div><b>${r.right}${r.mode === 'blitz' ? '' : ` / ${r.total}`}</b><small>correct</small></div>
        <div><b>${r.bestStreak}</b><small>best streak</small></div>
        <div><b>+${r.points + bonus}</b><small>XP${bonus ? ` (incl. ${bonus} star bonus)` : ''}</small></div>
      </div>
      <p class="gemswon">💎 +${gemsWon} gems${bossFirstWin ? ' (incl. 60 for a new boss!)' : ''}</p>
      ${r.mode === 'boss' ? `<div class="bossresult"><span class="big ${bossWon ? 'defeated' : ''}">${BOSSES[r.table].emoji}</span>${bossWon ? 'Defeated! 🏆' : 'Practice the ×' + r.table + ' table and try again.'}</div>` : ''}
      ${chest ? `<button class="chest" id="chest"><span class="big">🧰</span><b>Tap to open your chest!</b></button>
        <div class="chestprize" id="chestprize" hidden><span class="big">💎</span><b>+${chest.gemsWon} gems and +${chest.xpWon} XP!</b>${chest.streak > 1 ? `<small>🔥 ${chest.streak}-day challenge streak</small>` : ''}</div>` : ''}
      ${goalGems ? `<div class="goalmet">🎯 Today's goal reached! 💎 +${goalGems} gems</div>` : ''}
      ${r.mode === 'blitz' && r.right >= state.best.blitz && r.right > 0 ? '<p class="newbest">🏁 New personal best!</p>' : ''}
      ${divisionJustUnlocked ? `<div class="rankup unlock"><span class="big">➗</span><b>Division unlocked!</b> You mastered ${DIVISION_TABLES_NEEDED} tables, so now you can try division. Pick ➗ Division on the home screen.</div>` : ''}
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
        ${r.mode === 'daily' ? '' : `<button class="btn go" id="again">${r.mode === 'boss' ? (bossWon ? 'Fight again' : 'Try again') : 'Play again'}</button>`}
        ${troubleFacts(state).length ? '<button class="btn fix" id="fix">🔧 Fix mistakes</button>' : ''}
        <button class="btn" id="home">Home</button>
      </div>
    </section>`;
  document.getElementById('again')?.addEventListener('click', () => startRound(r.mode === 'fix' && !troubleFacts(state).length ? 'practice' : r.mode, { table: r.table }));
  document.getElementById('fix')?.addEventListener('click', () => startRound('fix'));
  document.getElementById('home').addEventListener('click', renderHome);
  document.getElementById('chest')?.addEventListener('click', (e) => {
    e.currentTarget.remove();
    document.getElementById('chestprize').hidden = false;
    sfx.fanfare();
    confetti(150);
  });
  (document.getElementById('chest') || document.getElementById('again') || document.getElementById('home')).focus();
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

// ---------- shop ----------

function shopItemHtml(item, kind, equipped) {
  const own = owns(state, item.id);
  const icon = item.id === 'rank' ? rankFor(state.xp).emoji : item.emoji;
  const label = equipped ? 'Using ✓' : own ? 'Use' : `💎 ${item.cost}`;
  const afford = own || gems(state) >= item.cost;
  return `<button class="shopitem ${equipped ? 'on' : ''} ${afford ? '' : 'poor'}" data-kind="${kind}" data-id="${item.id}">
    <span class="big">${icon}</span><b>${item.name}</b><small>${label}</small></button>`;
}

function renderShop() {
  screen = renderShop;
  const av = state.settings.avatar || 'rank';
  const th = state.settings.theme || 'default';
  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">🛍️ Shop</span><span class="gembal">💎 ${gems(state)}</span></div>
    <section class="card">
      <p class="hint">Earn gems by playing rounds, opening daily chests, beating bosses and reaching your goal.</p>
      <h2>Avatars</h2>
      <div class="shopgrid">${AVATARS.map((a) => shopItemHtml(a, 'avatar', a.id === av)).join('')}</div>
    </section>
    <section class="card">
      <h2>Themes</h2>
      <div class="shopgrid">${THEMES.map((t) => shopItemHtml(t, 'theme', t.id === th)).join('')}</div>
    </section>
    <div id="shopmsg" class="shopmsg" aria-live="polite"></div>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  app.querySelectorAll('.shopitem').forEach((b) => b.addEventListener('click', () => {
    const list = b.dataset.kind === 'avatar' ? AVATARS : THEMES;
    const item = list.find((x) => x.id === b.dataset.id);
    const wasOwned = owns(state, item.id);
    if (!wasOwned && !confirm(`Buy ${item.name} for 💎 ${item.cost}?`)) return;
    if (!buy(state, item)) {
      document.getElementById('shopmsg').textContent = `You need 💎 ${item.cost - gems(state)} more gems for that one. Keep playing!`;
      return;
    }
    state.settings[b.dataset.kind] = item.id;
    applyTheme(state);
    checkBadges(state);
    persist();
    if (!wasOwned) {
      sfx.fanfare();
      confetti(80);
    }
    renderShop();
  }));
}

// ---------- boss battles ----------

function renderBosses() {
  screen = renderBosses;
  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">👾 Boss Battles</span><span></span></div>
    <section class="card">
      <p class="hint">Each boss guards one times table. Every right answer is a hit (fast answers hit twice!). You have ${BOSS_HEARTS} hearts. Beat a boss for the first time to win 💎 60.</p>
      <div class="bossgrid">
        ${ALL_TABLES.map((t) => `
          <button class="bosscard ${bossBeaten(state, t) ? 'beaten' : ''}" data-boss="${t}">
            <span class="big">${BOSSES[t].emoji}</span>
            <b>×${t}</b><small>${BOSSES[t].name}</small>
            ${bossBeaten(state, t) ? '<span class="trophy">🏆</span>' : ''}
          </button>`).join('')}
      </div>
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  app.querySelectorAll('[data-boss]').forEach((b) => b.addEventListener('click', () => startRound('boss', { table: Number(b.dataset.boss) })));
}

// ---------- fact map ----------

function boxClass(s) {
  if (s.box < 0) return 'new';
  if (s.box >= MASTERED_BOX) return 'master';
  if (s.box === 0) return 'miss';
  return s.box >= 3 ? 'almost' : 'learning';
}

function speedClass(s, limit) {
  if (!s.avg) return 'new';
  const l = limit || 6;
  if (s.avg <= l * 0.5) return 'master';
  if (s.avg <= l) return 'almost';
  if (s.avg <= l * 1.5) return 'learning';
  return 'miss';
}

let mapView = 'mastery';

function renderMap() {
  screen = renderMap;
  const limit = state.settings.speed ?? 6;
  let grid = '<div class="cell head">×</div>' + ALL_TABLES.map((n) => `<div class="cell head">${n}</div>`).join('');
  for (const a of ALL_TABLES) {
    grid += `<div class="cell head">${a}</div>`;
    for (const b of ALL_TABLES) {
      const s = stat(state, a <= b ? `${a}x${b}` : `${b}x${a}`);
      grid += `<button class="cell ${mapView === 'speed' ? speedClass(s, limit) : boxClass(s)}" data-a="${a}" data-b="${b}" aria-label="${a} times ${b}">${a * b}</button>`;
    }
  }
  app.innerHTML = `
    <div class="playbar"><button class="link back">← Back</button><span class="modelabel">🗺️ Fact Map</span><span></span></div>
    <section class="card">
      <div class="chips mapviews">
        <button class="chip ${mapView === 'mastery' ? 'on' : ''}" data-view="mastery">🌟 Mastery</button>
        <button class="chip ${mapView === 'speed' ? 'on' : ''}" data-view="speed">⚡ Speed</button>
      </div>
      <p class="hint">Every fact up to 12 × 12. 3 × 7 and 7 × 3 count as the same fact. Tap one to see how it's going.</p>
      <div class="grid">${grid}</div>
      <div class="legend">${mapView === 'speed' ? `
        <span><i class="new"></i>No time yet</span>
        <span><i class="miss"></i>Over ${Math.round((limit || 6) * 1.5)}s</span>
        <span><i class="learning"></i>${limit || 6}–${Math.round((limit || 6) * 1.5)}s</span>
        <span><i class="almost"></i>Under ${limit || 6}s</span>
        <span><i class="master"></i>Under ${(limit || 6) / 2}s</span>` : `
        <span><i class="new"></i>Not tried</span>
        <span><i class="miss"></i>Just missed</span>
        <span><i class="learning"></i>Learning</span>
        <span><i class="almost"></i>Almost</span>
        <span><i class="master"></i>Mastered</span>`}
      </div>
      <div id="cellinfo" class="cellinfo">&nbsp;</div>
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    mapView = b.dataset.view;
    renderMap();
  }));
  const info = document.getElementById('cellinfo');
  app.querySelectorAll('.cell[data-a]').forEach((c) => c.addEventListener('click', () => {
    const a = Number(c.dataset.a), b = Number(c.dataset.b);
    const s = stat(state, a <= b ? `${a}x${b}` : `${b}x${a}`);
    info.textContent = s.box < 0
      ? `${a} × ${b} = ${a * b} · not tried yet`
      : `${a} × ${b} = ${a * b} · right ${s.right} · missed ${s.wrong}${s.avg ? ` · avg ${s.avg}s` : ''}${s.box >= MASTERED_BOX ? ' · mastered ✅' : ''}`;
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
    <p class="hint syncerror">${getStatus() === 'offline' ? esc(errorText()) : ''}</p>
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
      ${canSpeak() ? `<label class="row"><input type="checkbox" id="voice" ${state.settings.voice ? 'checked' : ''}> Read questions out loud 🔊</label>` : ''}
    </section>
    <section class="card settings">
      <h2>👪 For grown-ups</h2>
      <label>Daily goal
        <select id="goalrounds">
          ${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(state.settings.goal?.rounds || 0) === n ? 'selected' : ''}>${n ? `${n} round${n > 1 ? 's' : ''} a day` : 'No goal'}</option>`).join('')}
        </select>
      </label>
      <p class="hint">Reaching the goal gives 💎 30 once a day.</p>
      <p><b>Focus tables</b></p>
      <div class="tablepick" id="focus">
        ${ALL_TABLES.map((t) => `<button class="chip ${(state.settings.goal?.tables || []).includes(t) ? 'on' : ''}" data-focus="${t}">×${t}</button>`).join('')}
      </div>
      <p class="hint">Focus tables get their own practice button, and the daily challenge uses them.</p>
      <label>Division
        <select id="division">
          ${[['auto', `Unlock after mastering ${DIVISION_TABLES_NEEDED} tables (default)`], ['on', 'Unlocked now'], ['off', 'Off']]
            .map(([v, l]) => `<option value="${v}" ${divisionMode(state) === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <p class="hint">With the default, a division question only uses facts he has already mastered (42 ÷ 6 appears once 6 × 7 is mastered).</p>
      <label>Speed needed to master a fact
        <select id="speed">
          ${[[0, 'No time limit'], [10, '10 seconds (relaxed)'], [6, '6 seconds (default)'], [4, '4 seconds (quick)'], [3, '3 seconds (lightning)']]
            .map(([v, l]) => `<option value="${v}" ${(state.settings.speed ?? 6) === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <p class="hint">Slower right answers still count, but a fact only becomes "mastered" when answered this fast.</p>
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
  document.getElementById('voice')?.addEventListener('change', (e) => {
    state.settings.voice = e.target.checked;
    if (e.target.checked) speak('I will read the questions out loud.');
    persist();
  });
  const goalOf = () => ({ rounds: 0, tables: [], ...(state.settings.goal || {}) });
  document.getElementById('goalrounds').addEventListener('change', (e) => {
    state.settings.goal = { ...goalOf(), rounds: Number(e.target.value) };
    persist();
  });
  app.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => {
    const t = Number(b.dataset.focus);
    const set = new Set(goalOf().tables);
    if (set.has(t)) set.delete(t); else set.add(t);
    state.settings.goal = { ...goalOf(), tables: [...set].sort((x, y) => x - y) };
    b.classList.toggle('on', set.has(t));
    persist();
  }));
  document.getElementById('division').addEventListener('change', (e) => {
    state.settings.division = e.target.value;
    persist();
  });
  document.getElementById('speed').addEventListener('change', (e) => {
    state.settings.speed = Number(e.target.value);
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

const MODE_ICON = { practice: '⭐', blitz: '⏱️', fix: '🔧', daily: '🎁', focus: '🎯', boss: '👾' };

function factChips(keys, cls = '') {
  return keys.map((k) => { const [a, b] = parseKey(k); return `<span class="chip ${cls}">${a} × ${b} = ${a * b}</span>`; }).join('');
}

function slowestFacts(n = 8) {
  return Object.entries(state.facts)
    .filter(([, s]) => s.avg)
    .sort((x, y) => y[1].avg - x[1].avg)
    .slice(0, n);
}

function speedHtml() {
  const weekAgo = Date.now() - 7 * 864e5;
  const timed = (state.history || []).filter((h) => h.secs);
  const avgOf = (list) => (list.length ? Math.round((list.reduce((n, h) => n + h.secs * h.total, 0) / list.reduce((n, h) => n + h.total, 0)) * 10) / 10 : 0);
  const thisWeek = avgOf(timed.filter((h) => h.t >= weekAgo));
  const lastWeek = avgOf(timed.filter((h) => h.t < weekAgo && h.t >= weekAgo - 7 * 864e5));
  const slow = slowestFacts();
  const recent = timed.slice(-12);
  const most = Math.max(1, ...recent.map((h) => h.secs));
  if (!timed.length && !slow.length) return '<p class="hint">Speed shows up here after a few rounds.</p>';
  const trend = thisWeek && lastWeek
    ? (thisWeek < lastWeek ? ` <span class="faster">▼ ${Math.round((lastWeek - thisWeek) * 10) / 10}s faster than last week</span>` : thisWeek > lastWeek ? ` <span class="slower">▲ ${Math.round((thisWeek - lastWeek) * 10) / 10}s slower than last week</span>` : '')
    : '';
  return `
    <p class="weekline">Average answer time this week: <b>${thisWeek ? `${thisWeek}s` : '–'}</b>${trend}</p>
    ${recent.length > 1 ? `
      <p class="hint">Average seconds per answer, last ${recent.length} rounds (shorter is faster)</p>
      <div class="bars speedbars">${recent.map((h) => `<div class="bar"><span style="height:${(h.secs / most) * 100}%"></span><b>${h.secs}</b><small>${MODE_ICON[h.mode] || ''}</small></div>`).join('')}</div>` : ''}
    ${slow.length ? `<p><b>🐢 Slowest facts</b> (average time)</p>
      <div class="chips">${slow.map(([k, s]) => { const [a, b] = parseKey(k); return `<span class="chip trouble">${a} × ${b} <small>${s.avg}s</small></span>`; }).join('')}</div>` : ''}`;
}

function weeklyHtml() {
  const w = weeklySummary(state);
  if (!w.rounds) return '<p class="hint">No rounds in the last 7 days yet.</p>';
  const pct = w.total ? Math.round((w.right / w.total) * 100) : 0;
  return `
    <p class="weekline">Played <b>${w.rounds} round${w.rounds > 1 ? 's' : ''}</b> on <b>${w.days} day${w.days > 1 ? 's' : ''}</b>, getting <b>${pct}%</b> right (${w.right} of ${w.total}).</p>
    <p><b>🌟 Newly mastered:</b> ${w.newlyMastered.length ? w.newlyMastered.length : 'none yet'}</p>
    ${w.newlyMastered.length ? `<div class="chips">${factChips(w.newlyMastered.slice(0, 12), 'good')}</div>` : ''}
    <p><b>😬 Still stuck on:</b> ${w.stuck.length ? '' : 'nothing, nice!'}</p>
    ${w.stuck.length ? `<div class="chips">${factChips(w.stuck, 'trouble')}</div>` : ''}`;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) button.textContent = '✅ Copied!';
  } catch {
    prompt('Copy this:', text);
  }
}

function teacherLink(code) {
  return new URL(`report.html?r=${code}`, location.href).href;
}

function teacherCardHtml() {
  if (!syncConfigured) return '';
  if (!state.reportCode) {
    return `
      <p><b>Share with a teacher</b></p>
      <p class="hint">Makes a read-only link to the report. It shows only ${esc((state.name || 'his').split(' ')[0])}'s first name and math progress, stays up to date, and can't change anything in the game. You can turn it off anytime.</p>
      <button class="btn" id="teacheron">🍎 Create teacher link</button>`;
  }
  return `
    <p><b>🍎 Teacher link is on</b></p>
    <div class="joinrow"><input id="teacherlink" readonly value="${esc(teacherLink(state.reportCode))}"><button class="btn" id="copyteacher">Copy</button></div>
    <p class="hint">Read-only and updates as he plays. Turning it off makes the link stop working.</p>
    <button class="btn" id="teacheroff">Turn off teacher link</button>`;
}

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
        <div><b>${dateStreak(state.dailyDone)}</b><small>daily challenge streak</small></div>
        <div><b>${(state.bosses || []).length}/12</b><small>bosses beaten</small></div>
        <div><b>${(state.settings.goal?.rounds) ? `${Math.min(roundsToday(state), state.settings.goal.rounds)}/${state.settings.goal.rounds}` : '–'}</b><small>today's goal</small></div>
        <div><b>💎 ${gems(state)}</b><small>gems to spend</small></div>
      </div>
    </section>
    <section class="card">
      <h2>📋 This week</h2>
      ${weeklyHtml()}
    </section>
    <section class="card">
      <h2>⚡ Speed</h2>
      ${speedHtml()}
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
    <section class="card grownups">
      <h2>👪 Share progress</h2>
      <div class="actions left">
        <a class="btn go" href="report.html">📄 Full report (print or PDF)</a>
        <button class="btn" id="copysum">📋 Copy summary</button>
      </div>
      ${teacherCardHtml()}
    </section>
    <section class="card">
      <h2>Recent rounds</h2>
      ${history.length ? `<ul class="rounds">${history.slice(-20).reverse().map((h) => `
        <li>
          <span class="ricon">${MODE_ICON[h.mode] || '⭐'}</span>
          <span class="rmain"><b>${h.right}${h.mode === 'blitz' ? ' right' : ` / ${h.total}`}</b> · ${esc(h.level)}<small>${when(h.t)}${h.secs ? ` · ${h.secs}s per answer` : ''}</small></span>
          <span class="rstars">${'★'.repeat(h.stars)}${'☆'.repeat(3 - h.stars)}</span>
        </li>`).join('')}</ul>` : '<p class="hint">No rounds yet.</p>'}
    </section>`;
  app.querySelector('.back').addEventListener('click', renderHome);
  document.getElementById('tomap').addEventListener('click', renderMap);
  document.getElementById('copysum').addEventListener('click', (e) => copyText(summaryText(buildSnapshot(state)), e.target));
  document.getElementById('teacheron')?.addEventListener('click', () => {
    state.reportCode = makeCode(REPORT_CODE_LENGTH);
    persist(); // also uploads the first snapshot
    renderProgress();
  });
  document.getElementById('copyteacher')?.addEventListener('click', (e) => copyText(document.getElementById('teacherlink').value, e.target));
  document.getElementById('teacheroff')?.addEventListener('click', () => {
    if (!confirm('Turn off the teacher link? Anyone who has it will no longer see the report.')) return;
    deleteReport(state.reportCode);
    state.reportCode = '';
    persist();
    renderProgress();
  });
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
