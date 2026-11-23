// Daily challenge, gems and the shop, boss battles, parent goals,
// read-aloud, and the dot-grid picture shown after a miss.

import { factsFor, stat, troubleFacts, MASTERED_BOX } from './facts.js';

export const ALL_TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
}

/** Consecutive days (ending today or yesterday) found in a list of dates. */
export function dateStreak(dates) {
  const set = new Set(dates || []);
  let start = set.has(today()) ? 0 : 1;
  let n = 0;
  while (set.has(daysAgo(start + n))) n++;
  return n;
}

// ---------- gems ----------
// Earned and spent are kept separately so two synced devices can merge
// them safely (each only ever goes up).

export function gems(state) {
  return (state.gemsEarned || 0) - (state.gemsSpent || 0);
}

export function addGems(state, n) {
  state.gemsEarned = (state.gemsEarned || 0) + Math.max(0, Math.round(n));
}

export function spendGems(state, n) {
  if (gems(state) < n) return false;
  state.gemsSpent = (state.gemsSpent || 0) + n;
  return true;
}

// ---------- daily challenge ----------

export const DAILY_LENGTH = 10;

export function dailyDoneToday(state) {
  return (state.dailyDone || []).includes(today());
}

/** Facts for today's challenge: parent's focus tables, or weak spots plus the current level. */
export function dailyPool(state, levelPool) {
  const focus = state.settings.goal?.tables || [];
  if (focus.length) return factsFor(focus, 12);
  const weak = troubleFacts(state).slice(0, 8);
  return [...new Set([...weak, ...levelPool])];
}

/** Open the reward chest: gems and bonus XP, a bit more for longer streaks. */
export function openChest(state) {
  const streak = dateStreak(state.dailyDone);
  const gemsWon = 25 + Math.floor(Math.random() * 30) + Math.min(streak, 7) * 5;
  const xpWon = 50;
  addGems(state, gemsWon);
  state.xp += xpWon;
  return { gemsWon, xpWon, streak };
}

export function markDailyDone(state) {
  const d = today();
  if (!(state.dailyDone || []).includes(d)) {
    state.dailyDone = [...(state.dailyDone || []), d].slice(-90);
  }
}

// ---------- parent goals ----------

export function roundsToday(state) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return (state.history || []).filter((h) => h.t >= start.getTime()).length;
}

/** Pay the daily-goal bonus once per day. Returns gems paid (0 if none). */
export function checkGoal(state) {
  const target = state.settings.goal?.rounds || 0;
  if (!target || roundsToday(state) < target) return 0;
  const d = today();
  if ((state.goalPaid || []).includes(d)) return 0;
  state.goalPaid = [...(state.goalPaid || []), d].slice(-90);
  addGems(state, 30);
  return 30;
}

// ---------- shop ----------

export const AVATARS = [
  { id: 'rank', emoji: '', name: 'My rank', cost: 0 },
  { id: 'cat', emoji: '🐱', name: 'Cat', cost: 40 },
  { id: 'dog', emoji: '🐶', name: 'Pup', cost: 40 },
  { id: 'fox', emoji: '🦊', name: 'Fox', cost: 60 },
  { id: 'panda', emoji: '🐼', name: 'Panda', cost: 60 },
  { id: 'frog', emoji: '🐸', name: 'Frog', cost: 80 },
  { id: 'octopus', emoji: '🐙', name: 'Octopus', cost: 100 },
  { id: 'shark', emoji: '🦈', name: 'Shark', cost: 120 },
  { id: 'robot', emoji: '🤖', name: 'Robot', cost: 150 },
  { id: 'alien', emoji: '👽', name: 'Alien', cost: 150 },
  { id: 'astronaut', emoji: '🧑‍🚀', name: 'Astronaut', cost: 200 },
  { id: 'trex', emoji: '🦖', name: 'T-Rex', cost: 250 },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn', cost: 300 },
  { id: 'dragon', emoji: '🐲', name: 'Dragon', cost: 400 },
  { id: 'crown', emoji: '🤴', name: 'Royalty', cost: 500 },
];

