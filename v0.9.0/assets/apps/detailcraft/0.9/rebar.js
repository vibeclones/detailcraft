/* SPDX-License-Identifier: Apache-2.0 */
/**
 * rebar.js — reinforcing bars in a rectangular pad footing: bar sizes, the bottom mat both ways,
 * starter bars, bend geometry, bar marks and the bending schedule. No DOM. Millimeters.
 *
 * Bar sizes: ASTM A615/A615M-22 Table 1, inch-pound bar designations #3–#11 — nominal diameter (in)
 * and nominal weight (lb/ft); millimeters and kg/m are exact conversions of those.
 * Bends: ACI 318-19 Table 25.3.1 (standard hooks) — 90° hook: inside bend diameter 6·db for #3–#8,
 * 8·db for #9–#11, straight extension 12·db past the bend.
 * Clear spacing check: ACI 318-19 25.2.1 — at least the greater of 1 in. (25.4 mm) and db (the
 * aggregate-size term is not checked: DetailCraft does not know the mix).
 *
 * Metric bars (0.4 D9): BS 4449 B500 H8–H40 — nominal mass = the nominal section × 7850 kg/m³; bends and hooks to
 * BS 8666:2020 "Table of minimum dimensions" (minimum scheduling radius r, former diameter 2r, minimum end projection P,
 * general, at least 5d straight), as printed in Stainless UK's BS 8666:2020 shape code chart. A hook leg is P, out-to-out.
 * ASTM bars can be named by their soft-metric A615M designations (#3 = #10 … #11 = #36, as ACI 315-99 Table 1 lists).
 *
 * Shapes (stored as DetailCraft's codes):
 *   S  straight                         A
 *   L  one 90° bend                     A (main leg) + B (hook leg), out-to-out
 *   U  two 90° bends, same side         A (middle) + B + C (legs), out-to-out
 * In a schedule they print as DetailCraft's S / L / U, ACI 315 types or BS 8666 shape codes (shapeCode):
 *   BS 8666:2020  S → 00 (L = A), L → 11 (L = A + B − 0.5r − d), U → 21 (A, B, C with B the middle: L = A + B + C − r − 2d)
 *   ACI 315-99 Fig. 10  U with standard hooks both ends → Type 2 (A, B, G); a straight bar and a one-hook bar have no type
 *                       number in that figure and print without one
 * Cut length: ASTM bars = the bar's exact centerline (straight parts + arcs at radius D/2 + db/2); BS bars = the
 * BS 8666 formula above (what a bending schedule to that standard gives the bender).
 */
import { t } from './i18n.js';

// ASTM A615 Table 1: [designation, nominal diameter in, nominal weight lb/ft, nominal area in²]
const A615 = [
  ['#3', 0.375, 0.376, 0.11],
  ['#4', 0.500, 0.668, 0.20],
  ['#5', 0.625, 1.043, 0.31],
  ['#6', 0.750, 1.502, 0.44],
  ['#7', 0.875, 2.044, 0.60],
  ['#8', 1.000, 2.670, 0.79],
  ['#9', 1.128, 3.400, 1.00],
  ['#10', 1.270, 4.303, 1.27],
  ['#11', 1.410, 5.313, 1.56],
];
export const BAR_SOURCE = 'ASTM A615/A615M Table 1';
export const BAR_SOURCE_BS = 'BS 4449 B500, BS 8666:2020';
export const BARS = new Map(A615.map(([n, d, w, a]) => [n, Object.freeze({
  name: n, num: Number(n.slice(1)), db: d * 25.4, mass: w * 1.48816394, area: a * 645.16,
  bendD: (Number(n.slice(1)) <= 8 ? 6 : 8) * d * 25.4,       // ACI 318-19 Table 25.3.1
  pub: { d, w, a }, set: 'astm', markPre: n.slice(1), metric: '#' + Math.round(d * 25.4),
})]));
// BS 8666:2020 table of minimum dimensions: [d, minimum scheduling radius r, minimum end projection P (general)]
const BS8666 = [[6, 12, 110], [8, 16, 115], [10, 20, 120], [12, 24, 125], [16, 32, 130], [20, 70, 190], [25, 87, 240], [32, 112, 305], [40, 140, 380], [50, 175, 475]];
for (const [d, r, P] of BS8666) {
  if (d < 8 || d > 40) continue;                              // BS 4449 bar sizes used here: 8–40 mm
  const area = Math.PI * d * d / 4;
  BARS.set('H' + d, Object.freeze({ name: 'H' + d, num: d, db: d, mass: area * 7850 * 1e-6, area, bendD: 2 * r, r, P, set: 'bs', markPre: 'H' + d, metric: 'H' + d }));
}
export const BAR_SETS = { astm: [...BARS.values()].filter((b) => b.set === 'astm').map((b) => b.name), bs: [...BARS.values()].filter((b) => b.set === 'bs').map((b) => b.name) };
/** A bar's name as shown: ASTM bars as #5 or (soft metric) #16; BS bars as H16. */
export const barLabel = (name, naming = 'imperial') => { const b = BARS.get(name); return b && naming === 'metric' ? b.metric : name; };
/** A shape's code in a schedule: 'dc' (S / L / U), 'aci' (ACI 315-99 Fig. 10), 'bs8666'. */
export function shapeCode(shape, standard = 'dc') {
  if (standard === 'bs8666') return { S: '00', L: '11', U: '21' }[shape] || shape;
  if (standard === 'aci') return shape === 'U' ? '2' : '';
  return shape;
}
/** The schedule's A, B, C in the chosen standard's order (BS 8666 shape 21 has the middle as B). */
export function scheduleDims(shape, dims, standard = 'dc') {
  if (standard === 'bs8666' && shape === 'U') return { A: dims.B, B: dims.A, C: dims.C };
  if (standard === 'aci' && shape === 'U') return { A: dims.B, B: dims.A, C: dims.C };   // ACI Type 2: A (hook), B (straight), G (hook)
  return dims;
}

