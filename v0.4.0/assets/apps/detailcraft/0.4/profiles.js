/* SPDX-License-Identifier: Apache-2.0 */
/**
 * profiles.js — steel profile catalogs and parametric section shapes. No DOM.
 *
 * Every catalog size below is copied from a published table, never estimated. bin/test-detailcraft.mjs
 * cross-checks each row (the area worked out from the dimensions must match the published area, and
 * the published weight must match that area × steel density), so a mistyped digit fails the test.
 *
 *   AISC — "AISC Shapes Database v16.0" (American Institute of Steel Construction, 2023), US units:
 *          W: d, bf, tw, tf, kdes (in), A (in²), nominal weight (lb/ft). The database gives no fillet
 *             radius; DetailCraft draws r = kdes − tf (the test shows the area then agrees within 0.3%).
 *          C: d, bf, tw, tf (average flange thickness), A, weight. Drawn with parallel flanges of the
 *             average thickness and square corners (the real flange is sloped).
 *          L: leg b × b, t, A, weight. Drawn with square corners.
 *          HSS rectangular: H, B, nominal t, design wall t (= 0.93 × nominal, AISC 360-22 B4.2), A, weight.
 *             Corners drawn with outer radius 2 × design t, as AISC computes the section properties.
 *          HSS round: D, nominal t, design t, A, weight.
 *   EN   — EN 10365:2017 "Hot rolled steel channels, I and H sections — dimensions and masses":
 *          IPE, HEA, HEB: h, b, tw, tf, r (mm), A (cm²), mass G (kg/m).
 * Plates (PL<t>x<w>) are parametric: any thickness and width. Users can add custom parametric profiles.
 *
 * Model units are millimeters. Sections live in the (u, v) plane: v is "up" (the depth), u across.
 * Every outline is centered on its bounding box.
 */

import { t } from './i18n.js';

export const STEEL_DENSITY = 7850;          // kg/m³, carbon steel (EN 1991-1-1 Table A.4 gives 77–78.5 kN/m³)
const IN = 25.4;                             // mm per inch (exact)
const LBFT = 1.48816394;                     // kg/m per lb/ft (0.45359237 kg / 0.3048 m)

export const SOURCES = {
  aisc: 'AISC Shapes Database v16.0',   // i18n-ignore (a published table's title)
  en: 'EN 10365:2017',
  get param() { return t('prof.source.param'); },
  get custom() { return t('prof.source.custom'); },
};

