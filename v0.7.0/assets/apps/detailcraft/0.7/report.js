/* SPDX-License-Identifier: Apache-2.0 */
/**
 * report.js — the material and weight report, phase by phase (0.4 D14). No DOM.
 *
 *   phaseReport(state, built, marks, schedule) → { phases: [phaseRow], totals }
 *     phaseRow = { n, name, rows: [{ mark, type, profile, material, length, count, unitWeight, weight, paint }],
 *                  bolts: [{ kind, d, length, grade, count }], rebar (kg), totals: { parts, weight, paint, bolts, rebar } }
 *     Rows are the parts of that phase grouped by part mark (with marks per phase off, one mark can be in several
 *     phases: it gets a row in each). Weights are gross (holes and copes not taken off), as in the bill of materials.
 *     Paint area = the section's outside perimeter × the cut length (m²): both faces and the edges of a plate, the
 *     outside of a tube; ends and holes not counted. Rebar = the bars of the phase's footings.
 *   reportCsv(report) → CSV text: a summary table, then one table per phase (parts, then bolts, then rebar)
 *   reportSheets(report, { paper, model, date }) → display lists for pdf.js: the summary first, then each phase,
 *     tables carried over to as many pages as they need; every page framed, titled and numbered "page n of N"
 * Words come from the app's language file (t()).
 */
import { t } from './i18n.js';
import { BARS } from './rebar.js';
import { boltList } from './marks.js';
import { toCsv } from './csv.js';
import { textWidth } from './pdf.js';
import { paperOf } from './paper.js';

const kg1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const m2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
export const paintArea = (part) => part.profile.perimeter * part.length / 1e6;

export function phaseReport(state, built, marks, schedule) {
  const phases = (state.phases?.length ? state.phases : [{ n: 1, name: '' }]).map((p) => ({ n: p.n, name: p.name, rows: [], bolts: [], rebar: 0, totals: { parts: 0, weight: 0, paint: 0, bolts: 0, rebar: 0 } }));
  const byN = new Map(phases.map((p) => [p.n, p]));
  const of = (n) => byN.get(n || 1) || byN.values().next().value;
  const rows = new Map();
  for (const part of built.parts) {
    const ph = of(part.phase);
    const mark = marks.partMark.get(part.id) || part.id;
    const key = ph.n + '|' + mark;
    if (!rows.has(key)) { const r = { mark, type: part.type, profile: part.profileName, material: part.material, length: part.length, count: 0, unitWeight: part.weight, weight: 0, paint: 0 }; rows.set(key, r); ph.rows.push(r); }
    const r = rows.get(key);
    r.count++; r.weight += part.weight; r.paint += paintArea(part);
  }
  const order = { column: 0, beam: 1, brace: 2, plate: 3 };
  for (const ph of phases) {
    ph.rows.sort((a, b) => order[a.type] - order[b.type] || a.mark.localeCompare(b.mark, 'en', { numeric: true }));
    ph.bolts = boltList(built.bolts.filter((b) => of(b.phase) === ph));
    ph.rebar = state.footings.filter((f) => of(f.phase) === ph).reduce((s, f) => s + (schedule.byFooting.get(f.id) || []).reduce((t2, { group: g }) => t2 + g.count * g.length * BARS.get(g.bar).mass / 1000, 0), 0);
    ph.totals = { parts: ph.rows.reduce((s, r) => s + r.count, 0), weight: ph.rows.reduce((s, r) => s + r.weight, 0), paint: ph.rows.reduce((s, r) => s + r.paint, 0), bolts: ph.bolts.reduce((s, b) => s + b.count, 0), rebar: ph.rebar };
  }
  const sum = (k) => phases.reduce((s, p) => s + p.totals[k], 0);
  return { phases, totals: { parts: sum('parts'), weight: sum('weight'), paint: sum('paint'), bolts: sum('bolts'), rebar: sum('rebar') } };
}

export const phaseTitle = (ph) => (ph.name ? t('rep.phase.named', { n: ph.n, name: ph.name }) : t('phase.default', { n: ph.n }));

/** The tables of the report as rows (header first), for the CSV, the PDF and the page. */
export function reportTables(rep) {
  const summary = [[t('rep.col.phase'), t('rep.col.parts'), t('rep.col.steel'), t('rep.col.paint'), t('rep.col.bolts'), t('rep.col.rebar')],
    ...rep.phases.map((p) => [phaseTitle(p), String(p.totals.parts), kg1(p.totals.weight), m2(p.totals.paint), String(p.totals.bolts), kg1(p.totals.rebar)]),
    [t('rep.total'), String(rep.totals.parts), kg1(rep.totals.weight), m2(rep.totals.paint), String(rep.totals.bolts), kg1(rep.totals.rebar)]];
  const phases = rep.phases.map((p) => ({
    title: phaseTitle(p),
    parts: [[t('rep.col.mark'), t('rep.col.type'), t('rep.col.profile'), t('rep.col.material'), t('rep.col.length'), t('rep.col.count'), t('rep.col.each'), t('rep.col.kg'), t('rep.col.paint')],
      ...p.rows.map((r) => [r.mark, t('rep.type.' + r.type), r.profile, r.material, String(Math.round(r.length)), String(r.count), kg1(r.unitWeight), kg1(r.weight), m2(r.paint)]),
      [t('rep.total'), '', '', '', '', String(p.totals.parts), '', kg1(p.totals.weight), m2(p.totals.paint)]],
    bolts: [[t('rep.col.fastener'), t('rep.col.dia'), t('rep.col.blen'), t('rep.col.grade'), t('rep.col.count')],
      ...p.bolts.map((b) => [t(b.kind === 'ANCHORBOLT' ? 'rep.rod' : 'rep.bolt'), String(b.d), String(b.length), b.grade, String(b.count)])],
    rebar: p.rebar,
  }));
  return { summary, phases };
}

