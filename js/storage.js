// Everything the game remembers lives in one localStorage object.
// Bump VERSION and add a migration if the shape changes.

const KEY = 'timestable.save';
const VERSION = 1;

function fresh() {
  return {
    version: VERSION,
    name: '',
    settings: { difficulty: 'easy', qtype: 'mixed', sound: true, voice: false, speed: 6, avatar: 'rank', theme: 'default', goal: { rounds: 0, tables: [] } },
    // facts["3x7"] = { right, wrong, box, last }  (box 0..5, Leitner-style)
    facts: {},
    xp: 0,
    best: { streak: 0, blitz: 0 },
    badges: {},          // id -> ISO date earned
    rounds: 0,
    days: { last: '', streak: 0 },
    history: [],         // recent rounds, newest last (capped)
    gemsEarned: 0,       // gems balance = earned - spent (both only go up, so sync can merge)
    gemsSpent: 0,
    owned: [],           // shop item ids
    bosses: [],          // tables whose boss is beaten
    dailyDone: [],       // YYYY-MM-DD dates the daily challenge was finished
    goalPaid: [],        // dates the daily-goal bonus was paid
    familyCode: '',      // cloud sync code, '' = this device only
    updated: 0,          // ms timestamp of last change
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

let onSave = null;

/** Register a callback run after every save (used by cloud sync). */
export function setOnSave(fn) {
  onSave = fn;
}

/** Save locally. `touch` marks it as a new change (false when applying synced data). */
export function save(state, touch = true) {
  if (touch) state.updated = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or storage full: game still works, just forgets */
  }
  if (touch && onSave) onSave(state);
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return fresh();
}
