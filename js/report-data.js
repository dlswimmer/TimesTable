// Turns a save into report numbers. Used by the report page (from this
// device's save or a shared teacher snapshot) and the "Copy summary" button.

const MASTERED_BOX = 4;
const DAY = 864e5;
const TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const key = (a, b) => (a <= b ? `${a}x${b}` : `${b}x${a}`);
const parse = (k) => k.split('x').map(Number);
const pct = (r, t) => (t ? Math.round((r / t) * 100) : null);
const round1 = (n) => Math.round(n * 10) / 10;
const dayKey = (t) => new Date(t).toLocaleDateString('en-CA');

/**
 * The part of a save that a teacher's read-only link may see: first name and
 * math progress only. No settings, family code, gems or shop items.
 */
export function buildSnapshot(state) {
  const facts = {};
  for (const [k, s] of Object.entries(state.facts || {})) {
    facts[k] = { box: s.box, right: s.right, wrong: s.wrong, avg: s.avg || 0, masteredAt: s.masteredAt || 0 };
  }
  return {
    v: 1,
    name: (state.name || '').split(' ')[0],
    generatedAt: Date.now(),
    xp: state.xp || 0,
    rounds: state.rounds || 0,
    facts,
    history: (state.history || []).map(({ t, mode, level, right, total, stars, secs, missed }) => ({ t, mode, level, right, total, stars, secs: secs || 0, missed: missed || [] })),
    badges: Object.keys(state.badges || {}).length,
    bosses: (state.bosses || []).length,
    dailyDone: state.dailyDone || [],
  };
}

function stat(snap, k) {
  return snap.facts[k] || { box: -1, right: 0, wrong: 0, avg: 0 };
}

function factState(s) {
  if (s.box < 0) return 'new';
  if (s.box >= MASTERED_BOX) return 'master';
  if (s.box === 0) return 'miss';
  return 'learning';
}

function windowStats(history, from, to) {
  const list = history.filter((h) => h.t >= from && h.t < to);
  const right = list.reduce((n, h) => n + h.right, 0);
  const total = list.reduce((n, h) => n + h.total, 0);
  const timed = list.filter((h) => h.secs);
  const tTotal = timed.reduce((n, h) => n + h.total, 0);
  const secs = tTotal ? round1(timed.reduce((n, h) => n + h.secs * h.total, 0) / tTotal) : null;
  const days = new Set(list.map((h) => dayKey(h.t))).size;
  return { rounds: list.length, right, total, accuracy: pct(right, total), secs, days };
}

export function analyze(snap) {
  const now = Date.now();
  const history = snap.history || [];
  const allKeys = [...new Set(TABLES.flatMap((a) => TABLES.map((b) => key(a, b))))];
  const mastered = allKeys.filter((k) => stat(snap, k).box >= MASTERED_BOX);

  const tables = TABLES.map((t) => {
    const counts = { master: 0, learning: 0, miss: 0, new: 0 };
    let avgSum = 0, avgN = 0, right = 0, wrong = 0;
    for (let n = 1; n <= 12; n++) {
      const s = stat(snap, key(t, n));
      counts[factState(s)]++;
      right += s.right;
      wrong += s.wrong;
      if (s.avg) { avgSum += s.avg; avgN++; }
    }
    return { table: t, ...counts, accuracy: pct(right, right + wrong), secs: avgN ? round1(avgSum / avgN) : null };
  });

  const weeks = Array.from({ length: 6 }, (_, i) => {
    const to = now - i * 7 * DAY;
    return { label: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`, ...windowStats(history, to - 7 * DAY, to) };
  }).reverse();

  const calendar = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (27 - i));
    const k = dayKey(d.getTime());
    return { date: d, rounds: history.filter((h) => dayKey(h.t) === k).length };
  });

  const stuck = Object.entries(snap.facts)
    .filter(([, s]) => s.wrong > 0 && s.box < MASTERED_BOX)
    .sort((a, b) => a[1].box - b[1].box || b[1].wrong - a[1].wrong)
    .slice(0, 12)
    .map(([k, s]) => ({ key: k, ...s }));

  const slowest = Object.entries(snap.facts)
    .filter(([, s]) => s.avg)
    .sort((a, b) => b[1].avg - a[1].avg)
    .slice(0, 8)
    .map(([k, s]) => ({ key: k, ...s }));

  const recentlyMastered = Object.entries(snap.facts)
    .filter(([, s]) => s.masteredAt && s.masteredAt >= now - 14 * DAY && s.box >= MASTERED_BOX)
    .sort((a, b) => b[1].masteredAt - a[1].masteredAt)
    .map(([k]) => k);

  const masteredTables = tables.filter((t) => t.master === 12).map((t) => t.table);

  return {
    name: snap.name || 'Student',
    generatedAt: snap.generatedAt || now,
    totalFacts: allKeys.length,
    mastered: mastered.length,
    rounds: snap.rounds || history.length,
    week: windowStats(history, now - 7 * DAY, now),
    lastWeek: windowStats(history, now - 14 * DAY, now - 7 * DAY),
    month: windowStats(history, now - 28 * DAY, now),
    tables,
    masteredTables,
    weeks,
    calendar,
    stuck,
    slowest,
    recentlyMastered,
    badges: snap.badges || 0,
    bosses: snap.bosses || 0,
    dailyCount: (snap.dailyDone || []).length,
    recent: history.slice(-15).reverse(),
  };
}

const factText = (k) => { const [a, b] = parse(k); return `${a}×${b}`; };

/** A few plain sentences for an email or text message. */
export function summaryText(snap) {
  const r = analyze(snap);
  const lines = [`${r.name}'s times tables (as of ${new Date(r.generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`];
  if (r.week.rounds) {
    lines.push(`This week: ${r.week.rounds} round${r.week.rounds > 1 ? 's' : ''} on ${r.week.days} day${r.week.days > 1 ? 's' : ''}, ${r.week.accuracy}% right${r.week.secs ? `, ${r.week.secs}s per answer on average` : ''}.`);
  } else {
    lines.push('No practice yet this week.');
  }
  lines.push(`Mastered ${r.mastered} of ${r.totalFacts} facts up to 12×12${r.masteredTables.length ? ` (all of ×${r.masteredTables.join(', ×')})` : ''}.`);
  if (r.recentlyMastered.length) lines.push(`Newly mastered: ${r.recentlyMastered.slice(0, 8).map(factText).join(', ')}.`);
  if (r.stuck.length) lines.push(`Working on: ${r.stuck.slice(0, 5).map((s) => factText(s.key)).join(', ')}.`);
  return lines.join('\n');
}
