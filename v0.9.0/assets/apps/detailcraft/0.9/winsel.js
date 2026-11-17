/* SPDX-License-Identifier: Apache-2.0 */
/**
 * winsel.js — window and crossing selection in the 3D view, plan and elevation (0.4 D1). No DOM.
 *
 *   selectionItems(state, built, hiddenPhases?) → [{ ref, segs: [[a, b], …] }]   (parts in hidden phases left out)   each part's box (section width × depth along its
 *       cut length, 12 edges, mm) — members, connection plates (ref = the connection) and footings (with their bars'
 *       reach); bolts are not selected by a window
 *   windowSelect(items, project, path, mode, planes) → refs
 *       project(p) → { x, y, behind }   screen point of a model point (the view's camera)
 *       path   the window as screen points: a rectangle's four corners (or a lasso's path)
 *       mode   'window' (wholly inside), 'crossing' (inside or touching), 'fence'
 *       planes [{ n: [x, y, z], d }]    the view's cut: n·p + d ≥ 0 is kept (plan: above a level is cut away;
 *              elevation: ±1 m of the grid line). Edges are clipped to it first, so a part cut away is not picked
 *              and a column cut by a plan is judged by the piece that shows.
 * Uses lasso-core.js (the shared copy) for the inside / touching tests.
 */
import { lassoSelect } from './lasso-core.js';

const corner = (o, x, u, v, a, b, c) => [0, 1, 2].map((i) => o[i] + x[i] * a + u[i] * b + v[i] * c);
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

/** The 12 edges of a box given by a frame and ranges along x, u, v. */
export function boxSegs(o, x, u, v, [x0, x1], [u0, u1], [v0, v1]) {
  const k = [[x0, u0, v0], [x0, u1, v0], [x0, u1, v1], [x0, u0, v1], [x1, u0, v0], [x1, u1, v0], [x1, u1, v1], [x1, u0, v1]].map(([a, b, c]) => corner(o, x, u, v, a, b, c));
  return EDGES.map(([i, j]) => [k[i], k[j]]);
}

export function selectionItems(state, built, hiddenPhases = null) {
  const items = [], byRef = new Map();
  const push = (ref, segs) => {
    const key = ref.kind + ':' + ref.id;
    if (byRef.has(key)) byRef.get(key).segs.push(...segs);
    else { const it = { ref, segs }; byRef.set(key, it); items.push(it); }
  };
  const shown = (ph) => !hiddenPhases || !hiddenPhases.has(ph || 1);
  for (const p of built.parts) {
    if (!shown(p.phase)) continue;
    const f = p.frame, w = p.profile.width / 2, h = p.profile.depth / 2;
    const segs = boxSegs(f.o, f.x, f.u, f.v, [0, p.length], [-w, w], [p.voff - h, p.voff + h]);
    push(p.member ? { kind: 'member', id: p.member } : p.stair ? { kind: 'stair', id: p.stair } : { kind: 'conn', id: p.conn }, segs);
  }
  for (const f of state.footings) {
    if (!shown(f.phase)) continue;
    const a = (Number(f.rotation) || 0) * Math.PI / 180;
    const x = [Math.cos(a), Math.sin(a), 0], u = [-Math.sin(a), Math.cos(a), 0];
    const top = f.starters?.on ? f.top + (Number(f.starters.projection) || 0) : f.top;
    push({ kind: 'footing', id: f.id }, boxSegs([f.x, f.y, 0], x, u, [0, 0, 1], [-f.L / 2, f.L / 2], [-f.B / 2, f.B / 2], [f.top - f.H, top]));
  }
  return items;
}

const side = (pl, p) => pl.n[0] * p[0] + pl.n[1] * p[1] + pl.n[2] * p[2] + pl.d;

/** A segment clipped to every plane's kept side, or null. */
export function clipSeg(a, b, planes = []) {
  let t0 = 0, t1 = 1;
  for (const pl of planes) {
    const da = side(pl, a), db = side(pl, b);
    if (da < 0 && db < 0) return null;
    if (da >= 0 && db >= 0) continue;
    const t = da / (da - db);
    if (da < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  const at = (t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
  return [at(t0), at(t1)];
}

export function windowSelect(items, project, path, mode, planes = []) {
  const flat = [];
  for (const it of items) {
    const segs = [];
    for (const [a, b] of it.segs) {
      const c = clipSeg(a, b, planes);
      if (!c) continue;
      const p = project(c[0]), q = project(c[1]);
      if (p.behind || q.behind) continue;
      segs.push([p.x, p.y, q.x, q.y]);
    }
    if (!segs.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x1, y1, x2, y2] of segs) { minX = Math.min(minX, x1, x2); minY = Math.min(minY, y1, y2); maxX = Math.max(maxX, x1, x2); maxY = Math.max(maxY, y1, y2); }
    flat.push({ ref: it.ref, segs, box: { minX, minY, maxX, maxY } });
  }
  return lassoSelect(flat, path, mode, { box: (it) => it.box, segs: (it) => it.segs, filled: () => true }).map((it) => it.ref);   // parts are solid: a crossing drawn inside one touches it
}

/** The four corners of a screen rectangle from two points (a window path). */
export function rectPath(a, b) {
  return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
}
