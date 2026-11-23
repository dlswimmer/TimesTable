// Facts, difficulty levels, and the "remember what he missed" logic.
//
// Each fact (3 x 7 and 7 x 3 are the same fact) sits in a Leitner box 0..5.
// A miss drops it to box 0; a correct answer moves it up one box.
// Lower boxes are picked much more often, so missed facts keep coming back
// until they are solid. Box 4+ counts as "mastered".

export const MASTERED_BOX = 4;
export const MAX_BOX = 5;

export const LEVELS = {
  easy: {
    label: 'Rookie',
    emoji: '🐣',
    blurb: '×1, ×2, ×5, ×10',
    tables: [1, 2, 5, 10],
    maxFactor: 10,
    points: 10,
    qtypes: { choice: 4, truefalse: 3, type: 1, missing: 0 },
  },
  medium: {
    label: 'Explorer',
    emoji: '🚀',
    blurb: '×1 to ×10',
    tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    maxFactor: 10,
    points: 15,
    qtypes: { choice: 3, truefalse: 1, type: 3, missing: 1 },
  },
  hard: {
    label: 'Champion',
    emoji: '🏆',
    blurb: '×1 to ×12, trickier questions',
    tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    maxFactor: 12,
    points: 20,
    qtypes: { choice: 1, truefalse: 1, type: 4, missing: 3, divide: 2 },
  },
};

export function factKey(a, b) {
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

export function parseKey(key) {
  const [a, b] = key.split('x').map(Number);
  return [a, b];
}

/** All fact keys that a level (or custom table list) covers. */
export function factsFor(tables, maxFactor) {
  const set = new Set();
  for (const t of tables) {
    for (let n = 1; n <= maxFactor; n++) set.add(factKey(t, n));
  }
  return [...set];
}

export function stat(state, key) {
  return state.facts[key] || { right: 0, wrong: 0, box: -1, last: 0 };
}

const BOX_WEIGHT = { '-1': 4, 0: 10, 1: 6, 2: 3, 3: 2, 4: 1, 5: 0.5 };

/** Pick a fact, favouring missed/new ones and avoiding recent repeats. */
export function pickFact(state, pool, recent = []) {
  const candidates = pool.filter((k) => !recent.includes(k));
  const list = candidates.length ? candidates : pool;
  let total = 0;
  const weights = list.map((k) => {
    const w = BOX_WEIGHT[stat(state, k).box] ?? 1;
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** Facts he has missed and not yet mastered, worst first. */
export function troubleFacts(state) {
  return Object.entries(state.facts)
    .filter(([, s]) => s.wrong > 0 && s.box < MASTERED_BOX)
    .sort((x, y) => x[1].box - y[1].box || y[1].wrong - x[1].wrong)
    .map(([k]) => k);
}

/**
 * Record an answer.
 * With a speed limit (seconds), a correct but slow answer still counts,
 * but the fact can't reach "mastered" until it is answered quickly.
 * Returns { fixed, slow, mastered }:
 *   fixed: a previously-missed fact he just got right (for the "fixer" badge)
 *   slow: right, but too slow to move toward mastery
 *   mastered: this answer made the fact mastered for the first time
 */
export function record(state, key, correct, seconds = 0, speedLimit = 0) {
  const s = { ...stat(state, key) };
  const wasTrouble = s.wrong > 0 && s.box <= 1;
  let slow = false;
  let mastered = false;
  if (correct) {
    s.right++;
    let box = Math.min(MAX_BOX, Math.max(0, s.box) + 1);
    if (speedLimit && seconds > speedLimit && box >= MASTERED_BOX) {
      box = Math.max(s.box, MASTERED_BOX - 1);
      slow = s.box < MASTERED_BOX;
    }
    if (box >= MASTERED_BOX && !s.masteredAt) {
      s.masteredAt = Date.now();
      mastered = true;
    }
    s.box = box;
    if (seconds > 0) {
      const secs = Math.min(seconds, 60);
      s.secs = Math.round(secs * 10) / 10;
      // running average of correct-answer time, weighted toward recent answers
      s.avg = Math.round((s.avg ? s.avg * 0.7 + secs * 0.3 : secs) * 10) / 10;
    }
  } else {
    s.wrong++;
    s.box = 0;
  }
  s.last = Date.now();
  state.facts[key] = s;
  return { fixed: correct && wasTrouble, slow, mastered };
}

export function isTableMastered(state, table, maxFactor = 12) {
  for (let n = 1; n <= maxFactor; n++) {
    if (stat(state, factKey(table, n)).box < MASTERED_BOX) return false;
  }
  return true;
}

/** A friendly tip for a fact, shown after a miss. */
export function tipFor(a, b) {
  const tips = [];
  const pairs = [[a, b], [b, a]];
  for (const [x, y] of pairs) {
    if (x === 1) tips.push(`Anything × 1 stays the same: ${y}.`);
    else if (x === 2) tips.push(`×2 is just doubling: ${y} + ${y} = ${2 * y}.`);
    else if (x === 10) tips.push(`×10: put a zero on the end of ${y} → ${10 * y}.`);
    else if (x === 5) tips.push(`×5 is half of ×10: ${y} × 10 = ${10 * y}, half is ${5 * y}.`);
    else if (x === 4) tips.push(`×4 is double, then double again: ${y} → ${2 * y} → ${4 * y}.`);
    else if (x === 9 && y <= 10) tips.push(`×9 trick: ${y} × 10 = ${10 * y}, minus ${y} = ${9 * y}.`);
    else if (x === 11 && y <= 9) tips.push(`×11 with a small number repeats it: ${y}${y}.`);
    if (tips.length) break;
  }
  if (!tips.length && a > 1 && b > 1) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo <= 4) {
      tips.push(`Think ${lo} groups of ${hi}: ${Array(lo).fill(hi).join(' + ')} = ${a * b}.`);
    } else {
      tips.push(`Break it up: ${hi} × 5 = ${hi * 5}, plus ${hi} × ${lo - 5} = ${hi * (lo - 5)}, makes ${a * b}.`);
    }
  }
  if (a === b) tips.push(`${a} × ${a} is a square number. Picture a ${a} by ${a} grid!`);
  return tips[0] || '';
}

// ---------- division unlock ----------
// Division is multiplication backwards, so it waits until the facts are solid.
// settings.division: 'auto' (unlock after 3 tables are mastered up to ×10),
// 'on' (unlocked now, any fact), or 'off'.

export const DIVISION_TABLES_NEEDED = 3;

export function masteredTableCount(state) {
  let n = 0;
  for (let t = 1; t <= 12; t++) if (isTableMastered(state, t, 10)) n++;
  return n;
}

export function divisionMode(state) {
  return state.settings.division || 'auto';
}

export function divisionUnlocked(state) {
  const mode = divisionMode(state);
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return masteredTableCount(state) >= DIVISION_TABLES_NEEDED;
}

/** May this fact be asked as a division question? (auto mode: only once it's mastered) */
export function canDivide(state, key) {
  if (!divisionUnlocked(state)) return false;
  return divisionMode(state) === 'on' || stat(state, key).box >= MASTERED_BOX;
}
