// The set-up page's rules, with no DOM: the five modules (docs/setup-page-design.md), the tick-box rules between
// them, and how the ticks map onto the switches the app already reads in review.json.
// The page is a form over those switches (PI, 13 October 2026). review.json stays what the app reads; setup.json
// records what was ticked (`modules`) for the team tools. Landing owns the `documents` switch (PI, 13 October 2026).
//   1 Landing      Project page cards (project.sections), documents, prisma.show, prisma.source
//   2 Screening    screen, screening.enabled, screening.blind (independent = blind)
//   3 Coding       code, verify (the Verify tab), document_view (its view by document), pdf, the two themes switches
//   4 Validation   agreement; the sample and the release gate go to setup.json only
//   5 Reporting    reporting (off unless set to true), review.json reporting.outputs and reporting.dashboard
import { feature } from './features.js';

export const MODULES = [
  ['landing', '1. Landing'], ['screening', '2. Full-text screening'], ['coding', '3. Coding and verification'],
  ['validation', '4. Cross-coder validation'], ['reporting', '5. Reporting'],
];
export const PROJECT_SECTIONS = ['protocol', 'questions', 'progress', 'team', 'links', 'queries', 'prisma', 'milestones', 'layers'];
export const SECTION_LABELS = { protocol: 'Protocol', questions: 'Research questions', progress: 'Progress', team: 'Team', links: 'Key links',
  queries: 'Queries for the PI', prisma: 'PRISMA flow', milestones: 'Milestones', layers: 'Layers' };
