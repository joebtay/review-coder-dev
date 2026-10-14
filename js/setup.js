// The set-up page (#/setup): the PI ticks the modules a project needs and picks their options
// (docs/setup-page-design.md). It is a form over the switches the app already reads. Save writes review.json
// (features, project.sections, prisma.show and prisma.source, screening, reporting, title, team) and setup.json
// (the ticks, in `modules`, and the team, for the team tools). Nothing is written before Save, Save first lists every
// value it will change, and every key the page does not own is kept as it is. It never touches a sample.
// A repo with no review.json opens here for the person signing in, who becomes the PI of the new project.
import { S } from './data.js';
import { h } from './ui.js';
import {
  MODULES, PROJECT_SECTIONS, SECTION_LABELS, PRISMA_BOXES, OUTPUTS, ROLES, blankModules, fromReview, rules, offered, corpusLine,
  toReview, toSetup, toTeam, teamOf, isPI, memberProblem, changes, switches,
} from './setuprules.js';

const PRISMA_LABELS = { identified: 'Records identified', screened: 'Records screened', sought: 'Reports sought', assessed: 'Reports assessed at full text', included: 'Included' };
const ROLE_LABELS = { pi: 'PI', screener: 'Screener', coder: 'Coder', both: 'Screener and coder' };
export const SU = { loaded: false };

const today = () => new Date().toISOString().slice(0, 10);
const parse = (f) => (f ? JSON.parse(f.text) : null);
const show = (v) => (v === undefined ? '(not set)' : JSON.stringify(v));

async function load(fresh) {
  const [rf, sf] = await Promise.all([fresh ? null : S.store.readFile('review.json'), S.store.readFile('setup.json')]);
  const review = parse(rf), setup = parse(sf);
  const id = S.store.repo.split('/').pop();
  Object.assign(SU, {
    loaded: true, fresh: !review, review, setup, reviewSha: rf && rf.sha, setupSha: sf && sf.sha, error: '', saved: '',
    m: review ? fromReview(review, setup) : rules(blankModules()),
    title: review ? review.title || '' : '', id: review ? review.id || id : id,
    team: review || setup ? teamOf(review, setup) : [{ handle: S.handle, name: S.handle, role: 'pi', saved: false }],
    add: { handle: '', name: '', role: 'coder', problem: '' },
  });
}

/** The review.json and setup.json Save would write, from the form as it stands. */
export function planned() {
  const base = SU.review || { schema: 1, id: SU.id, title: SU.title, questions: [], team: [], frames: [], layers: [], first_layer: null };
  const review = toReview(SU.m, base);
  if (!SU.review) review.features = { ...switches(SU.m, review), overview: false }; // a new project lists every switch
  if (SU.title && review.title !== SU.title) review.title = SU.title;
  const team = toTeam(base.team, SU.team);
  if (JSON.stringify(team) !== JSON.stringify(base.team)) review.team = team;
  const setup = toSetup(SU.m, SU.setup, { repo: S.store.repo, id: SU.id, title: SU.title, team: SU.team, date: today() });
  return { review, setup };
}

export async function renderSetup(root, { fresh = false } = {}) {
  if (!SU.loaded || SU.root !== root) {
    SU.root = root;
    root.replaceChildren(h('div', { class: 'page narrow' }, h('p', { class: 'muted', text: 'Opening the set-up' })));
    try { await load(fresh); } catch (e) { root.replaceChildren(h('div', { class: 'page narrow' }, h('h1', { text: 'Set-up' }), h('p', { class: 'warnline', text: `Could not read the set-up: ${e.message}` }))); return; }
  }
  paint();
}