export const FOOTING_DEFAULTS = Object.freeze({
  x: 0, y: 0, top: 0, L: 2000, B: 2000, H: 600, rotation: 0, concrete: '4000 psi',
  mat: Object.freeze({ barX: '#5', sX: 250, barY: '#5', sY: 250, cover: 75, hooks: true }),
  starters: Object.freeze({ on: true, bar: '#6', nx: 2, ny: 2, sx: 250, sy: 250, projection: 600, hook: true }),
});

const SIZE_KEYS = { L: 'rebar.err.length', B: 'rebar.err.width', H: 'rebar.err.depth' };
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

/** Checks a footing (untrusted). { ok, footing } or { ok:false, error }. Cover and spacing are checked here. */
export function cleanFooting(f) {
  if (!f || typeof f !== 'object') return { ok: false, error: t('rebar.err.not-footing') };
  const out = {};
  for (const [k, lo, hi] of [['x', -1e7, 1e7], ['y', -1e7, 1e7], ['top', -1e6, 1e6], ['L', 300, 50000], ['B', 300, 50000], ['H', 150, 10000], ['rotation', -360, 360]]) {
    const v = num(f[k], lo, hi);
    if (v === null) return { ok: false, error: SIZE_KEYS[k] ? t(SIZE_KEYS[k], { lo, hi }) : t('rebar.err.position', { name: k }) };
    out[k] = v;
  }
  out.concrete = String(f.concrete ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 30) || '4000 psi';
  const m = f.mat || {}, s = f.starters || {};
  const mat = { barX: String(m.barX), sX: num(m.sX, 50, 1000), barY: String(m.barY), sY: num(m.sY, 50, 1000), cover: num(m.cover, 20, 300), hooks: !!m.hooks };
  if (!BARS.has(mat.barX) || !BARS.has(mat.barY)) return { ok: false, error: t('rebar.err.bar-size') };
  if (mat.sX === null || mat.sY === null) return { ok: false, error: t('rebar.err.spacing') };
  if (mat.cover === null) return { ok: false, error: t('rebar.err.cover') };
  const st = { on: !!s.on, bar: String(s.bar), nx: num(s.nx, 1, 20), ny: num(s.ny, 1, 20), sx: num(s.sx, 50, 5000), sy: num(s.sy, 50, 5000), projection: num(s.projection, 0, 5000), hook: !!s.hook };
  if (!BARS.has(st.bar)) return { ok: false, error: t('rebar.err.starter-size') };
  if ([st.nx, st.ny, st.sx, st.sy, st.projection].some((v) => v === null)) return { ok: false, error: t('rebar.err.starters') };
  st.nx = Math.round(st.nx); st.ny = Math.round(st.ny);
  out.mat = mat; out.starters = st;
  const footing = out;
  const problems = footingProblems(footing);
  const hard = problems.find((p) => p.hard);
  if (hard) return { ok: false, error: hard.text };
  return { ok: true, footing };
}

