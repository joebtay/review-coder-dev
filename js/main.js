import { S, loadReview, refreshEvents } from './data.js';
import { GitHubStore, StaticStore } from './store.js';
import { h } from './ui.js';
import { mountCodebook, toggleCodebook, render as renderCodebook } from './codebook.js';
import { renderProject, renderProtocol } from './project.js';
import { renderDocuments, renderDocProfile } from './documents.js';
import { renderVerify, V } from './verify.js';
import { renderScreen, SC } from './screen.js';
import { renderAgreement } from './agreement.js';
import { feature } from './features.js';
import { orientationPage, anyHasOrientation, orientationFrame } from './orientation.js';
import { renderThemes } from './themeview.js';
import { renderSetup, SU } from './setup.js';
import { renderReporting } from './reporting.js';
import { isPI } from './setuprules.js';
import { DEMO_ONLY } from './site.js';

const NAV = [['project', 'Project'], ['documents', 'Documents'], ['screen', 'Screen'], ['code', 'Code'], ['verify', 'Verify'], ['themes', 'Themes'], ['agreement', 'Agreement'], ['reporting', 'Reporting'], ['overview', 'Overview']];
const themesOn = () => feature('themes_by_document') || feature('themes_by_code');
const CFG = 'rc:config';
const app = document.getElementById('app');
let shell = null, main = null, pill = null, pendingRender = false;

// The dev site (DEMO_ONLY, site.js) never reads or saves a sign-in: it shares joebtay.github.io with the stable app.
const cfg = () => { if (DEMO_ONLY) return null; try { return JSON.parse(localStorage.getItem(CFG) || 'null'); } catch { return null; } };
const saveCfg = (c) => { if (DEMO_ONLY) return; try { localStorage.setItem(CFG, JSON.stringify(c)); } catch {} };
const demoStore = () => (DEMO_ONLY ? new StaticStore('./demo/', { key: 'rc-dev:', repo: 'dev-demo' }) : new StaticStore('./demo/'));
// A classic token with only the repo box ticked: GitHub opens its form with this scope selected.
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=Review%20Coder';
const apiOverride = () => { const q = new URLSearchParams(location.search).get('api'); return q && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(q) ? q : null; };

function signIn(msg) {
  if (DEMO_ONLY) { start(demoStore(), null, false); return; } // the dev site opens the made-up demo only
  const c = cfg() || {};
  const qRepo = new URLSearchParams(location.search).get('repo');
  const linkRepo = qRepo && /^[\w.-]+\/[\w.-]+$/.test(qRepo) ? qRepo : null;
  const repo = h('input', { type: 'text', id: 'repo', placeholder: 'owner/repo', value: linkRepo || c.repo || '', autocomplete: 'off' });
  const token = h('input', { type: 'password', id: 'token', placeholder: 'GitHub token', value: c.token || '', autocomplete: 'off' });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: true });
  const err = h('div', { class: 'warnline', id: 'err', text: msg || '' });
  const go = async () => {
    err.textContent = '';
    const conf = { repo: repo.value.trim(), token: token.value.trim(), api: apiOverride() || undefined };
    if (!/^[\w.-]+\/[\w.-]+$/.test(conf.repo) || !conf.token) { err.textContent = 'Enter the repository as owner/name and paste your token.'; return; }
    await start(new GitHubStore(conf), conf, remember.checked);
  };
  app.replaceChildren(h('div', { class: 'signin' },
    h('h1', { text: 'Review Coder' }), h('p', { class: 'muted', text: 'Code, verify and screen documents for an evidence review. Everything is saved to your review\'s private GitHub repo.' }),
    h('label', null, 'Review data repository', repo), h('label', null, 'Your GitHub token', token),
    h('p', { class: 'small tokenlink' }, 'No token yet? ', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener', id: 'make-token', text: 'Make one on GitHub' }),
      ' (opens with the right box ticked: choose 90 days, click Generate token, copy it and paste it here).'),
    h('label', { class: 'inline' }, remember, ' Remember on this device'),
    err, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: go, text: 'Open review' }), h('button', { type: 'button', class: 'btn', onclick: () => start(demoStore(), null, false), text: 'Try the demo' })),
    h('details', null, h('summary', { text: 'How to make a token' }),
      h('p', { class: 'small', text: 'If the review repo is yours, or belongs to an organisation you are in, make a fine-grained token:' }),
      h('ol', null, h('li', { text: 'GitHub, Settings, Developer settings, Fine-grained tokens, Generate new token.' }), h('li', { text: 'Repository access: only select repositories, then pick the review data repo.' }),
        h('li', { text: 'Permissions: Contents, read and write. Nothing else.' }), h('li', { text: 'Set an expiry that covers the review. The token stays in this browser and goes only to api.github.com.' })),
      h('p', { class: 'small', text: 'If you were invited to a repo on another person\'s account, GitHub does not offer it for a fine-grained token. Make a classic token instead:' }),
      h('ol', null, h('li', null, 'Use the "Make one on GitHub" link above, or: GitHub, Settings, Developer settings, Personal access tokens, Tokens (classic), Generate new token (classic).'),
        h('li', { text: 'Scopes: tick repo only.' }), h('li', { text: 'Expiration: 90 days, or the length of the review.' }),
        h('li', { text: 'A classic token reaches every repo you can open, so use it only here, on your own computer.' })))));
}