// AISC Shapes Database v16.0 — W shapes: [name, d, bf, tw, tf, kdes, A, W]
const AISC_W = [
  ['W8X10', 7.89, 3.94, 0.170, 0.205, 0.505, 2.96, 10],
  ['W8X31', 8.00, 8.00, 0.285, 0.435, 0.829, 9.13, 31],
  ['W10X33', 9.73, 7.96, 0.290, 0.435, 0.935, 9.71, 33],
  ['W10X49', 9.98, 10.0, 0.340, 0.560, 1.06, 14.4, 49],
  ['W12X26', 12.2, 6.49, 0.230, 0.380, 0.680, 7.65, 26],
  ['W12X40', 11.9, 8.01, 0.295, 0.515, 1.02, 11.7, 40],
  ['W12X50', 12.2, 8.08, 0.370, 0.640, 1.14, 14.6, 50],
  ['W14X22', 13.7, 5.00, 0.230, 0.335, 0.735, 6.49, 22],
  ['W14X30', 13.8, 6.73, 0.270, 0.385, 0.785, 8.85, 30],
  ['W14X90', 14.0, 14.5, 0.440, 0.710, 1.31, 26.5, 90],
  ['W16X26', 15.7, 5.50, 0.250, 0.345, 0.747, 7.68, 26],
  ['W16X31', 15.9, 5.53, 0.275, 0.440, 0.842, 9.13, 31],
  ['W18X35', 17.7, 6.00, 0.300, 0.425, 0.827, 10.3, 35],
  ['W21X44', 20.7, 6.50, 0.350, 0.450, 0.950, 13.0, 44],
  ['W24X55', 23.6, 7.01, 0.395, 0.505, 1.01, 16.2, 55],
];
// AISC Shapes Database v16.0 — C shapes: [name, d, bf, tw, tf(avg), A, W]
const AISC_C = [
  ['C8X11.5', 8.00, 2.26, 0.220, 0.390, 3.37, 11.5],
  ['C10X15.3', 10.0, 2.60, 0.240, 0.436, 4.48, 15.3],
  ['C12X20.7', 12.0, 2.94, 0.282, 0.501, 6.08, 20.7],
];
// AISC Shapes Database v16.0 — equal-leg angles: [name, b, t, A, W]
const AISC_L = [
  ['L3X3X1/4', 3, 0.25, 1.44, 4.9],
  ['L4X4X3/8', 4, 0.375, 2.86, 9.8],
  ['L4X4X1/2', 4, 0.5, 3.75, 12.8],
  ['L5X5X1/2', 5, 0.5, 4.79, 16.2],
  ['L6X6X1/2', 6, 0.5, 5.77, 19.6],
];
// AISC Shapes Database v16.0 — rectangular HSS: [name, H, B, t nominal, t design, A, W]
const AISC_RHS = [
  ['HSS4X4X1/4', 4, 4, 0.25, 0.233, 3.37, 12.21],
  ['HSS6X4X1/4', 6, 4, 0.25, 0.233, 4.30, 15.62],
  ['HSS6X6X1/4', 6, 6, 0.25, 0.233, 5.24, 19.02],
  ['HSS8X8X3/8', 8, 8, 0.375, 0.349, 10.4, 37.69],
  ['HSS8X8X1/2', 8, 8, 0.5, 0.465, 13.5, 48.85],
];
// AISC Shapes Database v16.0 — round HSS: [name, D, t nominal, t design, A, W]
const AISC_CHS = [
  ['HSS4.500X0.237', 4.5, 0.237, 0.220, 2.96, 10.79],
  ['HSS6.625X0.280', 6.625, 0.280, 0.260, 5.20, 18.97],
];
// EN 10365:2017 — IPE, HEA, HEB: [name, h, b, tw, tf, r, A cm², G kg/m]
const EN_I = [
  ['IPE100', 100, 55, 4.1, 5.7, 7, 10.3, 8.1],
  ['IPE160', 160, 82, 5.0, 7.4, 9, 20.1, 15.8],
  ['IPE200', 200, 100, 5.6, 8.5, 12, 28.5, 22.4],
  ['IPE240', 240, 120, 6.2, 9.8, 15, 39.1, 30.7],
  ['IPE300', 300, 150, 7.1, 10.7, 15, 53.8, 42.2],
  ['IPE360', 360, 170, 8.0, 12.7, 18, 72.7, 57.1],
  ['IPE400', 400, 180, 8.6, 13.5, 21, 84.5, 66.3],
  ['HEA160', 152, 160, 6, 9, 15, 38.8, 30.4],
  ['HEA200', 190, 200, 6.5, 10, 18, 53.8, 42.3],
  ['HEA240', 230, 240, 7.5, 12, 21, 76.8, 60.3],
  ['HEA300', 290, 300, 8.5, 14, 27, 112.5, 88.3],
  ['HEB160', 160, 160, 8, 13, 15, 54.3, 42.6],
  ['HEB200', 200, 200, 9, 15, 18, 78.1, 61.3],
  ['HEB240', 240, 240, 10, 17, 21, 106, 83.2],
  ['HEB300', 300, 300, 11, 19, 27, 149.1, 117],
];

/** Display name: AISC names print with a lowercase x (W12x26), as the AISC Manual does. */
const disp = (n) => n.replace(/X/g, 'x');