export const THEMES = [
  { id: 'default', emoji: '🟣', name: 'Classic', cost: 0 },
  { id: 'ocean', emoji: '🌊', name: 'Ocean', cost: 120 },
  { id: 'jungle', emoji: '🌴', name: 'Jungle', cost: 120 },
  { id: 'candy', emoji: '🍭', name: 'Candy', cost: 150 },
  { id: 'space', emoji: '🌌', name: 'Space (dark)', cost: 250 },
];

export function owns(state, id) {
  return id === 'rank' || id === 'default' || (state.owned || []).includes(id);
}

export function buy(state, item) {
  if (owns(state, item.id)) return true;
  if (!spendGems(state, item.cost)) return false;
  state.owned = [...(state.owned || []), item.id];
  return true;
}

export function avatarEmoji(state, rankEmoji) {
  const a = AVATARS.find((x) => x.id === state.settings.avatar);
  return a && a.emoji && owns(state, a.id) ? a.emoji : rankEmoji;
}

export function applyTheme(state) {
  const t = state.settings.theme;
  document.documentElement.dataset.theme = t && owns(state, t) ? t : 'default';
}

// ---------- boss battles ----------

export const BOSSES = [
  null,
  { name: 'Sir Uno', emoji: '🐌' },
  { name: 'Double Trouble', emoji: '👯' },
  { name: 'Tri-Clops', emoji: '👁️' },
  { name: 'Quad Squid', emoji: '🦑' },
  { name: 'High Five Hydra', emoji: '🐍' },
  { name: 'Hexabot', emoji: '🤖' },
  { name: 'Lucky Seven Ghost', emoji: '👻' },
  { name: 'Octo King', emoji: '🐙' },
  { name: 'Nine-Tail Fox', emoji: '🦊' },
  { name: 'Ten-Ton Troll', emoji: '🧌' },
  { name: 'Eleven Elf', emoji: '🧝' },
  { name: 'Dozen Dragon', emoji: '🐉' },
];

export const BOSS_HP = 10;
export const BOSS_HEARTS = 3;

export function bossBeaten(state, table) {
  return (state.bosses || []).includes(table);
}

export function markBossBeaten(state, table) {
  if (!bossBeaten(state, table)) state.bosses = [...(state.bosses || []), table].sort((a, b) => a - b);
}

// ---------- weekly summary ----------

export function weeklySummary(state) {
  const weekAgo = Date.now() - 7 * 864e5;
  const week = (state.history || []).filter((h) => h.t >= weekAgo);
  const right = week.reduce((n, h) => n + h.right, 0);
  const total = week.reduce((n, h) => n + h.total, 0);
  const newlyMastered = Object.entries(state.facts)
    .filter(([, s]) => s.masteredAt && s.masteredAt >= weekAgo && s.box >= MASTERED_BOX)
    .map(([k]) => k);
  const missedCount = {};
  for (const h of week) for (const k of h.missed || []) missedCount[k] = (missedCount[k] || 0) + 1;
  const stuck = Object.entries(missedCount)
    .filter(([k]) => stat(state, k).box < MASTERED_BOX)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const days = new Set(week.map((h) => new Date(h.t).toLocaleDateString('en-CA'))).size;
  return { rounds: week.length, right, total, newlyMastered, stuck, days };
}

// ---------- read aloud ----------

export function canSpeak() {
  return 'speechSynthesis' in window;
}

export function speak(text) {
  if (!canSpeak()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch {
    /* no voice available */
  }
}

// ---------- dot grid ----------

/** a rows of b dots, every other row tinted so groups are easy to count. */
export function dotGridHtml(a, b) {
  if (a * b > 144 || a < 1 || b < 1) return '';
  const rows = Array.from({ length: a }, (_, r) => `<div class="dotrow ${r % 2 ? 'alt' : ''}">${'<i></i>'.repeat(b)}</div>`).join('');
  return `<div class="dotgrid" aria-label="${a} rows of ${b} dots">${rows}</div>
    <small class="dotcap">${a} rows of ${b} = ${a * b}</small>`;
}
