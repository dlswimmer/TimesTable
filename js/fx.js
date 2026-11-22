// Little sounds (Web Audio, no files) and confetti (canvas).

let ctx = null;
let enabled = true;

export function setSound(on) {
  enabled = on;
}

function tone(freq, start, dur, type = 'sine', vol = 0.15) {
  if (!enabled) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* no audio available */
  }
}

export const sfx = {
  right() { tone(660, 0, 0.12); tone(880, 0.08, 0.18); },
  wrong() { tone(220, 0, 0.25, 'triangle', 0.12); },
  streak() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.15, 'square', 0.06)); },
  fanfare() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.2, 'triangle', 0.12)); },
  tick() { tone(1200, 0, 0.03, 'square', 0.03); },
};

export function confetti(amount = 120) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.appendChild(canvas);
  const c = canvas.getContext('2d');
  const W = (canvas.width = window.innerWidth);
  const H = (canvas.height = window.innerHeight);
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c'];
  const bits = Array.from({ length: amount }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 4,
    spin: Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frame = 0;
  (function draw() {
    c.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.4;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.spin += 0.2;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.spin);
      c.fillStyle = b.color;
      c.fillRect(-b.r / 2, -b.r / 4, b.r, b.r / 2);
      c.restore();
    }
    if (++frame < 150) requestAnimationFrame(draw);
    else canvas.remove();
  })();
}