/** Cover, fit and spacing checks: [{ text, hard }] (hard = cannot be built at all). */
export function footingProblems(f) {
  const out = [];
  const bx = BARS.get(f.mat.barX), by = BARS.get(f.mat.barY), c = f.mat.cover;
  if (f.L - 2 * c <= bx.db * 2 || f.B - 2 * c <= by.db * 2) out.push({ hard: true, text: t('rebar.warn.no-room') });
  if (f.H - 2 * c <= bx.db + by.db) out.push({ hard: true, text: t('rebar.warn.shallow') });
  const minClear = (b) => (b.set === 'bs' ? Math.max(20, b.db) : Math.max(25.4, b.db));   // ACI 318-19 25.2.1; EN 1992-1-1 8.2 (aggregate not checked)
  const lx = layout(f.B - 2 * c - bx.db, f.mat.sX), ly = layout(f.L - 2 * c - by.db, f.mat.sY);
  if (lx.spacing - bx.db < minClear(bx) - 1e-6) out.push({ text: t('rebar.warn.clear', { bar: f.mat.barX, spacing: r1(lx.spacing), min: r1(minClear(bx)) }) });
  if (ly.spacing - by.db < minClear(by) - 1e-6) out.push({ text: t('rebar.warn.clear', { bar: f.mat.barY, spacing: r1(ly.spacing), min: r1(minClear(by)) }) });
  if (f.mat.hooks) {
    const room = f.H - 2 * c;
    for (const b of [bx, by]) if (hookLeg(b) > room + 1e-6) out.push({ text: t('rebar.warn.hooks', { bar: b.name, need: r1(hookLeg(b)), room: r1(room) }) });
  }
  if (f.starters.on) {
    const s = f.starters, sb = BARS.get(s.bar);
    const ex = (s.nx - 1) * s.sx / 2 + sb.db / 2, ey = (s.ny - 1) * s.sy / 2 + sb.db / 2;
    if (ex > f.L / 2 - c || ey > f.B / 2 - c) out.push({ hard: true, text: t('rebar.warn.starters-fit', { cover: c }) });
    if (s.hook && Math.max(ex, ey) + hookLeg(sb) - sb.db / 2 > Math.max(f.L, f.B) / 2 - c) out.push({ text: t('rebar.warn.starter-hooks') });
    if (s.nx > 1 && s.sx - sb.db < minClear(sb)) out.push({ text: t('rebar.warn.starter-clear') });
    if (s.ny > 1 && s.sy - sb.db < minClear(sb)) out.push({ text: t('rebar.warn.starter-clear') });
  }
  return out;
}
const r1 = (v) => Number(v.toFixed(1));

/** n bars evenly over a width w (bar centers), spacing no more than s. */
export function layout(w, s) {
  const n = Math.max(2, Math.ceil(w / s - 1e-9) + 1);
  return { n, spacing: w / (n - 1) };
}
/** Out-to-out length of a standard 90° hook leg: ACI 318-19 Table 25.3.1 D/2 + db + 12·db; BS 8666 the end projection P. */
export function hookLeg(b) { return b.set === 'bs' ? b.P : b.bendD / 2 + b.db + 12 * b.db; }

/** Centerline cut length of a shape with out-to-out dims. */
export function cutLength(shape, dims, b) {
  const k = b.bendD / 2 + b.db, rc = b.bendD / 2 + b.db / 2;
  if (shape === 'S') return dims.A;
  if (b.set === 'bs') {                                         // BS 8666:2020 shape codes 11 and 21
    if (shape === 'L') return dims.A + dims.B - 0.5 * b.r - b.db;
    if (shape === 'U') return dims.A + dims.B + dims.C - b.r - 2 * b.db;
  }
  if (shape === 'L') return dims.A + dims.B - 2 * k + Math.PI / 2 * rc;
  if (shape === 'U') return dims.A + dims.B + dims.C - 4 * k + Math.PI * rc;
  throw new Error(t('rebar.err.shape', { shape }));
}

/**
 * Centerline of a bar in its own plane: s along A, t toward the bends' side. Returns
 * [{ k:'L', a:[s,t], b:[s,t] } | { k:'A', a, m, b, c:[s,t], r }] from one end to the other.
 * U: legs up at both ends; L: the hook leg at the s = A end (main leg along s).
 */
