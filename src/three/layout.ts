import * as THREE from 'three';

/** Half the width of the whole board, frame and base included. */
export const BOARD_OUTER = 4.62;
/** The underside of the board's base. */
export const BOARD_BOTTOM = -0.5;
/** The tallest piece, the king. */
export const KING_HEIGHT = 1.78;

/** Everything the camera has to keep in frame: the board's corners, and the far rank standing tall behind it. */
export function fitPoints(): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) points.push(new THREE.Vector3(BOARD_OUTER * sx, BOARD_BOTTOM, BOARD_OUTER * sz));
    points.push(new THREE.Vector3(3.5 * sx, KING_HEIGHT + 0.1, -3.5));
  }
  return points;
}
