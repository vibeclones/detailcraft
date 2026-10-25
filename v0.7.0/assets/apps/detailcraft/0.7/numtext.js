/* SPDX-License-Identifier: Apache-2.0 */
/**
 * numtext.js — what a person types into a number box of DetailCraft's panels (0.6 DF.3): a number, a fraction (1/2, 6-1/2,
 * 6 1/2) or arithmetic over them (2*450, 4500/3, (1200-2*25)/2) through lencalc.js (a copy of CadCraft's: never eval,
 * tools/lencalc/sync.mjs). DOM-free; tools/lencalc/test.mjs runs it.
 *
 *   readNum(raw) → { ok: true, value } | { ok: false, code, pos, text }   (lencalc.js codes; the panel words them calc.err.*)
 */
import { calc } from './lencalc.js';

const NUM = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;

/** One number as typed: 12, 12.5, 1/2, 6-1/2, 6 1/2 → its value, else null. */
function one(s) {
  const t = String(s).trim();
  let m;
  if (NUM.test(t)) return +t;
  if ((m = /^(\d+)[- ](\d+)\/(\d+)$/.exec(t)) && +m[3] > 0) return +m[1] + m[2] / m[3];
  if ((m = /^(\d+)\/(\d+)$/.exec(t)) && +m[2] > 0) return m[1] / m[2];
  return null;
}

export function readNum(raw) {
  const r = calc(String(raw ?? '').trim(), (x) => { const v = one(x); return v === null ? null : { value: v, unit: false }; });
  return r.ok ? { ok: true, value: r.value } : r;
}
