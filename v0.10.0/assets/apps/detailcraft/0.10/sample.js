/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sample.js — the sample model (File → Sample): a two-bay frame on grids 1–3 × A–B, two levels,
 * W12x50 columns with base plates, W16x26 beams with bolted end plates at every column, one HSS brace,
 * a pad footing with a bottom mat under every column, and a pier footing with starter bars beside the frame. Built only through Model.change, like any edit.
 */
import { Model, gridsFromSpacings, pointAt } from './model.js';
import { t } from './i18n.js';

export function sampleModel(name = 'Sample frame') {
  const model = new Model();
  model.change(t('sample.undo'), (tx) => {
    const L1 = t('model.level', { n: 1 }), L2 = t('model.level', { n: 2 });
    tx.setName(name);
    tx.setGrids(gridsFromSpacings('1 2 3', '6000 6000', 'A B', '7000'));
    tx.setLevels([{ name: L1, z: 0 }, { name: L2, z: 4000 }]);
    const s = tx.s;
    const cols = [];
    for (const gy of ['A', 'B']) for (const gx of ['1', '2', '3']) {
      cols.push(tx.addMember({ type: 'column', profile: 'W12x50', start: pointAt(s, gy, gx, L1), end: pointAt(s, gy, gx, L2) }));
    }
    const beams = [];
    for (const gy of ['A', 'B']) for (const [a, b] of [['1', '2'], ['2', '3']]) {
      beams.push(tx.addMember({ type: 'beam', profile: 'W16x26', start: pointAt(s, gy, a, L2), end: pointAt(s, gy, b, L2) }));
    }
    tx.addMember({ type: 'brace', profile: 'HSS4x4x1/4', start: pointAt(s, 'A', '1', L1), end: pointAt(s, 'A', '2', L2) });
    for (const id of beams) for (const end of ['start', 'end']) {
      const m = s.members.find((x) => x.id === id);
      const col = s.members.find((c) => c.type === 'column' && Math.abs(c.start[0] - m[end][0]) < 1 && Math.abs(c.start[1] - m[end][1]) < 1);
      tx.addConnection({ type: 'endplate', beam: id, end, column: col.id });
    }
    for (const id of cols) tx.addConnection({ type: 'baseplate', column: id });
    for (const id of cols) {
      const c = s.members.find((x) => x.id === id);
      tx.addFooting({ x: c.start[0], y: c.start[1], top: c.start[2], L: 2000, B: 2000, H: 600, starters: { on: false } });
    }
    // a footing for a concrete pier beside the frame: bottom mat and starter bars
    tx.addFooting({ x: 16000, y: 3500, top: 0, L: 2400, B: 1800, H: 600, starters: { on: true, bar: '#6', nx: 3, ny: 2, sx: 200, sy: 250, projection: 750, hook: true } });
  });
  model.undoStack = [];
  model.markSaved();
  return model;
}