function build() {
  const out = new Map();
  const add = (p) => out.set(p.name.toUpperCase(), Object.freeze(p));
  for (const [n, d, bf, tw, tf, k, A, W] of AISC_W) {
    add({ name: disp(n), family: 'W', kind: 'I', source: 'aisc', d: d * IN, bf: bf * IN, tw: tw * IN, tf: tf * IN, r: (k - tf) * IN,
      areaPub: A * IN * IN, massPub: W * LBFT, pub: { units: 'in', d, bf, tw, tf, kdes: k, A, W } });
  }
  for (const [n, d, bf, tw, tf, A, W] of AISC_C) {
    add({ name: disp(n), family: 'C', kind: 'C', source: 'aisc', d: d * IN, bf: bf * IN, tw: tw * IN, tf: tf * IN, r: 0,
      areaPub: A * IN * IN, massPub: W * LBFT, pub: { units: 'in', d, bf, tw, tf, A, W } });
  }
  for (const [n, b, t, A, W] of AISC_L) {
    add({ name: disp(n), family: 'L', kind: 'L', source: 'aisc', b: b * IN, t: t * IN,
      areaPub: A * IN * IN, massPub: W * LBFT, pub: { units: 'in', b, t, A, W } });
  }
  for (const [n, H, B, tn, t, A, W] of AISC_RHS) {
    add({ name: disp(n), family: 'HSS', kind: 'RHS', source: 'aisc', h: H * IN, b: B * IN, t: t * IN, tNom: tn * IN, ro: 2 * t * IN, ri: t * IN,
      areaPub: A * IN * IN, massPub: W * LBFT, pub: { units: 'in', H, B, tNom: tn, t, A, W } });
  }
  for (const [n, D, tn, t, A, W] of AISC_CHS) {
    add({ name: disp(n), family: 'HSS', kind: 'CHS', source: 'aisc', D: D * IN, t: t * IN, tNom: tn * IN,
      areaPub: A * IN * IN, massPub: W * LBFT, pub: { units: 'in', D, tNom: tn, t, A, W } });
  }
  for (const [n, h, b, tw, tf, r, A, G] of EN_I) {
    add({ name: n, family: n.slice(0, 3), kind: 'I', source: 'en', d: h, bf: b, tw, tf, r,
      areaPub: A * 100, massPub: G, pub: { units: 'mm', h, b, tw, tf, r, A, G } });
  }
  return out;
}

export const CATALOG = build();

/** Catalog groups for pickers: [{label, source, names[]}] in a sensible order. */
export function catalogGroups(custom = []) {
  const groups = [
    [t('prof.group.w'), 'W'], [t('prof.group.c'), 'C'], [t('prof.group.l'), 'L'], ['HSS', 'HSS'],
    ['IPE', 'IPE'], ['HEA', 'HEA'], ['HEB', 'HEB'],
  ].map(([label, fam]) => {
    const names = [...CATALOG.values()].filter((p) => p.family === fam).map((p) => p.name);
    const src = CATALOG.get(names[0].toUpperCase()).source;
    return { label, source: SOURCES[src], names };
  });
  if (custom.length) groups.push({ label: t('prof.group.custom'), source: SOURCES.custom, names: custom.map((c) => c.name) });
  return groups;
}

const PL_RE = /^PL\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)$/;
/** "PL20x200" = 20 mm thick, 200 mm wide. */
export function plateName(t, w) { return 'PL' + num(t) + 'x' + num(w); }
const num = (v) => String(Number(Number(v).toFixed(2)));

export const CUSTOM_KINDS = {
  I: ['d', 'bf', 'tw', 'tf', 'r'],
  C: ['d', 'bf', 'tw', 'tf'],
  L: ['b', 't'],
  RHS: ['h', 'b', 't'],
  CHS: ['D', 't'],
  FLAT: ['b', 't'],
};