export function centerline2d(shape, dims, b) {
  const h = b.db / 2, rc = b.bendD / 2 + h, A = dims.A;
  const arc = (c, a0, a1) => ({ k: 'A', c, r: rc, a: [c[0] + rc * Math.cos(a0), c[1] + rc * Math.sin(a0)], m: [c[0] + rc * Math.cos((a0 + a1) / 2), c[1] + rc * Math.sin((a0 + a1) / 2)], b: [c[0] + rc * Math.cos(a1), c[1] + rc * Math.sin(a1)] });
  if (shape === 'S') return [{ k: 'L', a: [0, h], b: [A, h] }];
  const segs = [];
  if (shape === 'U') {
    const c1 = [h + rc, h + rc];
    segs.push({ k: 'L', a: [h, dims.B - 0], b: [h, h + rc] });
    segs.push(arc(c1, Math.PI, 1.5 * Math.PI));
    segs.push({ k: 'L', a: [h + rc, h], b: [A - h - rc, h] });
  } else segs.push({ k: 'L', a: [0, h], b: [A - h - rc, h] });
  const c2 = [A - h - rc, h + rc];
  segs.push(arc(c2, 1.5 * Math.PI, 2 * Math.PI));
  const legEnd = shape === 'U' ? dims.C : dims.B;
  segs.push({ k: 'L', a: [A - h, h + rc], b: [A - h, legEnd] });
  return segs;
}
export function centerlineLength(segs) {
  let s = 0;
  for (const g of segs) s += g.k === 'L' ? Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) : g.r * Math.PI / 2;
  return s;
}

/**
 * Every bar in a footing: [{ role, bar, shape, dims, count, length, sets: [{ origin:[x,y,z], sDir, tDir }] }]
 * Each set places the 2D centerline: world = origin + s·sDir + t·tDir.
 */
export function footingBars(f) {
  const out = [];
  const rot = (f.rotation || 0) * Math.PI / 180, ex = [Math.cos(rot), Math.sin(rot), 0], ey = [-Math.sin(rot), Math.cos(rot), 0], ez = [0, 0, 1];
  const P = (lx, ly, z) => [f.x + ex[0] * lx + ey[0] * ly, f.y + ex[1] * lx + ey[1] * ly, z];
  const bottom = f.top - f.H, c = f.mat.cover;
  const bx = BARS.get(f.mat.barX), by = BARS.get(f.mat.barY);
  // bottom layer: bars along local X (outermost), then bars along local Y on top of them
  const layer = (b, along, across, runLen, acrossLen, s, zBottom, role) => {
    const A = runLen - 2 * c;
    const hooks = f.mat.hooks;
    const room = f.H - 2 * c - (zBottom - (bottom + c));
    const B = hooks ? Math.min(hookLeg(b), room) : 0;
    const shape = hooks ? 'U' : 'S';
    const dims = hooks ? { A, B, C: B } : { A };
    const lay = layout(acrossLen - 2 * c - b.db, s);
    const sets = [];
    for (let i = 0; i < lay.n; i++) {
      const off = -acrossLen / 2 + c + b.db / 2 + i * lay.spacing;
      const o = along === 'x' ? P(-runLen / 2 + c, off, zBottom) : P(off, -runLen / 2 + c, zBottom);
      sets.push({ origin: o, sDir: along === 'x' ? ex : ey, tDir: ez });
    }
    out.push({ role, bar: b.name, shape, dims, count: lay.n, spacing: lay.spacing, length: cutLength(shape, dims, b), sets });
  };
  layer(bx, 'x', 'y', f.L, f.B, f.mat.sX, bottom + c, t('rebar.role.bottom-long'));
  layer(by, 'y', 'x', f.B, f.L, f.mat.sY, bottom + c + bx.db, t('rebar.role.bottom-short'));
  if (f.starters.on) {
    const s = f.starters, b = BARS.get(s.bar);
    const z0 = bottom + c + bx.db + by.db;                 // sitting on the mat
    const A = f.top + s.projection - z0;                  // out-to-out, vertical
    const shape = s.hook ? 'L' : 'S';
    const dims = s.hook ? { A, B: hookLeg(b) } : { A };
    const sets = [];
    for (let i = 0; i < s.nx; i++) for (let j = 0; j < s.ny; j++) {
      const lx = (i - (s.nx - 1) / 2) * s.sx, ly = (j - (s.ny - 1) / 2) * s.sy;
      // hook points outward, along local X (or Y when the bar is further out that way)
      let hd = Math.abs(lx) >= Math.abs(ly) ? (lx >= 0 ? ex : ex.map((v) => -v)) : (ly >= 0 ? ey : ey.map((v) => -v));
      if (Math.abs(lx) < 1e-9 && Math.abs(ly) < 1e-9) hd = ex;
      // L shape: main leg along s (here: down from the top), hook at s = A turning toward t = hook direction.
      // The bar's centerline is drawn from its top (s = 0) down to the bend; the bar axis sits at (lx, ly).
      const top = P(lx, ly, z0 + A);
      sets.push({ origin: [top[0] - hd[0] * b.db / 2, top[1] - hd[1] * b.db / 2, top[2]], sDir: [0, 0, -1], tDir: hd });
    }
    out.push({ role: t('rebar.role.starters'), bar: s.bar, shape, dims, count: s.nx * s.ny, length: cutLength(shape, dims, b), sets });
  }
  return out;
}

