// The Reporting tab (switch `reporting`, off unless a review sets it to true): the outputs ticked on the set-up page,
// review.json `reporting.outputs`, each as a card (PR 3, 13 October 2026). The numbers come from report.js, from the
// same functions the Project page and the Agreement tab use. Exports and the feed are downloads in this browser;
// nothing is written to the repo.
import { S, docEvents } from './data.js';
import { h, pct } from './ui.js';
import { OUTPUTS } from './setuprules.js';
import { prisma, prismaNow, reconciled } from './project.js';
import { collectPairs } from './agreement.js';
import { screenPairs } from './screen.js';
import { alphaNominal, cohenKappa } from './stats.js';
import { themeConfig } from './themes.js';
import { screeningFlow, csv, screeningRows, codingRows, agreementRows, feed } from './report.js';

const fmt = (x) => (x == null ? 'n/a' : x.toFixed(2));

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function screeningEvents() {
  return (S.records || []).flatMap((r) => docEvents(r.id).filter((e) => e.type === 'screen-decision'));
}

/** Coding and screening agreement, as the Agreement tab computes them, in the feed's shape. */
export function figures() {
  const theme = (themeConfig(S.review) || {}).frame;
  const coding = {}, pairsBy = {};
  for (const fr of Object.values(S.frames).filter((f) => f.id !== theme && S.samples.some((s) => s.frame === f.id))) {
    const pairs = collectPairs(fr);
    pairsBy[fr.id] = pairs;
    coding[fr.id] = {};
    for (const f of fr.fields) {
      const r = alphaNominal(pairs.filter((p) => p.field === f.id).map((p) => [p.a, p.b]));
      if (r.n) coding[fr.id][f.id] = { n: r.n, agreement: r.agreement, alpha: r.alpha };
    }
  }
  const screening = {};
  const sc = S.review.screening;
  if (sc && sc.enabled && S.records && S.firstScreen && Object.keys(S.firstScreen.records || {}).length) {
    const all = screenPairs();
    for (const c of [...new Set(all.map((p) => p.coder))]) {
      const dec = all.filter((p) => p.coder === c && p.decision && p.decision !== 'discuss');
      const k = cohenKappa(dec.map((p) => [p.first, p.decision]));
      if (k.n) screening[c] = { n: k.n, agreement: k.agreement, kappa: k.kappa };
    }
  }
  return { coding, screening, pairsBy };
}