/** Checks a custom profile definition (untrusted: from a file or a form). Returns { ok, profile | error }. */
export function cleanCustom(c) {
  if (!c || typeof c !== 'object') return { ok: false, error: t('prof.err.not-profile') };
  const name = String(c.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  if (!name) return { ok: false, error: t('prof.err.name') };
  if (CATALOG.has(name.toUpperCase()) || PL_RE.test(name)) return { ok: false, error: t('prof.err.catalog-name', { name }) };
  const kind = String(c.kind || '');
  if (!CUSTOM_KINDS[kind]) return { ok: false, error: t('prof.err.shape', { kind }) };
  const p = { name, kind, family: 'custom', source: 'custom' };
  for (const k of CUSTOM_KINDS[kind]) {
    const v = Number(c[k]);
    if (!Number.isFinite(v) || v < 0 || v > 5000 || (k !== 'r' && v === 0)) return { ok: false, error: t('prof.err.size', { name: k }) };
    p[k] = v;
  }
  if (kind === 'I' || kind === 'C') {
    if (p.tw >= p.bf || 2 * p.tf >= p.d) return { ok: false, error: t('prof.err.web-flanges') };
    if (kind === 'I' && p.tw / 2 + p.r > p.bf / 2) return { ok: false, error: t('prof.err.fillet-flange') };
    if (kind === 'I' && 2 * (p.tf + p.r) >= p.d) return { ok: false, error: t('prof.err.fillet-depth') };
  }
  if (kind === 'L' && p.t >= p.b) return { ok: false, error: t('prof.err.leg') };
  if (kind === 'RHS') { if (2 * p.t >= Math.min(p.h, p.b)) return { ok: false, error: t('prof.err.wall') }; p.ro = 2 * p.t; p.ri = p.t; }
  if (kind === 'CHS' && 2 * p.t >= p.D) return { ok: false, error: t('prof.err.wall') };
  return { ok: true, profile: p };
}

/** Resolves a profile name against the catalog, plates and the model's custom profiles. Null if unknown. */
export function getProfile(name, custom = []) {
  if (typeof name !== 'string') return null;
  const key = name.trim().toUpperCase();
  const cat = CATALOG.get(key);
  if (cat) return withDerived(cat);
  const m = name.trim().match(PL_RE);
  if (m) {
    const t = Number(m[1]), w = Number(m[2]);
    if (t > 0 && w > 0 && t <= 500 && w <= 5000) return withDerived({ name: plateName(t, w), family: 'PL', kind: 'PL', source: 'param', t, b: w });
    return null;
  }
  const c = custom.find((x) => x.name.toUpperCase() === key);
  if (c) {
    const k = c.kind === 'FLAT' ? { ...c, kind: 'PL' } : c;
    return withDerived(k);
  }
  return null;
}

const derived = new WeakMap();
function withDerived(p) {
  if (derived.has(p)) return derived.get(p);
  const q = { ...p };
  q.loops = outline(q);
  q.area = exactArea(q);
  q.mass = q.massPub ?? q.area * 1e-6 * STEEL_DENSITY;        // kg/m: published where there is one
  q.massFrom = q.massPub !== undefined ? SOURCES[q.source] : 'Area × ' + STEEL_DENSITY + ' kg/m³';
  const bb = bbox(q.loops[0]);
  q.width = bb.w; q.depth = bb.h;
  q.perimeter = loopLength(q.loops[0]);
  q.label = q.name;
  Object.freeze(q);
  if (Object.isFrozen(p)) derived.set(p, q);
  return q;
}

/** Exact section area (mm²) from the dimensions (arcs included exactly). */
export function exactArea(p) {
  switch (p.kind) {
    case 'I': return 2 * p.bf * p.tf + (p.d - 2 * p.tf) * p.tw + (4 - Math.PI) * p.r * p.r;
    case 'C': return 2 * p.bf * p.tf + (p.d - 2 * p.tf) * p.tw;
    case 'L': return p.t * (2 * p.b - p.t);
    case 'RHS': return 2 * p.t * (p.h + p.b - 2 * p.t) - (4 - Math.PI) * (p.ro * p.ro - p.ri * p.ri);
    case 'CHS': return Math.PI * (p.D - p.t) * p.t;
    case 'PL': return p.t * p.b;
    default: return 0;
  }
}

/**
 * Section outline as loops of [u, v] (first loop outer CCW, others holes CW), centered on the bounding box.
 * Plates: width along u, thickness along v. Angles: legs along +u and +v from the heel (before centering).
 */
export function outline(p, seg = 6) {
  const arc = (pts, cx, cy, r, a0, a1, n = seg) => { for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  const H = Math.PI / 2;
  if (p.kind === 'I') {
    const { d, bf, tw, tf, r } = p, a = bf / 2, w = tw / 2, h = d / 2;
    const P = [[-a, -h], [a, -h], [a, -h + tf]];
    if (r > 0) { P.push([w + r, -h + tf]); arc(P, w + r, -h + tf + r, r, -H, -2 * H); P.push([w, -h + tf + r]); P.push([w, h - tf - r]); arc(P, w + r, h - tf - r, r, 2 * H, H); P.push([w + r, h - tf]); }
    else P.push([w, -h + tf], [w, h - tf]);
    P.push([a, h - tf], [a, h], [-a, h], [-a, h - tf]);
    if (r > 0) { P.push([-w - r, h - tf]); arc(P, -w - r, h - tf - r, r, H, 0); P.push([-w, h - tf - r]); P.push([-w, -h + tf + r]); arc(P, -w - r, -h + tf + r, r, 0, -H); P.push([-w - r, -h + tf]); }
    else P.push([-w, h - tf], [-w, -h + tf]);
    P.push([-a, -h + tf]);
    return [P];
  }
  if (p.kind === 'C') {   // web on the −u side (as IfcUShapeProfileDef), flanges toward +u
    const { d, bf, tw, tf } = p, a = bf / 2, h = d / 2;
    return [[[-a, -h], [a, -h], [a, -h + tf], [-a + tw, -h + tf], [-a + tw, h - tf], [a, h - tf], [a, h], [-a, h]]];
  }
  if (p.kind === 'L') {   // heel at (−b/2, −b/2): one leg along +u (horizontal), one along +v
    const { b, t } = p, a = b / 2;
    return [[[-a, -a], [a, -a], [a, -a + t], [-a + t, -a + t], [-a + t, a], [-a, a]]];
  }
  if (p.kind === 'RHS') {
    const { h, b, t, ro, ri } = p;
    return [roundedRect(b, h, ro, seg, false), roundedRect(b - 2 * t, h - 2 * t, ri, seg, true)];
  }
  if (p.kind === 'CHS') {
    const n = seg * 8, R = p.D / 2, r = R - p.t, o = [], i = [];
    for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; o.push([R * Math.cos(a), R * Math.sin(a)]); i.push([r * Math.cos(-a), r * Math.sin(-a)]); }
    return [o, i];
  }
  if (p.kind === 'PL') {
    const a = p.b / 2, c = p.t / 2;
    return [[[-a, -c], [a, -c], [a, c], [-a, c]]];
  }
  return [[]];
}

function roundedRect(w, h, r, seg, cw) {
  const a = w / 2, b = h / 2, pts = [];
  const corners = [[a - r, -b + r, -Math.PI / 2], [a - r, b - r, 0], [-a + r, b - r, Math.PI / 2], [-a + r, -b + r, Math.PI]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= seg; i++) { const t = a0 + (Math.PI / 2) * i / seg; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return cw ? pts.reverse() : pts;
}

export function bbox(loop) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of loop) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export function shoelace(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}
export function loopLength(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i++) { const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length]; s += Math.hypot(x2 - x1, y2 - y1); }
  return s;
}

