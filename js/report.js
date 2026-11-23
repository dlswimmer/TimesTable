// The report page. Two ways in:
//   report.html            -> this device's own progress (parents)
//   report.html?r=CODE     -> a read-only teacher snapshot from the cloud

import { load } from './storage.js';
import { buildSnapshot, analyze, summaryText } from './report-data.js';
import { cleanCode, fetchReport, REPORT_CODE_LENGTH, syncConfigured } from './sync.js';

const root = document.getElementById('report');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fact = (k) => { const [a, b] = k.split('x').map(Number); return `${a} × ${b} = ${a * b}`; };
const MODE = { practice: 'Practice', blitz: 'Beat the Clock', fix: 'Fix Mistakes', daily: 'Daily Challenge', focus: 'Focus Tables', boss: 'Boss Battle' };

function tile(value, label, sub = '') {
  return `<div class="tile"><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

function trend(cur, prev, lowerIsBetter = false, unit = '') {
  if (cur == null || prev == null || cur === prev) return '';
  const better = lowerIsBetter ? cur < prev : cur > prev;
  const diff = Math.round(Math.abs(cur - prev) * 10) / 10;
  return `<span class="${better ? 'up' : 'down'}">${cur > prev ? '▲' : '▼'} ${diff}${unit} vs last week</span>`;
}

function render(snap, { teacher }) {
  const r = analyze(snap);
  document.title = `${r.name}'s Times Table Report`;
  const date = new Date(r.generatedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const maxWeek = Math.max(1, ...r.weeks.map((w) => w.rounds));
  const maxCal = Math.max(1, ...r.calendar.map((d) => d.rounds));

  let grid = '<i class="h">×</i>' + [...Array(12)].map((_, i) => `<i class="h">${i + 1}</i>`).join('');
  for (let a = 1; a <= 12; a++) {
    grid += `<i class="h">${a}</i>`;
    for (let b = 1; b <= 12; b++) {
      const s = snap.facts[a <= b ? `${a}x${b}` : `${b}x${a}`];
      const cls = !s || s.box < 0 ? 'new' : s.box >= 4 ? 'master' : s.box === 0 ? 'miss' : 'learning';
      grid += `<i class="${cls}" title="${a} × ${b}${s ? `: right ${s.right}, missed ${s.wrong}${s.avg ? `, ${s.avg}s` : ''}` : ''}">${a * b}</i>`;
    }
  }

  root.innerHTML = `
    <header class="top">
      <div>
        <h1>${esc(r.name)}'s Times Table Report</h1>
        <p class="meta">${teacher ? 'Shared read-only report' : 'From this device'} · updated ${date}</p>
      </div>
      <div class="actions">
        ${teacher ? '' : '<a class="btn ghost" href="./">← Back to game</a>'}
        <button class="btn" id="copy">📋 Copy summary</button>
        <button class="btn primary" id="print">🖨️ Print / PDF</button>
      </div>
    </header>

    <section class="tiles">
      ${tile(`${r.mastered}<em>/${r.totalFacts}</em>`, 'facts mastered', r.masteredTables.length ? `all of ×${r.masteredTables.join(', ×')}` : 'up to 12 × 12')}
      ${tile(r.week.accuracy != null ? `${r.week.accuracy}%` : '–', 'right this week', trend(r.week.accuracy, r.lastWeek.accuracy, false, '%'))}
      ${tile(r.week.secs != null ? `${r.week.secs}s` : '–', 'per answer this week', trend(r.week.secs, r.lastWeek.secs, true, 's'))}
      ${tile(`${r.month.days}<em>/28</em>`, 'days practiced', 'last 4 weeks')}
      ${tile(r.rounds, 'rounds played', `${r.week.rounds} this week`)}
      ${tile(r.badges, 'badges earned', `${r.bosses}/12 bosses · ${r.dailyCount} daily challenges`)}
    </section>

    <div class="cols">
      <section class="card">
        <h2>Mastery by table</h2>
        <div class="tables">
          ${r.tables.map((t) => `
            <div class="trow">
              <span class="tname">×${t.table}</span>
              <span class="stack" title="${t.master} mastered, ${t.learning} learning, ${t.miss} just missed, ${t.new} not tried">
                ${['master', 'learning', 'miss', 'new'].map((c) => (t[c] ? `<span class="${c}" style="flex:${t[c]}"></span>` : '')).join('')}
              </span>
              <span class="tnum">${t.master}/12</span>
              <span class="tsub">${t.accuracy != null ? `${t.accuracy}%` : ''}${t.secs ? ` · ${t.secs}s` : ''}</span>
            </div>`).join('')}
        </div>
        <div class="legend"><span><i class="master"></i>Mastered</span><span><i class="learning"></i>Learning</span><span><i class="miss"></i>Just missed</span><span><i class="new"></i>Not tried</span></div>
      </section>

      <section class="card">
        <h2>Needs work</h2>
        ${r.stuck.length ? `<ul class="facts">${r.stuck.map((s) => `<li><b>${fact(s.key)}</b><span>missed ${s.wrong}×${s.avg ? ` · ${s.avg}s` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing stuck right now.</p>'}
        <h2>Slowest facts</h2>
        ${r.slowest.length ? `<ul class="facts">${r.slowest.map((s) => `<li><b>${fact(s.key)}</b><span>${s.avg}s average</span></li>`).join('')}</ul>` : '<p class="muted">Answer times show up after a few rounds.</p>'}
        <h2>Mastered in the last 2 weeks</h2>
        ${r.recentlyMastered.length ? `<p class="chips">${r.recentlyMastered.map((k) => `<span>${fact(k)}</span>`).join('')}</p>` : '<p class="muted">None yet.</p>'}
      </section>
    </div>

    <div class="cols">
      <section class="card">
        <h2>Week by week</h2>
        <table class="weeks">
          <thead><tr><th></th><th>Rounds</th><th>Days</th><th>Right</th><th>Speed</th></tr></thead>
          <tbody>${r.weeks.map((w) => `
            <tr><td>${w.label}</td>
              <td><span class="bar" style="width:${(w.rounds / maxWeek) * 60}px"></span>${w.rounds}</td>
              <td>${w.days}</td><td>${w.accuracy != null ? `${w.accuracy}%` : '–'}</td><td>${w.secs != null ? `${w.secs}s` : '–'}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Practice calendar</h2>
        <div class="cal">
          ${r.calendar.map((d) => `<i style="--a:${d.rounds ? 0.25 + 0.75 * (d.rounds / maxCal) : 0}" title="${d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.rounds} round${d.rounds === 1 ? '' : 's'}">${d.date.getDate()}</i>`).join('')}
        </div>
        <p class="muted">Last 4 weeks. Darker means more rounds that day.</p>
      </section>
    </div>

    <section class="card">
      <h2>Every fact up to 12 × 12</h2>
      <div class="grid">${grid}</div>
      <div class="legend"><span><i class="master"></i>Mastered</span><span><i class="learning"></i>Learning</span><span><i class="miss"></i>Just missed</span><span><i class="new"></i>Not tried</span></div>
    </section>

    <section class="card">
      <h2>Recent rounds</h2>
      ${r.recent.length ? `<table class="recent">
        <thead><tr><th>When</th><th>Activity</th><th>Score</th><th>Speed</th></tr></thead>
        <tbody>${r.recent.map((h) => `<tr>
          <td>${new Date(h.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
          <td>${MODE[h.mode] || h.mode} · ${esc(h.level || '')}</td>
          <td>${h.right}${h.mode === 'blitz' ? ' right' : ` / ${h.total}`}</td>
          <td>${h.secs ? `${h.secs}s` : '–'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No rounds yet.</p>'}
    </section>

    <footer class="foot">
      <p><b>How mastery works:</b> a fact is mastered after several right answers in a row, each fast enough to meet the speed goal. A miss sends it back to the start, and missed facts come up more often until they're solid. 3 × 7 and 7 × 3 count as the same fact.</p>
    </footer>`;

  document.getElementById('print').addEventListener('click', () => window.print());
  document.getElementById('copy').addEventListener('click', async (e) => {
    const text = summaryText(snap);
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = '✅ Copied';
    } catch {
      prompt('Copy this summary:', text);
    }
  });
}

function message(title, body) {
  root.innerHTML = `<section class="card msg"><h1>${title}</h1><p>${body}</p><p><a class="btn" href="./">Go to the game</a></p></section>`;
}

async function main() {
  const params = new URLSearchParams(location.search);
  if (params.has('r')) {
    const code = cleanCode(params.get('r'), REPORT_CODE_LENGTH);
    if (!code || !syncConfigured) return message('Report not found', 'This report link looks incomplete. Ask for the link again.');
    try {
      const snap = await fetchReport(code);
      if (!snap) return message('Report turned off', 'This shared report has been turned off by the family.');
      render(snap, { teacher: true });
    } catch (err) {
      console.warn(err);
      message('Couldn\'t load the report', 'Check the internet connection and try again.');
    }
    return;
  }
  const state = load();
  if (!Object.keys(state.facts || {}).length) {
    return message('No progress yet', 'Play a few rounds on this device (or link it to the family with cloud sync), then come back.');
  }
  render(buildSnapshot(state), { teacher: false });
}

main();
