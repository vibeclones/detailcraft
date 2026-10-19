/* SPDX-License-Identifier: Apache-2.0 */
/**
 * analysis-view.js — frame analysis results on DetailCraft's 3D view (0.6 LC.4): the deflected shape, or an action's
 * diagram beside each member (frame/frame-draw.js: filled, coloured by size, the largest value of each member labelled).
 * Its own THREE.Group added to the view's scene (view3d.js is not changed; setModel never clears it), drawn over the
 * steel (no depth test) so it shows through the parts.
 *
 *   showResults(view, frame, sol, setKey, { mode, scale, labels }) → { max, scale }
 *   clearResults(view)
 */
import * as THREE from 'three';
import { resultGeometry } from './frame/frame-draw.js';
import { KN, KNM } from './frame/frame-report.js';

const MM = 0.001;

function groupOf(view) {
  if (!view._analysis) {
    view._analysis = new THREE.Group();
    view._analysis.scale.setScalar(MM);
    view._analysis.renderOrder = 10;
    view.scene.add(view._analysis);
  }
  return view._analysis;
}

export function clearResults(view) {
  if (!view?._analysis) return;
  view.clearGroup(view._analysis);
  view.render();
}

export function showResults(view, frame, sol, setKey, { mode = 'deflected', scale = 0, labels = true } = {}) {
  if (!view) return { max: 0, scale: 0 };
  const g = groupOf(view);
  view.clearGroup(g);
  const geo = resultGeometry(sol, setKey, { mode, scale });
  if (geo.tris.length) {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(geo.tris, 3));
    b.setAttribute('color', new THREE.Float32BufferAttribute(geo.triColors, 3));
    const mesh = new THREE.Mesh(b, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 10;
    g.add(mesh);
  }
  if (geo.lines.length) {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(geo.lines, 3));
    b.setAttribute('color', new THREE.Float32BufferAttribute(geo.lineColors, 3));
    const line = new THREE.LineSegments(b, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    line.renderOrder = 11;
    g.add(line);
  }
  if (labels && geo.labels.length <= 300 && typeof view.label === 'function') {
    for (const l of geo.labels) {
      const sp = view.label(l.unit === 'kN' ? KN(l.value) : KNM(l.value), l.p, 'center', 300);
      if (sp?.material) { sp.material.depthTest = false; sp.renderOrder = 12; }
      if (sp) g.add(sp);
    }
  }
  view.render();
  return { max: geo.max, scale: geo.scale };
}