function paint() {
  const root = SU.root;
  if (!SU.fresh && !isPI(S.handle, SU.review, SU.setup)) {
    root.replaceChildren(h('div', { class: 'page narrow', id: 'setup' }, h('h1', { text: 'Set-up' }),
      h('p', { class: 'muted', text: 'Only the PI changes the set-up of this project.' }), h('p', null, h('a', { href: '#/project', text: 'Back to the project' }))));
    return;
  }
  const y = window.scrollY;
  const m = SU.m, o = offered(m);
  const set = (fn, changed) => { fn(SU.m); SU.m = rules(SU.m, changed); SU.saved = ''; paint(); };
  const tick = (key) => (ev) => {
    const on = ev.target.checked;
    if (key === 'coding' && !on && SU.m.validation.on && !confirm('Validation needs Coding. Unticking Coding also unticks Validation.')) { ev.target.checked = true; return; }
    set((x) => { x[key].on = on; }, key);
  };
  const box = (label, checked, onchange, attrs = {}) => h('label', { class: 'opt' }, h('input', { type: 'checkbox', checked, onchange, ...attrs }), ' ', label);
  const radio = (name, value, cur, label, onchange, attrs = {}) => h('label', { class: 'opt' }, h('input', { type: 'radio', name, value, checked: cur === value, onchange, ...attrs }), ' ', label);
  const listToggle = (arr, k, on) => (on ? [...new Set([...arr, k])] : arr.filter((x) => x !== k));
  const ofRole = (...rs) => SU.team.filter((t) => rs.includes(t.role));
  const people = (list, none) => (list.length ? h('span', { text: list.map((t) => `${t.name} (@${t.handle})`).join(', ') }) : h('span', { class: 'muted', text: none }));

  const options = {
    landing: () => [
      h('div', { class: 'optgroup' }, h('b', { text: 'Project page cards' }),
        PROJECT_SECTIONS.map((k) => box(SECTION_LABELS[k], m.landing.sections.includes(k), (e) => set((x) => { x.landing.sections = PROJECT_SECTIONS.filter((s) => listToggle(x.landing.sections, k, e.target.checked).includes(s)); }), { 'data-section': k }))),
      h('div', { class: 'optgroup' }, box('Document index and an overview page for each document', m.landing.documents, (e) => set((x) => { x.landing.documents = e.target.checked; }), { id: 'opt-documents' }),
        o.documentLinks ? h('div', { class: 'muted small', text: 'Each item in Verify links to its document\'s overview page.' }) : null),
      h('div', { class: 'optgroup' }, h('b', { text: 'PRISMA boxes' }),
        PRISMA_BOXES.map((k) => box(PRISMA_LABELS[k], m.landing.prisma_boxes.includes(k), (e) => set((x) => { x.landing.prisma_boxes = PRISMA_BOXES.filter((s) => listToggle(x.landing.prisma_boxes, k, e.target.checked).includes(s)); }), { 'data-box': k })),
        h('div', { class: 'muted small', text: 'All five show the full PRISMA 2020 flow with the exclusion box.' })),
      h('div', { class: 'optgroup', id: 'prisma-source' }, h('b', { text: 'PRISMA counts' }),
        radio('psrc', 'hand', m.landing.prisma_source, 'Entered by hand', () => set((x) => { x.landing.prisma_source = 'hand'; })),
        o.prismaFromScreening ? [radio('psrc', 'screening', m.landing.prisma_source, 'From Screening', () => set((x) => { x.landing.prisma_source = 'screening'; })),
          radio('psrc', 'both', m.landing.prisma_source, 'Both: earlier stages by hand, full text from Screening', () => set((x) => { x.landing.prisma_source = 'both'; }))] : null),
    ],
    screening: () => [
      h('div', { class: 'optgroup' }, h('b', { text: 'Mode' }),
        radio('smode', 'independent', m.screening.mode, 'Independent: both screen blind, then reconcile', () => set((x) => { x.screening.mode = 'independent'; })),
        radio('smode', 'sighted', m.screening.mode, 'Sighted: the second reader sees the first screener\'s notes and agrees or disagrees point by point', () => set((x) => { x.screening.mode = 'sighted'; }))),
      h('div', { class: 'optgroup' }, h('b', { text: 'Screeners' }), ' ', people(ofRole('pi', 'screener', 'both'), 'None yet'), h('div', { class: 'muted small', text: 'Set each person\'s role under Team.' })),
      h('div', { class: 'optgroup' }, h('b', { text: 'Exclusion reasons' }), h('div', { class: 'muted small', text: 'One per line. They map to the PRISMA "reports excluded" box.' }),
        h('textarea', { id: 'reasons', rows: 5, onchange: (e) => set((x) => { x.screening.reasons = e.target.value.split('\n'); }) }, m.screening.reasons.join('\n'))),
    ],
    coding: () => [
      h('p', { class: 'muted small', id: 'corpus-line', text: corpusLine(m) }),
      h('div', { class: 'optgroup' }, h('b', { text: 'Frames' }), ' ', m.coding.frames.length ? h('span', { text: m.coding.frames.join(', ') }) : h('span', { class: 'muted', text: 'None yet. A frame is added with its frame file in the data repo.' })),
      h('div', { class: 'optgroup' }, h('b', { text: 'Verification view' }),
        radio('view', 'segment', m.coding.view, 'By thematic segment', () => set((x) => { x.coding.view = 'segment'; })),
        radio('view', 'document', m.coding.view, 'By document', () => set((x) => { x.coding.view = 'document'; })),
        radio('view', 'both', m.coding.view, 'Both', () => set((x) => { x.coding.view = 'both'; })),
        h('div', { class: 'muted small', text: 'Verify always keeps the view by thematic segment. By document adds the whole-document view beside it, so By document and Both switch on the same views.' })),
      h('div', { class: 'optgroup' },
        box('Open PDF button beside each item', m.coding.pdf, (e) => set((x) => { x.coding.pdf = e.target.checked; }), { id: 'opt-pdf' }),
        box('Code tab', m.coding.code, (e) => set((x) => { x.coding.code = e.target.checked; }), { id: 'opt-code' }),
        SU.review && SU.review.themes && SU.review.themes.frame ? [
          box('Themes, by document', m.coding.themes_by_document, (e) => set((x) => { x.coding.themes_by_document = e.target.checked; }), { id: 'opt-tbd' }),
          box('Themes, by theme', m.coding.themes_by_code, (e) => set((x) => { x.coding.themes_by_code = e.target.checked; }), { id: 'opt-tbc' })] : null),
      h('div', { class: 'optgroup' }, h('b', { text: 'Coders' }), ' ', people(ofRole('pi', 'coder', 'both'), 'None yet')),
    ],
    validation: () => [
      h('div', { class: 'optgroup' }, h('b', { text: 'Coders, one team repo each' }), ' ', people(ofRole('coder', 'both'), 'None yet. Add them under Team.'),
        h('div', { class: 'muted small', text: 'The PI codes in the master repo. No coder sees another coder\'s work.' })),
      h('div', { class: 'optgroup' }, h('b', { text: 'Sample' }),
        radio('skind', 'share', m.validation.sample.kind, 'A share of the corpus', () => set((x) => { x.validation.sample.kind = 'share'; })),
        radio('skind', 'whole', m.validation.sample.kind, 'The whole corpus', () => set((x) => { x.validation.sample.kind = 'whole'; })),
        m.validation.sample.kind === 'share' ? h('label', { class: 'opt' }, 'Share (%) ', h('input', { type: 'number', id: 'fraction', min: 1, max: 100, value: Math.round(m.validation.sample.fraction * 100),
          onchange: (e) => set((x) => { x.validation.sample.fraction = Math.min(100, Math.max(1, Number(e.target.value) || 15)) / 100; }) })) : null,
        h('label', { class: 'opt' }, 'Strata ', h('select', { id: 'strata', onchange: (e) => set((x) => { x.validation.sample.strata_by = e.target.value; }) },
          h('option', { value: '', text: 'None', selected: !m.validation.sample.strata_by }),
          strataFields().map((f) => h('option', { value: f, text: f, selected: m.validation.sample.strata_by === f })))),
        h('div', { class: 'muted small', text: 'The seed is the lock date; draw and lock happen on the same day. A locked sample never changes; top-ups are separate locked files.' })),
      o.gate ? h('div', { class: 'optgroup', id: 'gate' }, h('b', { text: 'Release gate' }),
        radio('gate', 'open', m.validation.gate, 'Open', () => set((x) => { x.validation.gate = 'open'; })),
        radio('gate', 'after-reconciliation', m.validation.gate, 'After Screening reconciliation', () => set((x) => { x.validation.gate = 'after-reconciliation'; }))) : null,
    ],
    reporting: () => [
      h('div', { class: 'optgroup' }, h('b', { text: 'Outputs' }),
        OUTPUTS.filter(([k]) => (k !== 'agreement' || o.agreementOutput) && (k !== 'screening_flow' || o.screeningFlowOutput))
          .map(([k, label]) => box(label, m.reporting.outputs.includes(k), (e) => set((x) => { x.reporting.outputs = listToggle(x.reporting.outputs, k, e.target.checked); }), { 'data-output': k })),
        o.agreementOutput ? null : h('div', { class: 'muted small', text: 'Agreement tables come with Validation.' })),
      m.reporting.outputs.includes('dashboard') ? h('label', { class: 'opt' }, 'Dashboard target ', h('input', { type: 'text', id: 'dashboard', value: m.reporting.dashboard, placeholder: 'owner/repo or address',
        onchange: (e) => set((x) => { x.reporting.dashboard = e.target.value.trim(); }) })) : null,
    ],
  };

  const card = ([k, label]) => {
    const disabled = k === 'reporting' && !o.reporting;
    return h('section', { class: 'card setupmod' + (m[k].on ? ' on' : ''), 'data-module': k },
      h('h2', null, h('label', null, h('input', { type: 'checkbox', checked: m[k].on, disabled, onchange: tick(k), 'data-tick': k }), ' ', label)),
      disabled ? h('p', { class: 'muted small', text: 'Tick Screening, Coding or Validation first.' }) : null,
      m[k].on ? h('div', { class: 'opts' }, options[k]()) : null);
  };

  const { review, setup } = planned();
  const rc = changes(SU.review || {}, review), sc = changes(SU.setup || {}, setup);
  const addRow = SU.add;
  root.replaceChildren(h('div', { class: 'page narrow', id: 'setup' },
    h('div', { class: 'ph' }, h('h1', { text: SU.fresh ? 'Set up a new project' : 'Set-up' }),
      h('div', { class: 'muted', text: 'Tick the modules this project needs. Ticking a module shows its options. Nothing is saved until you press Save.' })),
    h('section', { class: 'card' }, h('h2', { text: 'Project' }),
      h('label', { class: 'field' }, 'Title', h('input', { type: 'text', id: 'title', value: SU.title, onchange: (e) => { SU.title = e.target.value.trim(); paint(); } })),
      h('div', { class: 'field' }, h('span', { class: 'muted', text: 'Master repo ' }), h('span', { class: 'mono', id: 'master', text: S.store.repo })),
      h('table', { class: 't', id: 'team' }, h('thead', null, h('tr', null, ['GitHub handle', 'Name', 'Role', ''].map((x) => h('th', { text: x })))),
        h('tbody', null, SU.team.map((t, i) => h('tr', { 'data-handle': t.handle }, h('td', { class: 'mono', text: '@' + t.handle }), h('td', { text: t.name }),
          h('td', null, t.role === 'pi' ? 'PI' : h('select', { onchange: (e) => { t.role = e.target.value; paint(); } }, ROLES.map((r) => h('option', { value: r, text: ROLE_LABELS[r], selected: t.role === r })))),
          h('td', null, t.saved || t.role === 'pi' ? null : h('button', { type: 'button', class: 'btn small', onclick: () => { SU.team.splice(i, 1); paint(); }, text: 'Remove' })))),
          h('tr', { class: 'addrow' },
            h('td', null, h('input', { type: 'text', id: 'add-handle', placeholder: 'handle', value: addRow.handle, onchange: (e) => { addRow.handle = e.target.value.trim().replace(/^@/, ''); } })),
            h('td', null, h('input', { type: 'text', id: 'add-name', placeholder: 'name', value: addRow.name, onchange: (e) => { addRow.name = e.target.value.trim(); } })),
            h('td', null, h('select', { id: 'add-role', onchange: (e) => { addRow.role = e.target.value; } }, ROLES.map((r) => h('option', { value: r, text: ROLE_LABELS[r], selected: addRow.role === r })))),
            h('td', null, h('button', { type: 'button', class: 'btn small', id: 'add-person', text: 'Add', onclick: () => {
              const next = [...SU.team, { handle: addRow.handle, name: addRow.name || addRow.handle, role: addRow.role, saved: false }];
              addRow.problem = memberProblem(addRow.handle, SU.setup, next) || '';
              if (!addRow.problem) { SU.team = next; SU.add = { handle: '', name: '', role: addRow.role, problem: '' }; }
              paint();
            } }))))),
      h('div', { class: 'warnline', id: 'team-problem', text: addRow.problem }),
      h('p', { class: 'muted small', text: 'A person already on the team stays: removing someone is done by hand, so no one\'s work or sample is lost.' })),
    MODULES.map(card),
    h('section', { class: 'card', id: 'save' }, h('h2', { text: 'What Save will change' }),
      !rc.length && !sc.length ? h('p', { class: 'muted', text: 'Nothing yet.' }) : [
        rc.length ? [h('b', { text: 'review.json' }), h('ul', { class: 'plain mono small', id: 'changes-review' }, rc.map(([p, a, b]) => h('li', { text: `${p}: ${show(a)} → ${show(b)}` })))] : null,
        sc.length ? [h('b', { text: 'setup.json' }), h('ul', { class: 'plain mono small', id: 'changes-setup' }, sc.map(([p, a, b]) => h('li', { text: `${p}: ${show(a)} → ${show(b)}` })))] : null],
      h('div', { class: 'warnline', id: 'save-error', text: SU.error }),
      SU.saved ? h('p', { class: 'ok', id: 'save-done' }, SU.saved, ' ', h('button', { type: 'button', class: 'btn small', id: 'reload', onclick: () => { location.hash = '#/project'; location.reload(); }, text: 'Reload' })) : null,
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', id: 'save-btn', disabled: (!rc.length && !sc.length) || (SU.fresh && !SU.title), onclick: () => save(review, setup, rc.length, sc.length), text: 'Save' }),
        SU.fresh ? null : h('a', { href: '#/project', class: 'btn', text: 'Back to the project' })),
      SU.fresh && !SU.title ? h('p', { class: 'muted small', text: 'Give the project a title first.' }) : null)));
  window.scrollTo(0, y);
}