async function start(store, conf, remember) {
  app.replaceChildren(h('div', { class: 'signin' }, h('p', { class: 'muted', text: 'Opening the review' })));
  try {
    const u = await store.user();
    await store.init();
    if (conf && remember) saveCfg(conf);
    // a repo with no review.json yet is a new project: it opens on the set-up page, for the person signing in
    if (!store.has('review.json')) { S.store = store; S.handle = u.login; main = h('main', { id: 'main' }); app.replaceChildren(main); await renderSetup(main, { fresh: true }); return; }
    await loadReview(store, u.login);
    buildShell(u.login);
    route();
  } catch (e) {
    if (conf && (e.status === 0 || e.status >= 500)) { offlineScreen(store, conf, remember, e); return; }
    const m = e.status === 401 ? 'GitHub rejected the token.' : e.status === 404 ? 'Repository not found, or the token cannot see it. If you were invited, accept the invitation on GitHub first (check your email), then try again.' : e.status === 0 ? 'Could not reach GitHub.' : e.message;
    signIn(m);
  }
}

function offlineScreen(store, conf, remember, e) {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(`rc:${conf.repo}:`) && k.endsWith(':outbox')) n += Object.values(JSON.parse(localStorage.getItem(k) || '{}')).reduce((a, l) => a + l.length, 0); } } catch {}
  app.replaceChildren(h('div', { class: 'signin' }, h('h1', { text: 'Cannot reach GitHub' }),
    h('p', null, e.message + '. '), h('p', { class: 'ok', text: n ? `${n} change${n > 1 ? 's' : ''} saved on this device will sync when the connection returns.` : 'Nothing is waiting to sync.' }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => start(store, conf, remember), text: 'Try again' }), h('button', { type: 'button', class: 'btn', onclick: () => signIn(), text: 'Change repository or token' }))));
}

function buildShell(handle) {
  pill = h('div', { class: 'syncpill' });
  main = h('main', { id: 'main' });
  const nav = h('nav', { 'aria-label': 'Workspace' }, NAV.filter(([k]) => (k === 'themes' ? themesOn() : feature(k))).map(([k, l]) => h('a', { href: `#/${k}`, 'data-k': k, text: l })));
  shell = h('div', { class: 'shell' },
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, '≡'), h('div', null, h('b', { text: 'Review Coder' }), h('div', { class: 'muted small', text: S.review.title }))),
      nav,
      h('div', { class: 'right' }, pill,
        isPI(handle, S.review) ? h('a', { href: '#/setup', class: 'btn small', id: 'setup-header', title: 'The modules this project uses and their options' }, 'Set-up') : null,
        anyHasOrientation() ? h('a', { href: '#/orientation', class: 'btn small', id: 'orient-header', title: 'The questions, their definitions and worked examples' }, 'How the codes work') : null,
        S.review.codebook || Object.keys(S.frames || {}).length ? h('button', { type: 'button', class: 'btn small', onclick: () => toggleCodebook(), title: 'Show definitions (?)' }, 'Codebook') : null,
        h('div', { class: 'who', title: handle }, h('span', { class: 'av', text: handle.slice(0, 2).toUpperCase() }), h('span', { class: 'muted small', text: handle })),
        DEMO_ONLY ? null : h('button', { type: 'button', class: 'btn small', onclick: () => { if (S.sync && S.sync.pending() && !confirm(`${S.sync.pending()} changes have not reached GitHub yet. They stay saved on this device. Sign out anyway?`)) return; try { localStorage.removeItem(CFG); } catch {} location.hash = ''; location.reload(); } }, 'Sign out'))),
    main);
  app.replaceChildren(shell);
  mountCodebook(app);
  S.listeners.add(scheduleRender);
  S.statusListeners.add(paintPill);
  paintPill();
}

