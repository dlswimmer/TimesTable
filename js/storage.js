// Everything the game remembers lives in one localStorage object.
// Bump VERSION and add a migration if the shape changes.

const KEY = 'timestable.save';
const VERSION = 1;

function fresh() {
  return {
    version: VERSION,
    name: '',
    settings: { difficulty: 'easy', qtype: 'mixed', sound: true },
    // facts["3x7"] = { right, wrong, box, last }  (box 0..5, Leitner-style)
    facts: {},
    xp: 0,
    best: { streak: 0, blitz: 0 },
    badges: {},          // id -> ISO date earned
    rounds: 0,
    days: { last: '', streak: 0 },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    const base = fresh();
    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      best: { ...base.best, ...(data.best || {}) },
      days: { ...base.days, ...(data.days || {}) },
    };
  } catch {
    return fresh();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or storage full: game still works, just forgets */
  }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return fresh();
}
