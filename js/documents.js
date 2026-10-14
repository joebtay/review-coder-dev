import { pdfTarget, searchWords, searchQueries } from './pdfloc.js';
import { showPdf } from './pdfview.js';
import { docQueryNotes, isPI, piOnlyFlag } from './queries.js';
import { S, unitList, firstCodes, allEvents } from './data.js';
import { h, chip, colourFor, bar, pct } from './ui.js';
import { openCodebook } from './codebook.js';

const ui = { q: '', family: '', flag: '' };

function primary() {
  const fr = Object.values(S.frames).find((f) => f.type === 'taxonomy');
  return fr ? { frame: fr.id, field: fr.stratify_by } : null;
}

export function composition(docId) {
  const p = primary();
  const counts = new Map();
  if (p) for (const u of unitList(docId)) {
    if (u.excluded) continue;
    const c = firstCodes(docId, u.id, p.frame);
    const v = c ? c[p.field] : null;
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return { p, counts, total: [...counts.values()].reduce((s, x) => s + x, 0) };
}

function stacked(docId) {
  const { counts, total } = composition(docId);
  return h('div', { class: 'stack' }, // each colour names itself on hover (PI request R1, 11 October 2026)
    [...counts].map(([k, n]) => h('span', { title: `${k}: ${n}`, style: { width: `${(100 * n) / (total || 1)}%`, background: colourFor(k) } })));
}

function verifiedByDoc() {
  const sampled = new Map(), done = new Set();
  for (const s of S.samples) for (const u of s.units) sampled.set(u.doc, (sampled.get(u.doc) || 0) + 1);
  const m = new Map();
  for (const e of allEvents()) if (e.type === 'done') done.add(e.doc + '|' + e.unit);
  for (const k of done) { const d = k.split('|')[0]; m.set(d, (m.get(d) || 0) + 1); }
  return { sampled, done: m };
}

export function renderDocuments(root) {
  const fams = [...new Set(S.docs.map((d) => d.family).filter(Boolean))].sort();
  const q = ui.q.toLowerCase();
  const rows = S.docs.filter((d) => (!q || (d.id + ' ' + d.title + ' ' + d.authors + ' ' + d.org + ' ' + d.country).toLowerCase().includes(q)) &&
    (!ui.family || d.family === ui.family) && (!ui.flag || (d.flags || []).includes(ui.flag)));
  const v = verifiedByDoc();
  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'ph' }, h('h1', { text: 'Included documents' }), h('div', { class: 'muted', text: `${rows.length} of ${S.docs.length}` })),
    h('div', { class: 'filters' },
      h('input', { type: 'text', placeholder: 'Search title, author, organisation, country, ID', value: ui.q, oninput: (e) => { ui.q = e.target.value; renderDocuments(root); const i = root.querySelector('.filters input'); i.focus(); i.setSelectionRange(ui.q.length, ui.q.length); } }),
      h('select', { onchange: (e) => { ui.family = e.target.value; renderDocuments(root); } }, h('option', { value: '', text: 'All document types' }), fams.map((f) => h('option', { value: f, text: f, selected: f === ui.family }))),
      h('select', { onchange: (e) => { ui.flag = e.target.value; renderDocuments(root); } }, h('option', { value: '', text: 'All flags' }),
        [...new Set(S.docs.flatMap((d) => d.flags || []))].filter((f) => isPI() || !piOnlyFlag(f)).map((f) => h('option', { value: f, text: f, selected: f === ui.flag })))),
    h('div', { class: 'tw' }, h('table', { class: 't docs' },
      h('thead', null, h('tr', null, ['ID', 'Title', 'Year', 'Type', 'Country', 'Units', 'Composition', 'Verified'].map((x) => h('th', { text: x })))),
      h('tbody', null, rows.map((d) => {
        const n = unitList(d.id).filter((u) => !u.excluded).length;
        const sm = v.sampled.get(d.id) || 0, dn = v.done.get(d.id) || 0;
        return h('tr', null,
          h('td', null, h('a', { href: `#/doc/${encodeURIComponent(d.id)}`, class: 'mono', text: d.id })),
          h('td', { text: d.title }), h('td', { text: d.year }), h('td', { text: d.family || d.type }), h('td', { text: d.country }),
          h('td', { class: 'mono', text: S.ready ? n : '…' }),
          h('td', { class: 'comp' }, S.ready ? stacked(d.id) : null),
          h('td', { class: 'mono', text: sm ? `${dn}/${sm}` : '-' }));
      }))))));
}