function paintPill() {
  if (!pill) return;
  const s = S.syncStatus;
  const where = S.store && S.store.demo ? 'in this browser (demo)' : 'to GitHub';
  const txt = s.state === 'saved' ? `Saved ${where}` : s.state === 'syncing' ? `Saved on this device · ${s.pending} syncing` : s.state === 'offline' ? `Saved on this device · ${s.pending} waiting, offline` : `Saved on this device · ${s.pending} not synced`;
  pill.className = 'syncpill ' + s.state;
  pill.title = s.message || '';
  const kids = [h('span', { class: 'sd' }), txt];
  if (s.state !== 'saved') kids.push(h('button', { type: 'button', class: 'link', onclick: () => S.sync.flush(), text: 'Retry' }));
  pill.replaceChildren(...kids);
}

function scheduleRender() {
  const a = document.activeElement;
  if (a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && a.closest('#main') && a.type !== 'checkbox') { pendingRender = true; return; }
  route();
}
document.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(route, 0); } });

function route() {
  if (!main) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const page = (parts[0] || 'project').split('?')[0];
  if (page !== 'setup') SU.loaded = false; // the set-up page re-reads both files each time it opens
  shell.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.k === page || (page === 'doc' && a.dataset.k === 'documents') || (page === 'protocol' && a.dataset.k === 'project')));
  const y = window.scrollY;
  const off = { documents: 'documents', doc: 'documents', verify: 'verify', screen: 'screen', agreement: 'agreement', overview: 'overview', code: 'code', reporting: 'reporting' }[page];
  if (page === 'themes' && !themesOn()) main.replaceChildren(h('div', { class: 'page narrow' }, h('h1', { text: 'Themes' }),
    h('p', { class: 'muted', text: 'This part of the platform is not switched on for this review yet.' }), h('p', null, h('a', { href: '#/project', text: 'Back to the project' }))));
  else if (off && !feature(off)) main.replaceChildren(h('div', { class: 'page narrow' }, h('h1', { text: NAV.find((n) => n[0] === page)?.[1] || 'Not available' }),
    h('p', { class: 'muted', text: 'This part of the platform is not switched on for this review yet.' }), h('p', null, h('a', { href: '#/project', text: 'Back to the project' }))));
  else if (page === 'project') renderProject(main);
  else if (page === 'protocol') renderProtocol(main);
  else if (page === 'documents') renderDocuments(main);
  else if (page === 'doc') renderDocProfile(main, decodeURIComponent(parts[1] || ''));
  else if (page === 'verify') renderVerify(main);
  else if (page === 'themes') renderThemes(main, parts.slice(1).map((x) => x.split('?')[0]));
  else if (page === 'screen') renderScreen(main);
  else if (page === 'orientation' && anyHasOrientation()) main.replaceChildren(orientationPage(() => { location.hash = '#/verify'; }, 'Back to coding', orientationFrame()));
  else if (page === 'agreement') renderAgreement(main);
  else if (page === 'reporting') renderReporting(main);
  else if (page === 'setup') renderSetup(main);
  else main.replaceChildren(h('div', { class: 'page' }, h('h1', { text: NAV.find((n) => n[0] === page)?.[1] || 'Not found' }), h('p', { class: 'muted', text: page === 'overview' ? 'The matrix and audit trail arrive in stage 4.' : 'This module arrives in stage 5.' })));
  renderCodebook(true);
  if (page !== 'verify' && page !== 'screen' && page !== 'themes') window.scrollTo(0, y);
}
window.addEventListener('hashchange', () => { if (main) { route(); window.scrollTo(0, 0); } });

document.addEventListener('keydown', (e) => {
  if (!main) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === '?') { toggleCodebook(); e.preventDefault(); return; }
  if ((location.hash.startsWith('#/verify')) && V.keys) V.keys(e);
  else if (location.hash.startsWith('#/screen') && SC.keys) SC.keys(e);
});

const c = cfg();
if (DEMO_ONLY || location.search.includes('demo')) start(demoStore(), null, false);
else if (c && c.repo && c.token) start(new GitHubStore({ ...c, api: apiOverride() || c.api }), c, true);
else signIn();