/** World polyline (with arcs tessellated, `seg` per bend) of one placed bar. */
export function barPolyline(group, set, seg = 6) {
  const b = BARS.get(group.bar);
  const segs = centerline2d(group.shape, group.dims, b);
  const W = ([s, t]) => [set.origin[0] + set.sDir[0] * s + set.tDir[0] * t, set.origin[1] + set.sDir[1] * s + set.tDir[1] * t, set.origin[2] + set.sDir[2] * s + set.tDir[2] * t];
  const pts = [W(segs[0].a)];
  for (const g of segs) {
    if (g.k === 'L') pts.push(W(g.b));
    else {
      const a0 = Math.atan2(g.a[1] - g.c[1], g.a[0] - g.c[0]), a1 = Math.atan2(g.b[1] - g.c[1], g.b[0] - g.c[0]);
      let d = a1 - a0; if (d < -Math.PI) d += 2 * Math.PI; if (d > Math.PI) d -= 2 * Math.PI;
      for (let i = 1; i <= seg; i++) { const a = a0 + d * i / seg; pts.push(W([g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)])); }
    }
  }
  return pts;
}

/** Concrete volume (m³). */
export const footingVolume = (f) => f.L * f.B * f.H * 1e-9;

/**
 * Bar marks across all footings: identical bars (size, shape, dims to the mm) share a mark "<size>F<n>".
 * Returns { rows (bending schedule), byFooting: Map(footingId → [{ group, mark }]) }.
 */
export function bendingSchedule(footings) {
  const marks = new Map();
  const rows = [];
  const byFooting = new Map();
  const counters = new Map();
  for (const f of footings) {
    const list = [];
    for (const g of footingBars(f)) {
      const b = BARS.get(g.bar);
      const key = [g.bar, g.shape, ...['A', 'B', 'C'].map((k) => g.dims[k] === undefined ? '' : Math.round(g.dims[k]))].join('|');
      let row = marks.get(key);
      if (!row) {
        const n = (counters.get(b.markPre) || 0) + 1;
        counters.set(b.markPre, n);
        row = { mark: b.markPre + 'F' + n, bar: g.bar, shape: g.shape, dims: { ...g.dims }, count: 0, length: g.length, mass: b.mass, roles: new Set() };
        marks.set(key, row);
        rows.push(row);
      }
      row.count += g.count;
      row.roles.add(g.role);
      list.push({ group: g, mark: row.mark });
    }
    byFooting.set(f.id, list);
  }
  for (const r of rows) {
    r.totalLength = r.length * r.count;
    r.unitWeight = r.mass * r.length / 1000;
    r.totalWeight = r.unitWeight * r.count;
    r.roles = [...r.roles];
  }
  return { rows, byFooting };
}

/** Bending schedule as CSV rows (header first). */
export function scheduleTable(rows, { codes = 'dc', naming = 'imperial' } = {}) {
  const mm = (v) => v === undefined ? '' : String(Math.round(v));
  const head = ['mark', 'size', 'shape', 'a', 'b', 'c', 'count', 'cut', 'total-length', 'kg-m', 'weight-each', 'total-weight', 'used-for'].map((k) => t('rebar.col.' + k));
  const body = rows.map((r) => { const d = scheduleDims(r.shape, r.dims, codes); return [r.mark, barLabel(r.bar, naming), shapeCode(r.shape, codes), mm(d.A), mm(d.B), mm(d.C), String(r.count), mm(r.length),
    (r.totalLength / 1000).toFixed(2), r.mass.toFixed(3), r.unitWeight.toFixed(2), r.totalWeight.toFixed(1), r.roles.join('; ')]; });
  const total = rows.reduce((s, r) => s + r.totalWeight, 0);
  body.push([t('rebar.total'), '', '', '', '', '', String(rows.reduce((s, r) => s + r.count, 0)), '', (rows.reduce((s, r) => s + r.totalLength, 0) / 1000).toFixed(2), '', '', total.toFixed(1), '']);
  return [head, ...body];
}