export function reportCsv(rep) {
  const T = reportTables(rep);
  const out = [toCsv([[t('rep.csv.summary')], ...T.summary])];
  for (const p of T.phases) {
    out.push(toCsv([[p.title], ...p.parts]));
    if (p.bolts.length > 1) out.push(toCsv([[t('rep.csv.bolts', { phase: p.title })], ...p.bolts]));
    out.push(toCsv([[t('rep.csv.rebar', { phase: p.title }), kg1(p.rebar)]]));
  }
  return out.join('\r\n');
}

// ---- PDF pages ----

export function reportSheets(rep, { paper = 'A3', model = '', date = '' } = {}) {
  const P = paperOf(paper);
  const T = reportTables(rep);
  const pages = [];
  let page = null, y = 0;
  const top = P.h - 32, bottom = 22, line = 4.6, h = 2.4;
  const newPage = () => {
    page = { w: P.w, h: P.h, paper: P.key, items: [] };
    pages.push(page);
    page.items.push({ k: 'path', pts: [[10, 10], [P.w - 10, 10], [P.w - 10, P.h - 10], [10, P.h - 10]], w: 0.5, dash: null, closed: true, fill: false });
    page.items.push({ k: 'text', s: t('rep.title'), x: 20, y: P.h - 20, h: 4.2, align: 'left', rot: 0, bold: true });
    page.items.push({ k: 'text', s: [model, date].filter(Boolean).join('   '), x: P.w - 20, y: P.h - 20, h: 2.6, align: 'right', rot: 0, bold: false });
    y = top;
  };
  const text = (s, x, yy, o = {}) => page.items.push({ k: 'text', s: String(s), x, y: yy, h: o.h || h, align: o.align || 'left', rot: 0, bold: !!o.bold });
  const rule = (x0, x1, yy, w = 0.18) => page.items.push({ k: 'path', pts: [[x0, yy], [x1, yy]], w, dash: null, closed: false, fill: false });
  /** A table at the left margin, columns as wide as their contents; numbers right-aligned; carried over pages. */
  const table = (title, rows, numeric) => {
    const widths = rows[0].map((_, c) => Math.max(...rows.map((r, i) => textWidth(r[c] || '', h, i === 0 || i === rows.length - 1))) + 4);
    const xs = []; let x = 20;
    for (const w of widths) { xs.push(x); x += w; }
    const right = x - 4;
    const head = () => {
      if (title) text(title, 20, y, { h: 3, bold: true });
      y -= line + 1;
      rows[0].forEach((c, i) => text(c, numeric.has(i) ? xs[i] + widths[i] - 4 : xs[i], y, { bold: true, align: numeric.has(i) ? 'right' : 'left' }));
      rule(18, right + 2, y - 1.4);
      y -= line;
    };
    if (y - 3 * line < bottom) newPage();
    head();
    rows.slice(1).forEach((r, ri) => {
      if (y < bottom) { newPage(); title = title ? title + ' ' + t('rep.continued') : title; head(); }
      const last = ri === rows.length - 2 && r[0] === t('rep.total');
      if (last) rule(18, right + 2, y + line - 1.4);
      r.forEach((c, i) => text(c, numeric.has(i) ? xs[i] + widths[i] - 4 : xs[i], y, { bold: last, align: numeric.has(i) ? 'right' : 'left' }));
      y -= line;
    });
    y -= line;
  };
  newPage();
  table(t('rep.summary'), T.summary, new Set([1, 2, 3, 4, 5]));
  text(t('rep.note'), 20, y, { h: 2.1 });
  y -= line * 2;
  for (const p of T.phases) {
    if (y - 6 * line < bottom) newPage();
    table(p.title, p.parts, new Set([4, 5, 6, 7, 8]));
    if (p.bolts.length > 1) table(t('rep.boltsof'), p.bolts, new Set([1, 2, 4]));
    if (y < bottom) newPage();
    text(t('rep.rebarof', { kg: kg1(p.rebar) }), 20, y, { h: 2.4 });
    y -= line * 2;
  }
  pages.forEach((pg, i) => pg.items.push({ k: 'text', s: t('rep.page', { n: i + 1, of: pages.length }), x: P.w - 20, y: 14, h: 2.2, align: 'right', rot: 0, bold: false }));
  return pages;
}