function strataFields() {
  const out = new Set();
  for (const f of Object.values(S.frames || {})) for (const fd of f.fields || []) if (!fd.multi) out.add(fd.id);
  if (SU.m.validation.sample.strata_by) out.add(SU.m.validation.sample.strata_by);
  return [...out];
}

async function save(review, setup, writeReview, writeSetup) {
  SU.error = '';
  try {
    // review.json first: it is what the app reads. Each write carries the sha read when the page opened, so a file
    // changed on GitHub since then is refused, not overwritten.
    if (writeReview) SU.reviewSha = await S.store.writeJSON('review.json', review, { sha: SU.reviewSha, message: SU.fresh ? 'Set up the project (set-up page)' : 'Set-up page: review.json' });
    SU.review = review;
    if (writeSetup) SU.setupSha = await S.store.writeJSON('setup.json', setup, { sha: SU.setupSha, message: 'Set-up page: setup.json' });
    SU.setup = setup;
    SU.saved = 'Saved to GitHub. Reload to see the project as set up.';
    SU.fresh = false;
    SU.team.forEach((t) => { t.saved = true; });
  } catch (e) {
    SU.error = e.status === 409 || e.status === 422
      ? 'A file changed on GitHub since this page opened, so nothing more was written. Reload the page and make the changes again.'
      : `Could not save: ${e.message}`;
  }
  paint();
}
