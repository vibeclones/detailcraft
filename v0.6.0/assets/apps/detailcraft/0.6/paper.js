/* SPDX-License-Identifier: Apache-2.0 */
/**
 * paper.js — the sheet sizes drawings and shop drawings are made on (0.4 D3). No DOM. Millimeters, landscape.
 *
 * ISO 216 A4–A1 and ANSI/ASME Y14.1 B–D (11 × 17, 17 × 22, 22 × 34 in, exactly 25.4 mm to the inch).
 * `k` is the sheet's height against A3's 297 mm (0.6 at least): the drawing layouts grow their view rooms by it,
 * so a bigger sheet draws the same assembly at a larger standard scale. Text sizes never change with the sheet.
 */
const IN = 25.4;
export const PAPERS = {
  A4: { key: 'A4', w: 297, h: 210, family: 'iso' },
  A3: { key: 'A3', w: 420, h: 297, family: 'iso' },
  A2: { key: 'A2', w: 594, h: 420, family: 'iso' },
  A1: { key: 'A1', w: 841, h: 594, family: 'iso' },
  'ANSI-B': { key: 'ANSI-B', w: 17 * IN, h: 11 * IN, family: 'ansi', inches: '11 × 17' },
  'ANSI-C': { key: 'ANSI-C', w: 22 * IN, h: 17 * IN, family: 'ansi', inches: '17 × 22' },
  'ANSI-D': { key: 'ANSI-D', w: 34 * IN, h: 22 * IN, family: 'ansi', inches: '22 × 34' },
};
export const PAPER_KEYS = Object.keys(PAPERS);
export const DEFAULT_PAPER = 'A3';
/** A sheet by key (unknown → A3), with k. */
export function paperOf(key) {
  const p = PAPERS[key] || PAPERS[DEFAULT_PAPER];
  return { ...p, k: Math.max(0.6, p.h / 297) };
}
/** "A1 (841 × 594 mm)", "ANSI D (22 × 34 in)" — names for lists and title blocks (not translated: standard names). */
export function paperLabel(key) {
  const p = paperOf(key);
  return p.family === 'ansi' ? p.key.replace('-', ' ') + ' (' + p.inches + ' in)' : p.key + ' (' + p.w + ' × ' + p.h + ' mm)';
}
