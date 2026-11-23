// Question types. Each builder takes the two factors and returns a question:
//   { type, prompt, answer, choices? }
// `prompt` is an array of tokens so the UI can render the blank nicely.
// To add a new type: write a builder, add it to BUILDERS, and give it a
// weight in the levels in facts.js.

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Wrong answers that look tempting: neighbouring facts, off-by-one, etc. */
function distractors(a, b, count) {
  const right = a * b;
  const ideas = [
    a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b,
    right + 1, right - 1, right + 10, right - 10, a + b,
    Number(String(right).split('').reverse().join('')),
  ];
  const out = new Set();
  for (const n of shuffle(ideas)) {
    if (n > 0 && n !== right) out.add(n);
    if (out.size >= count) break;
  }
  let bump = 2;
  while (out.size < count) {
    out.add(right + bump);
    bump++;
  }
  return [...out];
}

const BUILDERS = {
  choice(a, b) {
    return {
      type: 'choice',
      prompt: [a, '×', b, '=', '?'],
      answer: a * b,
      choices: shuffle([a * b, ...distractors(a, b, 3)]),
    };
  },

  type(a, b) {
    return { type: 'type', prompt: [a, '×', b, '=', '?'], answer: a * b };
  },

  missing(a, b) {
    // Hide one of the factors: a × ? = product
    return { type: 'missing', prompt: [a, '×', '?', '=', a * b], answer: b };
  },

  divide(a, b) {
    // product ÷ a = b
    return { type: 'divide', prompt: [a * b, '÷', a, '=', '?'], answer: b };
  },

  truefalse(a, b) {
    const isTrue = Math.random() < 0.5;
    const shown = isTrue ? a * b : distractors(a, b, 1)[0];
    return {
      type: 'truefalse',
      prompt: [a, '×', b, '=', shown],
      answer: isTrue ? 'yes' : 'no',
      choices: ['yes', 'no'],
      realAnswer: a * b,
    };
  },
};

export const QTYPE_LABELS = {
  mixed: { label: 'Mix it up', emoji: '🎲' },
  choice: { label: 'Pick one', emoji: '🔘' },
  type: { label: 'Type it', emoji: '⌨️' },
  missing: { label: 'Missing number', emoji: '🔍' },
  truefalse: { label: 'True or false', emoji: '👍' },
  divide: { label: 'Division', emoji: '➗' },
};

function weightedType(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of entries) {
    r -= w;
    if (r <= 0) return t;
  }
  return entries[0][0];
}

/**
 * Build a question for fact (x, y).
 * qtype is 'mixed' or a specific type; levelWeights steer the mix.
 */
export function makeQuestion(x, y, qtype, levelWeights) {
  // Random order so he sees both 3 × 7 and 7 × 3.
  const [a, b] = Math.random() < 0.5 ? [x, y] : [y, x];
  const type = qtype === 'mixed' ? weightedType(levelWeights) : qtype;
  return BUILDERS[type](a, b);
}

export function answerText(q) {
  if (q.type === 'truefalse') return `${q.prompt[0]} × ${q.prompt[2]} = ${q.realAnswer}`;
  if (q.type === 'missing') return `${q.prompt[0]} × ${q.answer} = ${q.prompt[4]}`;
  if (q.type === 'divide') return `${q.prompt[0]} ÷ ${q.prompt[2]} = ${q.answer}`;
  return `${q.prompt[0]} × ${q.prompt[2]} = ${q.answer}`;
}

/** The question as a sentence, for reading aloud. */
export function spokenText(q) {
  const [p0, , p2, , p4] = q.prompt;
  if (q.type === 'missing') return `${p0} times what equals ${p4}?`;
  if (q.type === 'divide') return `${p0} divided by ${p2}?`;
  if (q.type === 'truefalse') return `Is ${p0} times ${p2} equal to ${p4}?`;
  return `${p0} times ${p2}?`;
}
