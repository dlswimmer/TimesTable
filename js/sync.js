// Optional cloud sync through Firebase Firestore.
//
// Devices that share a "family code" share one progress record at
// families/{code}. Each device keeps its own localStorage copy and merges
// with the cloud copy whenever either side changes, so play works offline.
// Sync is off unless js/firebase-config.js has a config filled in.

import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_LENGTH = 12;
export const REPORT_CODE_LENGTH = 16;
const HISTORY_CAP = 100;

export const syncConfigured = Boolean(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId);

// ---------- family codes ----------

export function makeCode(length = CODE_LENGTH) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** "ABCD-EFGH-JKMN" for display; accepts either form back. */
export function formatCode(code) {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

export function cleanCode(text, length = CODE_LENGTH) {
  const c = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === length && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : '';
}

// ---------- merging two copies of the save ----------

const max = (a, b) => Math.max(a || 0, b || 0);

/**
 * Combine two saves without losing progress from either.
 * Per-fact stats keep the most recently answered copy; counters take the max;
 * badges and history are unioned; preferences come from the newer save.
 */
export function merge(a, b) {
  const [older, newer] = (a.updated || 0) <= (b.updated || 0) ? [a, b] : [b, a];
  const out = { ...older, ...newer };

  out.facts = { ...older.facts };
  for (const [k, s] of Object.entries(newer.facts || {})) {
    const o = out.facts[k];
    if (!o || (s.last || 0) >= (o.last || 0)) out.facts[k] = s;
  }

  out.xp = max(a.xp, b.xp);
  out.rounds = max(a.rounds, b.rounds);
  out.fixed = max(a.fixed, b.fixed);
  out.gemsEarned = max(a.gemsEarned, b.gemsEarned);
  out.gemsSpent = max(a.gemsSpent, b.gemsSpent);
  const union = (x, y) => [...new Set([...(x || []), ...(y || [])])].sort();
  out.owned = union(a.owned, b.owned);
  out.bosses = union(a.bosses, b.bosses).map(Number).sort((x, y) => x - y);
  out.dailyDone = union(a.dailyDone, b.dailyDone).slice(-90);
  out.goalPaid = union(a.goalPaid, b.goalPaid).slice(-90);
  out.best = {
    streak: max(a.best?.streak, b.best?.streak),
    blitz: max(a.best?.blitz, b.best?.blitz),
  };

  out.badges = { ...(b.badges || {}) };
  for (const [id, when] of Object.entries(a.badges || {})) {
    if (!out.badges[id] || when < out.badges[id]) out.badges[id] = when;
  }

  const seen = new Map();
  for (const h of [...(a.history || []), ...(b.history || [])]) seen.set(h.t, h);
  out.history = [...seen.values()].sort((x, y) => x.t - y.t).slice(-HISTORY_CAP);

  const da = a.days || {}, db = b.days || {};
  out.days = (da.last || '') === (db.last || '')
    ? { last: da.last || '', streak: max(da.streak, db.streak) }
    : (da.last || '') > (db.last || '') ? { ...da } : { ...db };

  out.updated = max(a.updated, b.updated);
  return out;
}

/** Same progress, ignoring the timestamp? */
export function sameProgress(a, b) {
  const strip = (s) => JSON.stringify({ ...s, updated: 0, familyCode: '' });
  return strip(a) === strip(b);
}

// ---------- Firestore connection ----------

let fs = null;
let db = null;
let ref = null;
let unsubscribe = null;
let pushTimer = null;
let status = 'off';
let lastError = '';
let statusListener = () => {};

function setStatus(s) {
  status = s;
  statusListener(s);
}

export function getStatus() {
  return status;
}

/** Firebase error code from the last failure, e.g. "permission-denied". */
export function getLastError() {
  return lastError;
}

function fail(err) {
  lastError = (err && (err.code || err.message)) || 'unknown';
  console.warn('Cloud sync failed:', err);
  setStatus('offline');
}

export function onStatus(fn) {
  statusListener = fn;
}

async function ensureDb() {
  if (db) return;
  const appMod = await import(`${SDK}/firebase-app.js`);
  fs = await import(`${SDK}/firebase-firestore.js`);
  db = fs.getFirestore(appMod.initializeApp(FIREBASE_CONFIG));
}

/**
 * Start syncing the save under `code`.
 * getLocal() returns the current local save; applyRemote(merged) replaces it.
 */
export async function connect(code, { getLocal, applyRemote }) {
  disconnect();
  if (!syncConfigured || !code) return;
  setStatus('connecting');
  try {
    await ensureDb();
  } catch (err) {
    fail(err);
    return;
  }
  ref = fs.doc(db, 'families', code);
  unsubscribe = fs.onSnapshot(
    ref,
    (snap) => {
      const local = getLocal();
      let remote = null;
      try {
        remote = snap.exists() ? JSON.parse(snap.data().data) : null;
      } catch {
        remote = null;
      }
      if (!remote) {
        pushNow(local);
        return;
      }
      const merged = merge(local, remote);
      merged.familyCode = code;
      if (!sameProgress(merged, local)) applyRemote(merged);
      if (!sameProgress(merged, remote)) schedulePush(merged);
      else if (!snap.metadata.hasPendingWrites) {
        lastError = '';
        setStatus('synced');
      }
    },
    fail,
  );
}

export function disconnect() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  ref = null;
  clearTimeout(pushTimer);
  setStatus('off');
}

async function pushNow(state) {
  if (!ref) return;
  setStatus('saving');
  try {
    await fs.setDoc(ref, {
      data: JSON.stringify(state),
      name: state.name || '',
      updated: state.updated || Date.now(),
    });
    lastError = '';
    setStatus('synced');
  } catch (err) {
    fail(err);
  }
}

/** Called after every local save; batches quick changes into one write. */
export function schedulePush(state) {
  if (!ref) return;
  clearTimeout(pushTimer);
  setStatus('saving');
  pushTimer = setTimeout(() => pushNow(state), 1500);
}

// ---------- read-only teacher reports ----------
// A separate document, reports/{16-char code}, holds only a report snapshot
// (first name and math stats). The game never reads it, so someone with the
// report link can't affect play.

let reportTimer = null;

export function pushReport(code, snapshot) {
  if (!syncConfigured || !code) return;
  clearTimeout(reportTimer);
  reportTimer = setTimeout(async () => {
    try {
      await ensureDb();
      await fs.setDoc(fs.doc(db, 'reports', code), { data: JSON.stringify(snapshot), updated: Date.now() });
    } catch (err) {
      console.warn('Report update failed:', err);
    }
  }, 2000);
}

export async function deleteReport(code) {
  clearTimeout(reportTimer);
  if (!syncConfigured || !code) return;
  try {
    await ensureDb();
    await fs.deleteDoc(fs.doc(db, 'reports', code));
  } catch (err) {
    console.warn('Report delete failed:', err);
  }
}

/** For the report page: the shared snapshot, or null if it's gone. */
export async function fetchReport(code) {
  await ensureDb();
  const snap = await fs.getDoc(fs.doc(db, 'reports', code));
  return snap.exists() ? JSON.parse(snap.data().data) : null;
}