export function renderDocProfile(root, id) {
  const d = S.docById.get(id);
  if (!d) { root.replaceChildren(h('div', { class: 'page' }, h('p', { text: 'No such document.' }), h('a', { href: '#/documents', text: 'Back to documents' }))); return; }
  const units = unitList(id);
  const { p, counts, total } = composition(id);
  const v = verifiedByDoc();
  const pdfOk = pdfParts(d).some((x) => S.store.has(x.file));
  const byInt = new Map();
  for (const u of units) { const k = u.parent || '(none)'; if (!byInt.has(k)) byInt.set(k, []); byInt.get(k).push(u); }
  const meta = (k, val) => val ? h('div', { class: 'kv' }, h('span', { class: 'k', text: k }), h('span', { text: val })) : null;
  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'crumbs' }, h('a', { href: '#/documents', text: 'Documents' }), ' / ', h('span', { class: 'mono', text: d.id })),
    h('div', { class: 'ph' }, h('h1', { text: d.title }), h('div', { class: 'muted', text: [d.authors, d.year].filter(Boolean).join(' · ') })),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', { text: 'Citation and source' }),
        meta('Authors', d.authors), meta('Organisation', d.org), meta('Year', d.year), meta('Type', d.type), meta('Family', d.family), meta('Country', d.country),
        d.url ? h('div', { class: 'kv' }, h('span', { class: 'k', text: 'Source' }), h('a', { href: d.url, target: '_blank', rel: 'noopener', text: d.url })) : null,
        meta('Internal ID', d.id), (d.flags || []).filter((f) => isPI() || !piOnlyFlag(f)).length ? h('div', { class: 'kv' }, h('span', { class: 'k', text: 'Flags' }), d.flags.filter((f) => isPI() || !piOnlyFlag(f)).map((f) => h('span', { class: 'pill warn', text: f }))) : null,
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', disabled: !pdfOk, title: pdfOk ? '' : 'The PDF is not in the data repo yet', onclick: () => openPdf(d, d.summary_page) }, 'Open full text'))),
      h('section', { class: 'card' }, h('h2', { text: 'Summary' }),
        d.summary ? h('p', { text: d.summary }) : h('p', { class: 'muted', text: 'No stated purpose in the source.' }),
        d.summary_page ? h('div', { class: 'muted', text: `Source page ${d.summary_page}` }) : null,
        S.ready && total ? h('div', null, h('h3', { text: `Composition by ${p ? S.frames[p.frame].fields.find((f) => f.id === p.field).label.toLowerCase() : ''}` }), stacked(id),
          h('div', { class: 'legend' }, [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('button', { type: 'button', class: 'chip', onclick: () => openCodebook({ frame: p.frame, field: p.field, value: k, tab: 'field' }) }, h('span', { class: 'dot', style: { background: colourFor(k) } }), `${k} ${n}`)))) : null,
        v.sampled.get(id) ? h('p', { class: 'muted', text: `Verification: ${v.done.get(id) || 0} of ${v.sampled.get(id)} sampled units done.` }) : null),
      docQueryNotes(id),
      h('section', { class: 'card wide' }, h('h2', { text: `Coded units (${units.length})` }),
        !S.ready && !units.length ? h('p', { class: 'muted', text: 'Loading' }) : null,
        [...byInt].map(([k, us]) => {
          const it = (d.interventions || []).find((x) => x.id === k);
          return h('div', { class: 'int' }, h('h3', null, it ? it.name : 'Not under an intervention', h('span', { class: 'muted mono', text: '  ' + k })),
            us.map((u) => {
              const c = p ? firstCodes(id, u.id, p.frame) : null;
              return h('div', { class: 'unit' }, h('div', { class: 'ul' }, h('b', { text: u.label || u.id }), h('span', { class: 'muted mono', text: `  ${u.id}${u.page ? ' · p. ' + u.page : ''}` })),
                u.text ? h('div', { class: 'ut', text: u.text }) : null,
                c ? h('div', { class: 'chips' }, Object.entries(c).filter(([, val]) => val).map(([f, val]) => chip(val, { onclick: () => openCodebook({ frame: p.frame, field: f, value: val, tab: 'field' }) }))) : null);
            }));
        })))));
}

/** A document's PDF files. Default is documents/<ID>.pdf. A document split into parts lists them in index.json as pdf_parts [{file, from, to}], where from and to are source page numbers. */
export function pdfParts(d) {
  if (d.pdf_parts && d.pdf_parts.length) return d.pdf_parts;
  return [{ file: d.pdf || `documents/${d.id}.pdf`, from: 1, to: null }];
}

export async function openPdf(d, page, passage, printed, label = 'passage') {
  try {
    const parts = pdfParts(d).filter((x) => S.store.has(x.file));
    let pages = null;
    try { if (S.store.has(`documents/${d.id}.pages.json`)) pages = (await S.store.readJSON(`documents/${d.id}.pages.json`)).pages; } catch {}
    const t = pdfTarget(pages, parts.length ? parts : pdfParts(d), page);
    const blob = await S.store.readBlob(t.file);
    const words = passage ? searchWords(passage) : '';
    if (words) { try { await navigator.clipboard.writeText(words); } catch {} }
    await showPdf({
      blob: blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }), page: t.page, title: d.title || d.id,
      queries: passage ? searchQueries(passage) : [],
      note: printed ? `This ${label}'s page number is the document's printed page, which can differ from the PDF page. The highlight shows where the words are.` : '', label,
      fallback: words ? `Not found in the PDF text. The first words are copied: press Ctrl+F (Cmd+F on a Mac) and paste to search the page.` : '',
    });
  } catch (e) { alert('Could not open the PDF: ' + e.message); }
}