/** The Project page with Landing unticked: who is on the team and the key links, nothing else. */
export const BARE_SECTIONS = ['team', 'links'];
export const PRISMA_BOXES = ['identified', 'screened', 'sought', 'assessed', 'included'];
export const OUTPUTS = [['exports', 'Exports'], ['agreement', 'Agreement tables'], ['screening_flow', 'Screening flow'], ['prisma', 'PRISMA'], ['dashboard', 'Dashboard feed']];
export const ROLES = ['screener', 'coder', 'both'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => JSON.parse(JSON.stringify(x));

/** The cards the Project page shows for this review today (project.js renderProject). */
export function effectiveSections(review) {
  const r = review || {};
  return r.project && Array.isArray(r.project.sections) ? r.project.sections.slice() : PROJECT_SECTIONS.filter((k) => k !== 'protocol' || r.protocol);
}

/** The PRISMA boxes shown today: prisma.show, or all five (with the exclusion box) when it is not set. */
export function effectivePrisma(review) {
  const p = (review && review.prisma) || {};
  return Array.isArray(p.show) ? p.show.filter((k) => PRISMA_BOXES.includes(k)) : PRISMA_BOXES.slice();
}

/** A new project's ticks: Landing only, with the protocol, questions, team, PRISMA and document cards. */
export function blankModules() {
  return {
    landing: { on: true, sections: ['protocol', 'questions', 'team', 'links', 'prisma'], documents: true, prisma_boxes: PRISMA_BOXES.slice(), prisma_source: 'hand' },
    screening: { on: false, mode: 'independent', reasons: [] },
    coding: { on: false, view: 'segment', code: false, pdf: true, themes_by_document: false, themes_by_code: false, frames: [], corpus: 'register' },
    validation: { on: false, sample: { kind: 'share', fraction: 0.15, strata_by: '' }, gate: 'open' },
    reporting: { on: false, outputs: [], dashboard: '' },
  };
}

/**
 * The ticks for a review, from setup.json `modules` where it has them, else worked out from review.json, so a
 * project set up by hand (the grey literature review, cogimp-team) opens with what it has today.
 */
export function fromReview(review, setup) {
  const r = review || {}, m = blankModules();
  const sections = effectiveSections(r);
  m.landing = { on: !sections.every((k) => BARE_SECTIONS.includes(k)), sections, documents: feature('documents', r),
    prisma_boxes: effectivePrisma(r), prisma_source: (r.prisma && r.prisma.source) || 'hand' };
  const sc = r.screening || {};
  m.screening = { on: !!(sc.enabled && feature('screen', r)), mode: sc.blind === false ? 'sighted' : 'independent',
    reasons: (sc.reasons || []).map((x) => (typeof x === 'string' ? x : x.text)) };
  const verify = feature('verify', r), byDoc = feature('document_view', r);
  const tbd = !!(r.features && r.features.themes_by_document === true), tbc = !!(r.features && r.features.themes_by_code === true);
  m.coding = { on: feature('code', r) || verify || byDoc || tbd || tbc, view: verify && byDoc ? 'both' : byDoc && !verify ? 'document' : 'segment',
    code: feature('code', r), pdf: feature('pdf', r), themes_by_document: tbd, themes_by_code: tbc, frames: (r.frames || []).slice(), corpus: 'register' };
  m.validation = { on: feature('agreement', r), sample: { kind: 'share', fraction: (r.sampling && r.sampling.fraction) || 0.15, strata_by: '' }, gate: 'open' };
  const rp = r.reporting || {};
  m.reporting = { on: feature('reporting', r), outputs: (rp.outputs || []).slice(), dashboard: rp.dashboard || '' };
  const saved = setup && setup.modules;
  if (saved) for (const [k] of MODULES) if (saved[k]) m[k] = { ...m[k], ...clone(saved[k]) };
  return rules(m);
}

/** Which options the page offers for these ticks. */
export function offered(m) {
  return {
    reporting: m.screening.on || m.coding.on || m.validation.on,
    agreementOutput: m.validation.on,
    screeningFlowOutput: m.screening.on,
    prismaFromScreening: m.screening.on,
    gate: m.screening.on && m.validation.on,
    documentLinks: m.landing.on && m.landing.documents,
  };
}

/**
 * The tick-box rules (design, "Dependencies as set-up page rules"). `changed` names the module just ticked or
 * unticked, so ticking Validation ticks Coding and unticking Coding unticks Validation. Returns a new object.
 */
export function rules(m0, changed) {
  const m = clone(m0);
  if (changed === 'validation' && m.validation.on) m.coding.on = true;
  if (changed === 'coding' && !m.coding.on) m.validation.on = false;
  if (m.validation.on) m.coding.on = true;
  const o = offered(m);
  if (!o.reporting) m.reporting.on = false;
  if (!o.agreementOutput) m.reporting.outputs = m.reporting.outputs.filter((x) => x !== 'agreement');
  if (!o.screeningFlowOutput) m.reporting.outputs = m.reporting.outputs.filter((x) => x !== 'screening_flow');
  if (!m.reporting.outputs.includes('dashboard')) m.reporting.dashboard = '';
  if (!o.prismaFromScreening && m.landing.prisma_source !== 'hand') m.landing.prisma_source = 'hand';
  if (!o.gate) m.validation.gate = 'open';
  m.coding.corpus = m.screening.on ? 'screening-includes' : 'register';
  if (!m.landing.on) m.landing.documents = false;
  return m;
}

/** What one rule means, in words, for the page. */
export const corpusLine = (m) => (m.coding.corpus === 'screening-includes' ? 'The coding corpus is the screening includes.' : 'The coding corpus is the whole document register.');

/** The value each switch should take for these ticks. Themes switches only when the review has a themes block. */
export function switches(m, review) {
  const c = m.coding.on ? m.coding : null;
  const out = {
    screen: m.screening.on,
    documents: m.landing.on && !!m.landing.documents,
    code: !!(c && c.code),
    // Verify always has the view by thematic segment; document_view adds the view by document inside it. So
    // "by document" and "both" set the same switches; the choice is kept in setup.json modules.coding.view.
    verify: !!c,
    document_view: !!(c && (c.view === 'document' || c.view === 'both')),
    agreement: m.validation.on,
    reporting: m.reporting.on,
  };
  if (c) out.pdf = !!c.pdf; // the Open PDF button is in Verify only, so with Coding off the switch is left as it is
  if (review && review.themes && review.themes.frame) {
    out.themes_by_document = !!(c && c.themes_by_document);
    out.themes_by_code = !!(c && c.themes_by_code);
  }
  return out;
}

/**
 * review.json with these ticks applied. Only what differs from what the app shows today is written, so ticks
 * that match the review change nothing, and a switch left out stays left out. Every other key is kept as it is.
 */
export function toReview(m, review) {
  const r = clone(review || {});
  const want = switches(m, r);
  // the Screen tab of a review with no screening block only says screening is off, so it counts as off already
  const now = (k) => (k === 'screen' ? feature('screen', r) && !!(r.screening && r.screening.enabled) : feature(k, r));
  for (const [k, v] of Object.entries(want)) {
    if (now(k) === v) continue;
    r.features = r.features || {};
    r.features[k] = v;
  }
  const sections = m.landing.on ? m.landing.sections.filter((k) => PROJECT_SECTIONS.includes(k)) : BARE_SECTIONS.slice();
  if (!same(sections, effectiveSections(r))) r.project = { ...(r.project || {}), sections };
  if (m.landing.on) {
    const boxes = PRISMA_BOXES.filter((k) => m.landing.prisma_boxes.includes(k));
    if (!same(boxes, effectivePrisma(r))) {
      r.prisma = { ...(r.prisma || {}) };
      if (same(boxes, PRISMA_BOXES)) delete r.prisma.show; else r.prisma.show = boxes;
    }
    if ((r.prisma && r.prisma.source || 'hand') !== m.landing.prisma_source) r.prisma = { ...(r.prisma || {}), source: m.landing.prisma_source };
  }
  if (m.screening.on || r.screening) {
    const sc = r.screening ? { ...r.screening } : { enabled: true, stage: 'full-text', blind: true, records: 'screening/records.json', criteria: [], judgements: ['Met', 'Not met', 'Unclear'], reasons: [] };
    if (!!sc.enabled !== m.screening.on) sc.enabled = m.screening.on;
    const blind = m.screening.mode !== 'sighted';
    if (m.screening.on && !!sc.blind !== blind) sc.blind = blind;
    if (m.screening.on) {
      // a reason already in review.json keeps its criterion; a new line is a plain reason
      const old = sc.reasons || [];
      const reasons = m.screening.reasons.map((t) => t.trim()).filter(Boolean).map((t) => old.find((x) => (typeof x === 'string' ? x : x.text) === t) || t);
      if (!same(reasons, old)) sc.reasons = reasons;
    }
    if (!same(sc, r.screening)) r.screening = sc;
  }
  if (m.reporting.on) {
    const rp = { outputs: OUTPUTS.map(([k]) => k).filter((k) => m.reporting.outputs.includes(k)) };
    if (m.reporting.dashboard) rp.dashboard = m.reporting.dashboard;
    if (!same(rp, { outputs: (r.reporting || {}).outputs || [], ...((r.reporting || {}).dashboard ? { dashboard: r.reporting.dashboard } : {}) })) r.reporting = { ...(r.reporting || {}), ...rp };
  }
  return r;
}

/** Is this handle the project's PI? review.json team role "PI", or setup.json coder role "pi". */
export function isPI(handle, review, setup) {
  const me = String(handle || '').toLowerCase();
  if (!me) return false;
  return ((review && review.team) || []).some((t) => String(t.handle || '').toLowerCase() === me && /^pi$/i.test(t.role || ''))
    || ((setup && setup.coders) || []).some((c) => c.handle.toLowerCase() === me && c.role === 'pi');
}

/** The team as the page edits it, [{handle, name, role}], from setup.json coders, else review.json team. */
export function teamOf(review, setup) {
  if (setup && Array.isArray(setup.coders) && setup.coders.length) {
    const out = setup.coders.map((c) => ({ handle: c.handle, name: c.name || c.handle, role: c.role === 'pi' ? 'pi' : ROLES.includes(c.role) ? c.role : 'coder', saved: true }));
    for (const t of (review && review.team) || []) if (t.handle && !out.some((x) => x.handle.toLowerCase() === t.handle.toLowerCase())) out.push({ handle: t.handle, name: t.name || t.handle, role: roleFromLabel(t.role), saved: true });
    return out;
  }
  return ((review && review.team) || []).filter((t) => t.handle).map((t) => ({ handle: t.handle, name: t.name || t.handle, role: roleFromLabel(t.role), saved: true }));
}

/** review.json team roles are free text ("PI", "Second reviewer", "Coder"); the page reads them as one of four. */
export function roleFromLabel(label) {
  const l = String(label || '').toLowerCase();
  if (/^pi$/.test(l)) return 'pi';
  if (/screen|review/.test(l) && /cod/.test(l)) return 'both';
  if (/screen|review/.test(l)) return 'screener';
  return 'coder';
}

/** A team member's problem, or null. The never list is refused everywhere (setup.json, format 3). */
export function memberProblem(handle, setup, team) {
  if (!handle || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(handle)) return `Not a GitHub handle: ${handle || '(blank)'}`;
  const n = ((setup && setup.never) || []).find((x) => x.handle.toLowerCase() === handle.toLowerCase());
  if (n) return `${handle} may not be added to this project: ${n.reason}`;
  if ((team || []).filter((t) => t.handle.toLowerCase() === handle.toLowerCase()).length > 1) return `${handle} is on the team twice`;
  return null;
}

/**
 * setup.json with these ticks and this team. A new file starts at format 3. Existing coders keep their entries;
 * a new person is added with their role and, if they code, the project's default task and their own team repo.
 * `team` is [{handle, name, role}] with role pi, screener, coder or both.
 */
export function toSetup(m, setup, { repo, id, title, team, date }) {
  const s = setup ? clone(setup) : { format: 3, project: id, title, repos: { master: repo, team: `${repo.split('/')[0]}/${id}-team-<handle>` },
    tasks: {}, coders: [], never: [], blind: { where: 'team', on_screen: 'until-all-submit' } };
  if (title && s.title !== undefined && s.title !== title) s.title = title;
  if (!setup && m.coding.frames.length) for (const f of m.coding.frames) s.tasks[f] = f;
  const task = (s.team_repo && s.team_repo.task) || Object.keys(s.tasks || {})[0];
  const codes = (role) => role === 'coder' || role === 'both' || role === 'pi';
  for (const t of team) {
    const have = s.coders.find((c) => c.handle.toLowerCase() === t.handle.toLowerCase());
    if (have) { if (t.role !== have.role && !(have.role === 'pi' || t.role === 'pi')) have.role = t.role; continue; }
    // someone already on the review.json team but not on the coder list stays off it: a coder is added only on the
    // PI's say-so, so only a person added on this page joins an existing list. A new list starts with the whole
    // team; only people added on the page take the default task.
    if (setup && t.saved) continue;
    const entry = { handle: t.handle, name: t.name || t.handle, role: t.role, tasks: !t.saved && codes(t.role) && task ? [task] : [], repo: t.role === 'pi' ? 'master' : String(s.repos.team || '').replace('<handle>', t.handle), added: date };
    s.coders.push(entry);
  }
  s.modules = clone(m);
  return s;
}

/** The team in review.json: everyone already there stays; a new person is added with a role label. */
export function toTeam(reviewTeam, team) {
  const out = clone(reviewTeam || []);
  const label = { pi: 'PI', screener: 'Screener', coder: 'Coder', both: 'Screener and coder' };
  for (const t of team) if (!out.some((x) => x.handle && x.handle.toLowerCase() === t.handle.toLowerCase())) out.push({ handle: t.handle, name: t.name || t.handle, role: label[t.role] || t.role });
  return out;
}

/** Every value that differs between two JSON objects, as [path, before, after]; for the list shown before Save. */
export function changes(a, b, path = '') {
  if (same(a, b)) return [];
  const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  // a block added or removed whole is listed value by value too, so the list stays one short line per value
  if (a === undefined && obj(b)) a = {};
  if (b === undefined && obj(a)) b = {};
  if (!obj(a) || !obj(b)) return [[path || '(file)', a, b]];
  const out = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) out.push(...changes(a[k], b[k], path ? `${path}.${k}` : k));
  return out;
}
