/* SPDX-License-Identifier: Apache-2.0 */
/**
 * dwgout.js — drawing sheets as DWG and DXF files (0.4 D4). No DOM.
 *
 * A sheet (drawings.js / shop.js display list: mm on paper, y up) is written at full size, 1 drawing unit = 1 mm on
 * the paper, in model space, so it prints at 1:1 and every view keeps the scale its title says. Lines become LINE or
 * LWPOLYLINE, circles CIRCLE, filled shapes a solid HATCH under their outline, words TEXT in a text style on Arial
 * (DetailCraft's PDFs use Helvetica, which Arial matches; TEXT height = the font's capital height, 0.718 of the size).
 * Each pen is a layer with its lineweight and linetype (DC-OUTLINE 0.35, DC-THICK 0.5, DC-THIN 0.18, DC-HIDDEN,
 * DC-CENTER, DC-GRID, …), so the file plots like the PDF. Dimensions are the lines and figures the PDF shows, not
 * DIMENSION objects.
 *
 *   sheetModel(sheet, { title }) → a cc-dwg model (docs/DWG-LIB-SPEC.md) for dwg/write.js writeDwg(model, { version })
 *   sheetDxf(sheet, { title })   → DXF R12 (AC1009) text: LINE / POLYLINE / CIRCLE / TEXT, LTYPE / LAYER / STYLE tables.
 *                                  R12 has no lineweights or hatches: the layers keep the pens' names, fills are left out
 *                                  (said in the result's notes)
 *   layersOf(sheet) → the pens a sheet uses, as layers: [{ name, w, dash, lt }]
 */

const CAP = 0.718;                    // Helvetica / Arial capital height per unit of font size
const KNOWN = [                      // pens drawings.js and shop.js use → layer and linetype names
  { dash: null, min: 0.45, name: 'DC-THICK' }, { dash: null, min: 0.3, name: 'DC-OUTLINE' }, { dash: null, min: 0, name: 'DC-THIN' },
  { dash: [1.5, 1], name: 'DC-HIDDEN', lt: 'DC_HIDDEN' }, { dash: [4, 1, 0.6, 1], name: 'DC-CENTER', lt: 'DC_CENTER' },
  { dash: [8, 1.5, 1, 1.5], name: 'DC-GRID', lt: 'DC_GRID' }, { dash: [2, 1.2], name: 'DC-FOOTING', lt: 'DC_FOOTING' },
  { dash: [5, 1.5], name: 'DC-LEVEL', lt: 'DC_LEVEL' }, { dash: [3, 1.5], name: 'DC-SLOPED', lt: 'DC_SLOPED' },
];
const sameDash = (a, b) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/** The pen of an item → { name, w, dash, lt } (lineweight in 1/100 mm). */
export function penOf(it) {
  const w = it.w ?? 0.25, dash = it.dash && it.dash.length ? it.dash : null;
  if (!dash) { const k = KNOWN.find((p) => !p.dash && w >= p.min); return { name: k.name, w: Math.round(w * 100), dash: null, lt: 'CONTINUOUS' }; }
  const k = KNOWN.find((p) => sameDash(p.dash, dash));
  if (k) return { name: k.name, w: Math.round(w * 100), dash, lt: k.lt };
  const key = 'DC_DASH_' + dash.map((v) => String(r6(v)).replace('.', 'p')).join('_');
  return { name: key.replace(/_/g, '-'), w: Math.round(w * 100), dash, lt: key };
}

export function layersOf(sheet) {
  const out = new Map();
  for (const it of sheet.items) {
    const p = it.k === 'text' ? { name: 'DC-TEXT', w: 25, dash: null, lt: 'CONTINUOUS' } : penOf(it);
    if (!out.has(p.name)) out.set(p.name, p);
    else out.get(p.name).w = Math.max(out.get(p.name).w, p.w);
  }
  return [...out.values()];
}

const lineElements = (dash) => dash.map((v, i) => ({ length: i % 2 ? -v : v }));