export function renderReporting(root) {
  const rp = S.review.reporting || {};
  const ticked = OUTPUTS.filter(([k]) => (rp.outputs || []).includes(k));
  const page = (body) => root.replaceChildren(h('div', { class: 'page', id: 'reporting' }, h('div', { class: 'ph' }, h('h1', { text: 'Reporting' }),
    h('div', { class: 'muted', text: 'The outputs ticked on the set-up page. Downloads stay in this browser; nothing is written to the repo.' })), body));
  if (!ticked.length) { page(h('p', { class: 'muted', text: 'No outputs are ticked for this project. The PI picks them on the set-up page.' })); return; }
  if (!S.ready) { page(h('p', { class: 'muted', text: `Loading ${S.loading.done} of ${S.loading.total} files` })); return; }
  const sc = S.review.screening;
  const screeningOn = !!(sc && sc.enabled && S.records);
  const fig = figures();
  const rec = reconciled();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = (what, ext) => `${S.review.id || 'review'}-${what}-${stamp}.${ext}`;
  const none = (text) => h('p', { class: 'muted', text });
  const cards = {
    prisma: () => [h('h2', { text: 'PRISMA 2020 flow' }),
      h('p', { class: 'muted small', text: { hand: 'Counts entered by hand.', screening: 'Full-text counts from Screening, reconciled records only.', both: 'Earlier stages entered by hand; full-text counts from Screening, reconciled records only.' }[(S.review.prisma || {}).source || 'hand'] }),
      prisma()],
    screening_flow: () => {
      if (!screeningOn) return [h('h2', { text: 'Screening flow' }), none('Screening is not switched on for this project.')];
      const fl = screeningFlow({ records: S.records, first: (S.firstScreen || {}).records || {}, events: screeningEvents(), blind: !!sc.blind, rec: rec || [] });
      return [h('h2', { text: 'Screening flow' }),
        h('p', { id: 'flow-summary', text: `${fl.records} records at full text: ${fl.reconciled} reconciled, ${fl.agreed} excluded by agreement, ${fl.awaiting} awaiting reconciliation.` }),
        fl.screeners.length ? h('table', { class: 't', id: 'flow-table' }, h('thead', null, h('tr', null, ['Screener', 'Decided', 'Same as first screen', 'Differ', 'Discuss', sc.blind ? 'Changed after the first screen was shown' : 'Changed'].map((x) => h('th', { text: x })))),
          h('tbody', null, fl.screeners.map((s) => h('tr', null, h('td', { text: s.coder }), ...[s.decided, s.same, s.differ, s.discuss, s.changed].map((n) => h('td', { class: 'mono', text: n })))))) : none('No screening decisions yet.')];
    },
    agreement: () => {
      const rows = Object.entries(fig.coding).flatMap(([fr, fields]) => Object.entries(fields).map(([f, r]) => ['Coding', (S.frames[fr] || {}).name || fr, ((S.frames[fr] || { fields: [] }).fields.find((x) => x.id === f) || {}).label || f, r.n, pct(Math.round(r.agreement * r.n), r.n), `alpha ${fmt(r.alpha)}`]))
        .concat(Object.entries(fig.screening).map(([c, r]) => ['Screening', c, 'Include or exclude', r.n, pct(Math.round(r.agreement * r.n), r.n), `kappa ${fmt(r.kappa)}`]));
      return [h('h2', { text: 'Agreement tables' }),
        rows.length ? h('table', { class: 't', id: 'agreement-table' }, h('thead', null, h('tr', null, ['', 'Frame or screener', 'Field', 'Checks', 'Agreement', 'Statistic'].map((x) => h('th', { text: x })))),
          h('tbody', null, rows.map((r) => h('tr', null, r.map((x, i) => h('td', { class: i >= 3 ? 'mono' : '', text: x })))))) : none('No finished checks or screening decisions yet.'),
        h('p', null, h('a', { href: '#/agreement', text: 'Disagreements and detail on the Agreement tab' }))];
    },
    exports: () => [h('h2', { text: 'Exports' }), h('p', { class: 'muted small', text: 'CSV files that open in Excel or R. One row per record and screener, per checked field, or per figure.' }),
      h('div', { class: 'row' },
        screeningOn ? h('button', { type: 'button', class: 'btn', id: 'dl-screening', text: 'Screening decisions', onclick: () => download(name('screening', 'csv'), csv(screeningRows({ records: S.records, first: (S.firstScreen || {}).records || {}, events: screeningEvents() })), 'text/csv;charset=utf-8') }) : null,
        h('button', { type: 'button', class: 'btn', id: 'dl-coding', text: 'Coding checks', onclick: () => download(name('coding', 'csv'), csv(codingRows(fig.pairsBy)), 'text/csv;charset=utf-8') }),
        h('button', { type: 'button', class: 'btn', id: 'dl-agreement', text: 'Agreement summary', onclick: () => download(name('agreement', 'csv'), csv(agreementRows(fig)), 'text/csv;charset=utf-8') }))],
    dashboard: () => [h('h2', { text: 'Dashboard feed' }),
      h('p', { class: 'muted small', text: rp.dashboard ? `Target: ${rp.dashboard}. Sending it there is not built yet; download the feed and place it by hand.` : 'No target is set. Download the feed and place it by hand.' }),
      h('button', { type: 'button', class: 'btn', id: 'dl-feed', text: 'Download the feed (JSON)', onclick: () => download(name('feed', 'json'),
        JSON.stringify(feed({ review: S.review, prisma: prismaNow(), coding: fig.coding, screening: fig.screening, generated: new Date().toISOString() }), null, 1), 'application/json') })],
  };
  page(h('div', { class: 'grid2' }, ticked.map(([k]) => h('section', { class: 'card' + (k === 'prisma' ? ' wide' : ''), 'data-output': k }, cards[k]()))));
}
