import * as THREE from 'three';
import type { MatingPiece } from '../chess/puzzles';
import { HOME_PITCH, type Pose } from './cameraRig';

/** Left-to-right order of the plinths on stage. The queen's throne sits in the middle. */
export const STAGE_ORDER: readonly MatingPiece[] = ['p', 'n', 'q', 'b', 'r'];

/** Landscape screens wrap the plinths round the back of the board; portrait ones line them up behind it. */
export type LayoutKind = 'arc' | 'row';

export const layoutKindFor = (aspect: number): LayoutKind => (aspect >= 1.1 ? 'arc' : 'row');

/** Top surface of a plinth. Tokens stand on it. */
export const PLINTH_TOP = 0.3;
export const GROUND_Y = -1.2;
const TOKEN_HEIGHT = 2.6;

export function plinthPositions(kind: LayoutKind): Record<MatingPiece, THREE.Vector3> {
  const out = {} as Record<MatingPiece, THREE.Vector3>;
  if (kind === 'arc') {
    // Close round the board without touching it: the knight's and bishop's stands tuck in beside its far corners.
    const spots: Record<MatingPiece, readonly [number, number]> = {
      p: [-6.9, 0.2],
      n: [-6.3, -4.9],
      q: [0, -7.0],
      b: [6.3, -4.9],
      r: [6.9, 0.2],
    };
    for (const piece of STAGE_ORDER) out[piece] = new THREE.Vector3(spots[piece][0], 0, spots[piece][1]);
  } else {
    STAGE_ORDER.forEach((piece, i) => {
      out[piece] = new THREE.Vector3((i - 2) * 2.3, 0, piece === 'q' ? -7.6 : -7.0);
    });
  }
  return out;
}

/** Everything the camera has to keep in frame in the overview. */
export function fitPoints(kind: LayoutKind): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) points.push(new THREE.Vector3(4.6 * sx, -0.9, 4.6 * sz));
  }
  for (const p of Object.values(plinthPositions(kind))) {
    for (const dx of [-1.1, 1.1]) {
      points.push(new THREE.Vector3(p.x + dx, GROUND_Y, p.z + 1.1));
      points.push(new THREE.Vector3(p.x + dx, PLINTH_TOP + TOKEN_HEIGHT, p.z));
    }
  }
  return points;
}

/** Where the camera goes to look at one plinth, from the side facing the board. */
export function focusPose(piece: MatingPiece, kind: LayoutKind, portrait: boolean): Pose {
  const base = plinthPositions(kind)[piece];
  const target = new THREE.Vector3(base.x, PLINTH_TOP + 0.5, base.z);
  // Look at it from the board's side, nudged toward the default camera so the board stays in view.
  const toBoard = new THREE.Vector3(-base.x, 0, -base.z + 4);
  if (toBoard.lengthSq() < 0.01) toBoard.set(0, 0, 1);
  toBoard.normalize();
  return {
    target,
    yaw: Math.atan2(toBoard.x, toBoard.z),
    pitch: portrait ? HOME_PITCH * 0.75 : 0.44,
    dist: portrait ? 13 : 10.8,
  };
}