export function sheetModel(sheet, { title = '' } = {}) {
  const layers = layersOf(sheet);
  const linetypes = layers.filter((l) => l.dash).map((l, i) => ({ handle: 'A' + (i + 1).toString(16).toUpperCase(), name: l.lt, description: l.name + ' ' + l.dash.join(' '), patternLength: l.dash.reduce((s, v) => s + v, 0), elements: lineElements(l.dash) }));
  const ents = [];
  const base = (name) => ({ layer: name, color: { index: 256 }, linetype: 'ByLayer', lineweight: -1 });
  for (const it of sheet.items) {
    if (it.k === 'text') {
      if (!String(it.s).trim()) continue;
      const ha = it.align === 'center' ? 1 : it.align === 'right' ? 2 : 0;
      const at = { x: r6(it.x), y: r6(it.y), z: 0 };
      ents.push({ ...base('DC-TEXT'), type: 'TEXT', insert: at, align: ha ? at : undefined, hAlign: ha, vAlign: 0, height: r6(it.h * CAP), rotation: it.rot || 0, widthFactor: 1, oblique: 0, style: 'DetailCraft', value: String(it.s) });
      continue;
    }
    const pen = penOf(it);
    if (it.k === 'circle') {
      if (it.fill) ents.push({ ...base(pen.name), type: 'HATCH', solid: true, pattern: 'SOLID', style: 0, patternType: 1, loops: [{ flags: 1, polyline: { vertices: circlePts(it), closed: true } }] });
      ents.push({ ...base(pen.name), type: 'CIRCLE', center: { x: r6(it.c[0]), y: r6(it.c[1]), z: 0 }, radius: r6(it.r) });
      continue;
    }
    const pts = it.pts.map(([x, y]) => ({ x: r6(x), y: r6(y) }));
    if (pts.length < 2) continue;
    if (it.fill && pts.length >= 3) ents.push({ ...base(pen.name), type: 'HATCH', solid: true, pattern: 'SOLID', style: 0, patternType: 1, loops: [{ flags: 1, polyline: { vertices: pts, closed: true } }] });
    if (pts.length === 2 && !it.closed) ents.push({ ...base(pen.name), type: 'LINE', start: { ...pts[0], z: 0 }, end: { ...pts[1], z: 0 } });
    else ents.push({ ...base(pen.name), type: 'LWPOLYLINE', vertices: pts.map((p) => ({ ...p, bulge: 0 })), closed: !!it.closed, elevation: 0 });
  }
  const W = sheet.w, H = sheet.h;
  return {
    version: 'AC1015', codepage: 'ANSI_1252',
    header: { INSUNITS: 4, MEASUREMENT: 1, LUNITS: 2, LUPREC: 2, LTSCALE: 1, LIMMIN: { x: 0, y: 0 }, LIMMAX: { x: W, y: H }, EXTMIN: { x: 0, y: 0, z: 0 }, EXTMAX: { x: W, y: H, z: 0 }, ...(title ? { PROJECTNAME: title } : {}) },
    tables: {
      linetypes,
      styles: [{ name: 'DetailCraft', height: 0, widthFactor: 1, oblique: 0, font: 'arial.ttf', bigFont: '' }],
      layers: layers.map((l) => ({ name: l.name, color: { index: 7 }, linetype: l.dash ? l.lt : 'Continuous', lineweight: l.w, plot: true })),
    },
    blocks: [{ name: '*Model_Space', entities: ents }, { name: '*Paper_Space', entities: [] }],
    layouts: [], objects: [],
  };
}

function circlePts(it, n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; out.push({ x: r6(it.c[0] + it.r * Math.cos(a)), y: r6(it.c[1] + it.r * Math.sin(a)) }); }
  return out;
}

// ---- DXF R12 ----

/** A DXF R12 string value: one line, Windows-1252 only (anything else as \U+XXXX, which R12 readers show as written). */
function dxfText(s) {
  return String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e -ÿ]/g, (c) => '\\U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
}
const fnum = (v) => { const n = r6(v); return Number.isInteger(n) ? n.toFixed(1) : String(n); };