/** Which hole faces a profile has (see geom.js holeFrame). */
export function holeFaces(p) {
  if (!p) return [];
  if (p.kind === 'I' || p.kind === 'C') return ['web', 'top', 'bottom'];
  if (p.kind === 'RHS') return ['web', 'top', 'bottom'];
  if (p.kind === 'PL') return ['plate'];
  return [];
}

/** Thickness a hole on a face goes through. */
export function faceThickness(p, face) {
  if (p.kind === 'PL' || p.kind === 'L') return p.t;                // an angle's legs (connection holes only: 'bottom' = the leg along u, 'web' = along v)
  if (face === 'web') return p.kind === 'RHS' ? p.b : p.tw;
  if (p.kind === 'RHS') return p.t;
  return p.tf;
}

/** Profile summary in published units for the properties panel. */
export function describe(p) {
  const KIND = { I: 'i', C: 'c', L: 'l', RHS: 'rhs', CHS: 'chs', PL: 'pl' };
  const L = (k) => t('prof.row.' + k);
  const rows = [[L('shape'), KIND[p.kind] ? t('prof.kind.' + KIND[p.kind]) : p.kind]];
  const mm = (v) => Number(v.toFixed(1)) + ' mm';
  if (p.kind === 'I' || p.kind === 'C') rows.push([L('depth'), mm(p.d)], [L('flange-width'), mm(p.bf)], [L('web'), mm(p.tw)], [L('flange'), mm(p.tf)]);
  if (p.kind === 'I') rows.push([L('fillet'), mm(p.r) + (p.source === 'aisc' ? ' (kdes − tf)' : '')]);   // i18n-ignore (symbols)
  if (p.kind === 'L') rows.push([L('legs'), mm(p.b) + ' × ' + mm(p.b)], [L('thickness'), mm(p.t)]);
  if (p.kind === 'RHS') rows.push([L('size'), mm(p.h) + ' × ' + mm(p.b)], [L('wall'), mm(p.t)]);
  if (p.kind === 'CHS') rows.push([L('diameter'), mm(p.D)], [L('wall'), mm(p.t)]);
  if (p.kind === 'PL') rows.push([L('thickness'), mm(p.t)], [L('width'), mm(p.b)]);
  rows.push([L('area'), Number((p.area / 100).toFixed(2)) + ' cm²'], [L('mass'), Number(p.mass.toFixed(2)) + ' kg/m'], [L('from'), p.massPub !== undefined ? SOURCES[p.source] : SOURCES[p.source] || '']);
  return rows;
}
