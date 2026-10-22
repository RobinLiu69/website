import * as THREE from 'three';
import { pedestal } from './staunton';
import { type Part, type Pt2, pyramid, slab, smoothstep, surfaceFinder } from './toolkit';

/** The head is drawn a little taller and longer than a knight should be; these bring it to size. */
const LOWER = 0.5;
const squash = (y: number): number => LOWER + (y - LOWER) * 0.88;
const shorten = (x: number): number => (x > 0.2 ? 0.2 + (x - 0.2) * 0.86 : x);

/** Side outline of neck and head, looking along -z, nose toward +x. It stands on the pedestal, which tops out at y 0.55. */
const BODY_DRAWN: readonly Pt2[] = [
  [-0.235, 0.5],
  [-0.3, 0.64],
  [-0.285, 0.8],
  [-0.3, 0.98],
  [-0.25, 1.14],
  [-0.15, 1.26],
  [0.0, 1.3],
  [0.12, 1.24],
  [0.29, 1.08],
  [0.45, 0.94],
  [0.6, 0.83],
  [0.64, 0.72],
  [0.58, 0.63],
  [0.44, 0.61],
  [0.31, 0.67],
  [0.2, 0.62],
  [0.22, 0.52],
  [0.235, 0.5],
];

const BODY: readonly Pt2[] = BODY_DRAWN.map(([x, y]): Pt2 => [shorten(x), squash(y)]);

const BODY_DEPTH = 0.12;
const BODY_BEVEL = 0.095;
const BODY_CUT = 0.085;

/** Narrows the muzzle and the poll and fattens the base of the neck, so the head is not a slab. */
function sculpt(g: THREE.BufferGeometry): void {
  const position = g.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const muzzle = 1 - 0.38 * smoothstep(0.12, 0.55, x);
    const poll = 1 - 0.2 * smoothstep(0.98, 1.2, y);
    const neck = 1 + 0.12 * (1 - smoothstep(0.5, 0.9, y));
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
    const ear = pyramid(0.075, 0.17, 3);
    ear.scale(1, 1, 0.7);
    ear.rotateX(side * 0.2);
    ear.rotateZ(0.26);
    ear.translate(-0.05, squash(1.22), side * 0.085);
    parts.push({ geometry: ear });

    const eye = new THREE.OctahedronGeometry(0.042).scale(1, 0.8, 0.6);
    const eyeAt: Pt2 = [shorten(0.3), squash(1.0)];
    eye.translate(eyeAt[0], eyeAt[1], (zAt(eyeAt[0], eyeAt[1], side) ?? side * 0.14) + side * 0.004);
    parts.push({ geometry: eye, tone: 'dark' });

    const nostril = new THREE.OctahedronGeometry(0.028).scale(1, 0.8, 0.6);
    const nostrilAt: Pt2 = [shorten(0.58), squash(0.73)];
    nostril.translate(nostrilAt[0], nostrilAt[1], (zAt(nostrilAt[0], nostrilAt[1], side) ?? side * 0.08) + side * 0.003);
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
    const apex: Pt2 = [(a[0] + b[0]) / 2 + nx * out * 0.13, (a[1] + b[1]) / 2 + ny * out * 0.13 + 0.02];
    const fin = slab([a, apex, b], 0.05, 0.03, 0.01);
    parts.push({ geometry: fin, tone: 'shade' });
  }

  return parts;
}