export function sheetDxf(sheet, { title = '' } = {}) {
  const out = [];
  const g = (code, v) => { out.push(String(code).padStart(3, ' '), typeof v === 'number' ? fnum(v) : String(v)); };
  const gi = (code, v) => { out.push(String(code).padStart(3, ' '), String(Math.round(v)).padStart(6, ' ')); };
  const layers = layersOf(sheet);
  const notes = [];
  // header
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMAX'); g(10, sheet.w); g(20, sheet.h); g(30, 0);
  g(9, '$LIMMIN'); g(10, 0); g(20, 0);
  g(9, '$LIMMAX'); g(10, sheet.w); g(20, sheet.h);
  g(9, '$LTSCALE'); g(40, 1);
  g(9, '$TEXTSTYLE'); g(7, 'DETAILCRAFT');
  g(9, '$CLAYER'); g(8, '0');
  g(0, 'ENDSEC');
  // tables
  g(0, 'SECTION'); g(2, 'TABLES');
  const lts = layers.filter((l) => l.dash);
  g(0, 'TABLE'); g(2, 'LTYPE'); gi(70, lts.length + 1);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); gi(70, 0); g(3, 'Solid line'); gi(72, 65)   // i18n-ignore (the DXF's own name for it); gi(73, 0); g(40, 0);
  for (const l of lts) {
    g(0, 'LTYPE'); g(2, l.lt); gi(70, 0); g(3, l.name + ' ' + l.dash.join(' ')); gi(72, 65); gi(73, l.dash.length); g(40, l.dash.reduce((s, v) => s + v, 0));
    l.dash.forEach((v, i) => g(49, i % 2 ? -v : v));
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); gi(70, layers.length + 1);
  g(0, 'LAYER'); g(2, '0'); gi(70, 0); gi(62, 7); g(6, 'CONTINUOUS');
  for (const l of layers) { g(0, 'LAYER'); g(2, l.name); gi(70, 0); gi(62, 7); g(6, l.dash ? l.lt : 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); gi(70, 2);
  g(0, 'STYLE'); g(2, 'STANDARD'); gi(70, 0); g(40, 0); g(41, 1); g(50, 0); gi(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
  g(0, 'STYLE'); g(2, 'DETAILCRAFT'); gi(70, 0); g(40, 0); g(41, 1); g(50, 0); gi(71, 0); g(42, 2.5); g(3, 'arial.ttf'); g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  // entities
  g(0, 'SECTION'); g(2, 'ENTITIES');
  let fills = 0;
  const counts = {};
  const count = (t) => { counts[t] = (counts[t] || 0) + 1; };
  for (const it of sheet.items) {
    if (it.k === 'text') {
      if (!String(it.s).trim()) continue;
      const ha = it.align === 'center' ? 1 : it.align === 'right' ? 2 : 0;
      g(0, 'TEXT'); g(8, 'DC-TEXT'); g(10, it.x); g(20, it.y); g(30, 0); g(40, it.h * CAP); g(1, dxfText(it.s));
      if (it.rot) g(50, it.rot * 180 / Math.PI);
      g(7, 'DETAILCRAFT');
      if (ha) { gi(72, ha); g(11, it.x); g(21, it.y); g(31, 0); }
      count('TEXT');
      continue;
    }
    const pen = penOf(it);
    if (it.fill) fills++;
    if (it.k === 'circle') { g(0, 'CIRCLE'); g(8, pen.name); g(10, it.c[0]); g(20, it.c[1]); g(30, 0); g(40, it.r); count('CIRCLE'); continue; }
    if (it.pts.length < 2) continue;
    if (it.pts.length === 2 && !it.closed) {
      g(0, 'LINE'); g(8, pen.name); g(10, it.pts[0][0]); g(20, it.pts[0][1]); g(30, 0); g(11, it.pts[1][0]); g(21, it.pts[1][1]); g(31, 0);
      count('LINE');
      continue;
    }
    g(0, 'POLYLINE'); g(8, pen.name); gi(66, 1); g(10, 0); g(20, 0); g(30, 0); gi(70, it.closed ? 1 : 0);
    for (const [x, y] of it.pts) { g(0, 'VERTEX'); g(8, pen.name); g(10, x); g(20, y); g(30, 0); }
    g(0, 'SEQEND'); g(8, pen.name);
    count('POLYLINE');
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  if (fills) notes.push({ key: 'dxf.note.fills', n: fills });
  return { text: out.join('\r\n') + '\r\n', counts, notes, layers: layers.map((l) => l.name), title };
}
