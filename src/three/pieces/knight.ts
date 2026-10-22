import * as THREE from 'three';
import { pedestal } from './staunton';
import { type Part, type Pt2, pyramid, slab, smoothstep, surfaceFinder } from './toolkit';

/** Side outline of neck and head, looking along -z, nose toward +x. */
const BODY: readonly Pt2[] = [
  [-0.18, 0.36],
  [-0.24, 0.5],
  [-0.22, 0.62],
  [-0.275, 0.78],
  [-0.23, 0.92],
  [-0.185, 1.05],
  [-0.11, 1.15],
  [0.06, 1.17],
  [0.18, 1.06],
  [0.34, 0.93],
  [0.48, 0.83],
  [0.555, 0.73],
  [0.54, 0.64],
  [0.44, 0.6],
  [0.3, 0.64],
  [0.16, 0.58],
  [0.17, 0.46],
  [0.23, 0.36],
];

const BODY_DEPTH = 0.1;
const BODY_BEVEL = 0.085;
const BODY_CUT = 0.07;

/** Narrows the muzzle and the poll and fattens the base of the neck, so the head is not a slab. */
function sculpt(g: THREE.BufferGeometry): void {
  const position = g.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const muzzle = 1 - 0.34 * smoothstep(0.12, 0.52, x);
    const poll = 1 - 0.18 * smoothstep(0.98, 1.17, y);
    const neck = 1 + 0.1 * (1 - smoothstep(0.36, 0.78, y));
    position.setZ(i, position.getZ(i) * muzzle * poll * neck);
  }
  position.needsUpdate = true;
  g.computeVertexNormals();
}

export function knight(): Part[] {
  const parts: Part[] = [pedestal()];

  // The head is cut like a gem: a flat face on each side and a wide chamfer all the way round.
  const head = slab(BODY, BODY_DEPTH, BODY_BEVEL, BODY_CUT);
  sculpt(head);
  const zAt = surfaceFinder(head);
  parts.push({ geometry: head });

  for (const side of [-1, 1]) {
    // Ears: two small three-sided points on the poll, leaning back and out.
    const ear = pyramid(0.075, 0.21, 3);
    ear.scale(1, 1, 0.7);
    ear.rotateX(side * 0.2);
    ear.rotateZ(0.26);
    ear.translate(-0.04, 1.13, side * 0.085);
    parts.push({ geometry: ear });

    const eye = new THREE.OctahedronGeometry(0.04).scale(1, 0.8, 0.6);
    eye.translate(0.29, 0.9, (zAt(0.29, 0.9, side) ?? side * 0.12) + side * 0.004);
    parts.push({ geometry: eye, tone: 'dark' });

    const nostril = new THREE.OctahedronGeometry(0.026).scale(1, 0.8, 0.6);
    nostril.translate(0.5, 0.725, (zAt(0.5, 0.725, side) ?? side * 0.07) + side * 0.003);
    parts.push({ geometry: nostril, tone: 'dark' });
  }

  // The mane: a fin on every step down the back of the neck.
  for (let i = 1; i < 6; i++) {
    const a = BODY[i] as Pt2;
    const b = BODY[i + 1] as Pt2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    // Normal pointing away from the neck (toward -x).
    const nx = -dy / length;
    const ny = dx / length;
    const out = nx < 0 ? 1 : -1;
    const apex: Pt2 = [(a[0] + b[0]) / 2 + nx * out * 0.12, (a[1] + b[1]) / 2 + ny * out * 0.12 + 0.02];
    const fin = slab([a, apex, b], 0.05, 0.03, 0.01);
    parts.push({ geometry: fin, tone: 'shade' });
  }

  return parts;
}
