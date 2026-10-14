// Reporting, with no app state: PRISMA counted from screening, the screening flow, CSV exports and the dashboard
// feed (PR 3, 13 October 2026). Every function takes its data as arguments, so each is unit tested
// (tests/report.test.mjs); app/js/reporting.js and project.js call them with the loaded review.
//
// A record's decision counts for PRISMA only once it is reconciled (PI, 13 October 2026): the PI's final decision
// (a later PI screen-decision, else the first screen) matches every screener's final decision. This is the rule the
// release gate in tools/team/build_team_repo.py uses. A record not yet reconciled is "awaiting reconciliation" and
// stays out of the excluded and included boxes. A record excluded by agreement (screening.agreed) counts as excluded.
// A project with a single screener (the PI alone) counts the PI's decision as reconciled (PI, 14 October 2026).

const cmpT = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id < b.id ? -1 : 1);
const firstReasonOf = (f) => (f && f.protocol_reason && f.protocol_reason.text) || (f && f.reason) || null;

/** Each coder's screen decisions on each record: {record: {coder: {first, last}}}. */
export function decisionsByRecord(events) {
  const out = {};
  for (const e of events.filter((x) => x.type === 'screen-decision').sort(cmpT)) {
    const r = (out[e.record] = out[e.record] || {});
    const c = (r[e.coder] = r[e.coder] || { first: e, last: e });
    c.last = e;
  }
  return out;
}

/**
 * The reconciled decision of every record, or why it is not reconciled yet.
 * records: [{id}]; first: first-screen records {id: {decision, reason, protocol_reason}}; events: screening events of
 * every coder; pi: the PI's handle; screeners: handles expected to screen besides the PI (anyone else who decided is
 * added); agreed: {id: {decision, reason}} excluded by agreement.
 * Returns [{id, status: 'agreed' | 'reconciled' | 'awaiting', decision, reason}].
 */
export function reconcile({ records, first = {}, events = [], pi, screeners = [], agreed = {} }) {
  const by = decisionsByRecord(events);
  const others = new Set(screeners.filter((h) => h !== pi));
  for (const r of Object.values(by)) for (const c of Object.keys(r)) if (c !== pi) others.add(c);
  return records.map((rec) => {
    const id = rec.id;
    if (agreed[id]) return { id, status: 'agreed', decision: agreed[id].decision || 'exclude', reason: agreed[id].reason || 'Excluded by agreement' };
    const mine = by[id] && by[id][pi];
    const f = first[id];
    const decision = mine ? mine.last.decision : f && f.decision;
    const reason = mine ? mine.last.reason || null : firstReasonOf(f);
    const finals = [...others].map((c) => by[id] && by[id][c] && by[id][c].last.decision);
    const ok = decision && decision !== 'discuss' && finals.every((d) => d === decision);
    return { id, status: ok ? 'reconciled' : 'awaiting', decision: ok ? decision : null, reason: ok && decision === 'exclude' ? reason : null };
  });
}

/**
 * The PRISMA boxes for review.json prisma.source. hand (or unset): prisma as entered. screening: the full-text
 * boxes from reconciled decisions. both: the boxes up to "sought" as entered, the full-text boxes from screening.
 * The result has prisma's shape, with `awaiting` (records not reconciled yet) when screening counts.
 */
export function prismaCounts(prisma, rec) {
  const p = prisma || {};
  const source = p.source || 'hand';
  if (source === 'hand' || !rec) return p;
  const done = rec.filter((r) => r.status !== 'awaiting');
  const reasons = new Map();
  for (const r of done) if (r.decision === 'exclude') reasons.set(r.reason || 'No reason recorded', (reasons.get(r.reason || 'No reason recorded') || 0) + 1);
  const full = { assessed: rec.length, excluded: [...reasons].map(([reason, n]) => ({ reason, n })), included: done.filter((r) => r.decision === 'include').length,
                 awaiting: rec.length - done.length };
  const early = source === 'both' ? { identified: p.identified ?? null, screened: p.screened ?? null, sought: p.sought ?? null } : { identified: null, screened: null, sought: null };
  const out = { ...early, ...full, source };
  if (p.show) out.show = p.show;
  if (p.labels) out.labels = p.labels;
  return out;
}

