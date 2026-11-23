// Points, ranks and badges.

import { isTableMastered, factsFor, stat, MASTERED_BOX, masteredTableCount, DIVISION_TABLES_NEEDED } from './facts.js';

export const RANKS = [
  { xp: 0, title: 'Number Cub', emoji: '🐻' },
  { xp: 150, title: 'Math Sprout', emoji: '🌱' },
  { xp: 400, title: 'Times Tiger', emoji: '🐯' },
  { xp: 800, title: 'Number Ninja', emoji: '🥷' },
  { xp: 1400, title: 'Math Wizard', emoji: '🧙' },
  { xp: 2200, title: 'Rocket Brain', emoji: '🚀' },
  { xp: 3300, title: 'Times Table Dragon', emoji: '🐉' },
  { xp: 4800, title: 'Galaxy Genius', emoji: '🌌' },
  { xp: 7000, title: 'Legend of Times', emoji: '👑' },
];

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const cur = RANKS[i];
  const next = RANKS[i + 1];
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { index: i, ...cur, next, progress };
}

/** Points for one correct answer. */
export function pointsFor(base, streak, seconds) {
  const streakBonus = Math.min(streak, 10) * 2;
  const speedBonus = seconds < 3 ? 5 : seconds < 6 ? 2 : 0;
  return base + streakBonus + speedBonus;
}

const TABLE_BADGE_EMOJI = ['', '🥇', '✌️', '🔺', '🍀', '🖐️', '🎲', '🌈', '🐙', '⚾', '🔟', '⚽', '🕛'];

export const BADGES = [
  { id: 'first', emoji: '🎉', name: 'First Round', desc: 'Finish your first round', test: (s) => s.rounds >= 1 },
  { id: 'streak5', emoji: '🔥', name: 'On Fire', desc: '5 right in a row', test: (s) => s.best.streak >= 5 },
  { id: 'streak10', emoji: '☄️', name: 'Unstoppable', desc: '10 right in a row', test: (s) => s.best.streak >= 10 },
  { id: 'streak25', emoji: '🌋', name: 'Volcano', desc: '25 right in a row', test: (s) => s.best.streak >= 25 },
  { id: 'perfect', emoji: '💯', name: 'Perfect!', desc: 'Get every question right in a round', test: (s, r) => r && r.mode !== 'blitz' && r.total >= 10 && r.right === r.total },
  { id: 'fixer', emoji: '🔧', name: 'Fixer Upper', desc: 'Fix 5 facts you used to miss', test: (s) => (s.fixed || 0) >= 5 },
  { id: 'fixer25', emoji: '🛠️', name: 'Master Mechanic', desc: 'Fix 25 facts you used to miss', test: (s) => (s.fixed || 0) >= 25 },
  { id: 'blitz15', emoji: '⚡', name: 'Lightning', desc: '15 right in Beat the Clock', test: (s) => s.best.blitz >= 15 },
  { id: 'blitz30', emoji: '🌩️', name: 'Thunderbolt', desc: '30 right in Beat the Clock', test: (s) => s.best.blitz >= 30 },
  { id: 'days3', emoji: '📅', name: 'Habit Hero', desc: 'Play 3 days in a row', test: (s) => s.days.streak >= 3 },
  { id: 'days7', emoji: '🗓️', name: 'Week Warrior', desc: 'Play 7 days in a row', test: (s) => s.days.streak >= 7 },
  { id: 'daily1', emoji: '🎁', name: 'Challenger', desc: 'Finish a daily challenge', test: (s) => (s.dailyDone || []).length >= 1 },
  { id: 'daily7', emoji: '🗝️', name: 'Treasure Hunter', desc: 'Finish 7 daily challenges', test: (s) => (s.dailyDone || []).length >= 7 },
  { id: 'boss1', emoji: '⚔️', name: 'Boss Slayer', desc: 'Beat your first boss', test: (s) => (s.bosses || []).length >= 1 },
  { id: 'boss12', emoji: '🛡️', name: 'Hero of the Realm', desc: 'Beat all 12 bosses', test: (s) => (s.bosses || []).length >= 12 },
  { id: 'division', emoji: '➗', name: 'Division Unlocked', desc: `Master ${DIVISION_TABLES_NEEDED} tables up to ×10`, test: (s) => masteredTableCount(s) >= DIVISION_TABLES_NEEDED },
  { id: 'shopper', emoji: '🛍️', name: 'Shopper', desc: 'Buy something in the shop', test: (s) => (s.owned || []).length >= 1 },
  { id: 'rounds25', emoji: '🎮', name: 'Gamer', desc: 'Finish 25 rounds', test: (s) => s.rounds >= 25 },
  ...Array.from({ length: 12 }, (_, i) => {
    const t = i + 1;
    return {
      id: `table${t}`,
      emoji: TABLE_BADGE_EMOJI[t],
      name: `${t}s Master`,
      desc: `Master every ×${t} fact up to 12`,
      test: (s) => isTableMastered(s, t, 12),
    };
  }),
  {
    id: 'all',
    emoji: '🦄',
    name: 'Times Table Legend',
    desc: 'Master all 78 facts up to 12 × 12',
    test: (s) => factsFor([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12).every((k) => stat(s, k).box >= MASTERED_BOX),
  },
];

/** Award any newly-earned badges. Returns the list of new ones. */
export function checkBadges(state, round = null) {
  const earned = [];
  for (const b of BADGES) {
    if (state.badges[b.id]) continue;
    if (b.test(state, round)) {
      state.badges[b.id] = new Date().toISOString();
      earned.push(b);
    }
  }
  return earned;
}

/** Track consecutive days played. */
export function touchDay(state) {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  if (state.days.last === today) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = y.toLocaleDateString('en-CA');
  state.days.streak = state.days.last === yesterday ? state.days.streak + 1 : 1;
  state.days.last = today;
}