/**
 * The screening flow: for each screener, how many records they decided, how many match the first screen (on the
 * decision used for agreement: the blinded first decision, else the latest), how many differ, how many went to
 * discussion and how many changed after the first screen was shown; for the project, reconciled and awaiting.
 */
export function screeningFlow({ records, first = {}, events = [], blind = true, rec = [] }) {
  const by = decisionsByRecord(events);
  const coders = [...new Set(Object.values(by).flatMap((r) => Object.keys(r)))].sort();
  const per = coders.map((c) => {
    let decided = 0, same = 0, differ = 0, discuss = 0, changed = 0;
    for (const { id } of records) {
      const d = by[id] && by[id][c];
      if (!d) continue;
      decided++;
      const used = blind ? d.first : d.last;
      if (used.decision === 'discuss') discuss++;
      else if (first[id] && first[id].decision) (used.decision === first[id].decision ? same++ : differ++);
      if (d.first !== d.last && (d.first.decision !== d.last.decision || d.first.reason !== d.last.reason)) changed++;
    }
    return { coder: c, decided, same, differ, discuss, changed };
  });
  const count = (s) => rec.filter((r) => r.status === s).length;
  return { records: records.length, screeners: per, reconciled: count('reconciled'), agreed: count('agreed'), awaiting: count('awaiting') };
}

/** CSV text from rows (the first row is the header): quoted where needed, CRLF lines, a byte-order mark for Excel. */
export function csv(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Screening decisions: one row per record and screener. */
export function screeningRows({ records, first = {}, events = [] }) {
  const by = decisionsByRecord(events);
  const rows = [['record', 'screener', 'blinded_decision', 'blinded_reason', 'final_decision', 'final_reason', 'first_screen_decision', 'first_screen_reason']];
  for (const { id } of records) {
    for (const [c, d] of Object.entries(by[id] || {}).sort()) {
      rows.push([id, c, d.first.decision, d.first.reason || '', d.last.decision, d.last.reason || '', (first[id] || {}).decision || '', firstReasonOf(first[id]) || '']);
    }
  }
  return rows;
}

/** Coding checks: one row per thematic segment, field and verifier, from agreement.js collectPairs (per frame). */
export function codingRows(byFrame) {
  const rows = [['frame', 'document', 'unit', 'field', 'verifier', 'first_code', 'action', 'verifier_code']];
  for (const [frame, pairs] of Object.entries(byFrame)) for (const p of pairs) rows.push([frame, p.doc, p.unit, p.field, p.coder, p.a ?? '', p.action, p.b ?? '']);
  return rows;
}

/** Agreement summary rows from the figures feed() holds. */
export function agreementRows(fd) {
  const rows = [['kind', 'frame_or_screener', 'field', 'n', 'agreement', 'statistic', 'value']];
  for (const [frame, fields] of Object.entries(fd.coding || {})) for (const [f, r] of Object.entries(fields)) rows.push(['coding', frame, f, r.n, r.agreement ?? '', "Krippendorff's alpha", r.alpha ?? '']);
  for (const [c, r] of Object.entries(fd.screening || {})) rows.push(['screening', c, 'decision', r.n, r.agreement ?? '', "Cohen's kappa", r.kappa ?? '']);
  return rows;
}

/**
 * The dashboard feed: one JSON object a dashboard can read. coding: {frame: {field: {n, agreement, alpha}}};
 * screening: {screener handle: {n, agreement, kappa}}; prisma: the boxes as reported. No record text and no notes.
 */
export function feed({ review, prisma, coding = {}, screening = {}, generated }) {
  return { schema: 1, review: review.id, title: review.title, generated, prisma, coding, screening };
}
