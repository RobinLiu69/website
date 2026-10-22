import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { GROUND_Y, type LayoutKind, PLINTH_TOP, plinthPositions } from '../layout';
import type { MatingPiece } from '../../chess/puzzles';

/** A small deterministic generator, so the construction lines are the same on every visit and in every screenshot. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Stroke {
  line: THREE.Line;
  vertices: number;
  delay: number;
  duration: number;
}

/**
 * The construction lines of a design drawing: axes through the stands, circles round their feet, the edges of
 * the board run on past its corners, a few crosses where lines were set out. Each is a wavering line of its
 * own, and they are drawn in one at a time when the page opens.
 */
export class Guides {
  readonly root = new THREE.Group();

  private strokes: Stroke[] = [];
  private clock = Infinity;
  private readonly material = new THREE.LineBasicMaterial({
    color: PALETTE.ink,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
  });
  private readonly faint = new THREE.LineBasicMaterial({
    color: PALETTE.ink,
    transparent: true,
    opacity: 0.27,
    depthTest: false,
    depthWrite: false,
  });

  constructor() {
    this.root.name = 'guides';
  }

  /** Re-lays every line for the arrangement of stands. `heights` is the height of each token above its stand. */
  layout(kind: LayoutKind, heights: Record<MatingPiece, number>): void {
    for (const stroke of this.strokes) {
      this.root.remove(stroke.line);
      stroke.line.geometry.dispose();
    }
    this.strokes = [];
    const random = mulberry32(kind === 'arc' ? 7 : 11);
    const positions = plinthPositions(kind);

    // Axes through each token, with the levels of its foot and its top marked off.
    for (const piece of Object.keys(positions) as MatingPiece[]) {
      const at = positions[piece];
      const top = PLINTH_TOP + heights[piece];
      this.add(this.pen(new THREE.Vector3(at.x, GROUND_Y - 0.3, at.z), new THREE.Vector3(at.x, top + 0.8, at.z), random, 0.03), 0.1 + random() * 0.5);
      for (const y of [PLINTH_TOP, top]) {
        const half = 0.5 + random() * 0.3;
        this.add(this.pen(new THREE.Vector3(at.x - half, y, at.z), new THREE.Vector3(at.x + half, y, at.z), random, 0.02), 0.4 + random() * 0.6, true);
      }
      // Two passes of a circle round the foot, the second a little larger and a little off.
      for (const radius of [1.78, 1.86]) {
        this.add(this.ring(new THREE.Vector3(at.x, GROUND_Y + 0.02, at.z), radius, random, 0.05), 0.6 + random() * 0.9, radius > 1.8);
      }
      this.add(this.cross(new THREE.Vector3(at.x + 1.5, GROUND_Y + 0.02, at.z + 1.5), 0.14, random), 1 + random(), false);
    }

    // The board's edges, run on past its corners.
    const rim = 4.4;
    const over = 1.7;
    for (const s of [-1, 1]) {
      this.add(this.pen(new THREE.Vector3(-rim - over * (0.6 + random() * 0.7), 0.1, s * rim), new THREE.Vector3(rim + over * (0.6 + random() * 0.7), 0.1, s * rim), random, 0.03), random() * 0.6, true);
      this.add(this.pen(new THREE.Vector3(s * rim, 0.1, -rim - over * (0.6 + random() * 0.7)), new THREE.Vector3(s * rim, 0.1, rim + over * (0.6 + random() * 0.7)), random, 0.03), random() * 0.6, true);
    }
    // The board's own axis and its centre lines.
    this.add(this.pen(new THREE.Vector3(0, GROUND_Y - 0.4, 0), new THREE.Vector3(0, 3.6, 0), random, 0.03), 0.2, true);
    this.add(this.pen(new THREE.Vector3(-9.5, GROUND_Y + 0.02, 0), new THREE.Vector3(9.5, GROUND_Y + 0.02, 0), random, 0.05), 0.5, true);
    this.add(this.pen(new THREE.Vector3(0, GROUND_Y + 0.02, -10.5), new THREE.Vector3(0, GROUND_Y + 0.02, 6.5), random, 0.05), 0.7, true);

    // A loose circle round the whole drawing, and crosses where things were set out.
    this.add(this.ring(new THREE.Vector3(0, GROUND_Y + 0.02, -1.2), 12.4, random, 0.12, 0.75), 1.2, true);
    for (const [x, z] of [
      [-6.4, 6.2],
      [6.8, 5.6],
      [-10.8, -4.6],
      [10.2, -5.2],
      [0.6, 8.4],
    ] as const) {
      this.add(this.cross(new THREE.Vector3(x, GROUND_Y + 0.02, z), 0.2, random), 1.2 + random() * 0.8, false);
    }
    this.clock = Infinity;
    this.apply();
  }

  /** Starts drawing the lines in, one after another. */
  reveal(): void {
    this.clock = 0;
    this.apply();
  }

  /** Shows every line at once (reduced motion, or tests). */
  complete(): void {
    this.clock = Infinity;
    this.apply();
  }

  update(dt: number): void {
    if (this.clock === Infinity) return;
    this.clock += dt;
    this.apply();
    if (this.strokes.every((s) => this.clock >= s.delay + s.duration)) this.clock = Infinity;
  }

  private apply(): void {
    for (const stroke of this.strokes) {
      const t = this.clock === Infinity ? 1 : Math.min(1, Math.max(0, (this.clock - stroke.delay) / stroke.duration));
      const eased = 1 - (1 - t) ** 2;
      stroke.line.geometry.setDrawRange(0, Math.round(stroke.vertices * eased));
      stroke.line.visible = t > 0;
    }
  }

  private add(points: THREE.Vector3[], delay: number, faint = false): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, faint ? this.faint : this.material);
    line.frustumCulled = false;
    line.renderOrder = 10;
    this.root.add(line);
    this.strokes.push({ line, vertices: points.length, delay, duration: 0.5 + Math.min(1.1, points.length * 0.03) });
  }

  /** A straight stroke that wanders a little, and overshoots at both ends. */
  private pen(from: THREE.Vector3, to: THREE.Vector3, random: () => number, wobble: number): THREE.Vector3[] {
    const dir = to.clone().sub(from).normalize();
    const a = from.clone().addScaledVector(dir, -random() * 0.3);
    const b = to.clone().addScaledVector(dir, random() * 0.3);
    const length = a.distanceTo(b);
    const steps = Math.max(2, Math.round(length / 0.35));
    const side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const phase = random() * 10;
    const rate = 0.5 + random() * 0.5;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const drift = Math.sin(phase + t * length * rate) * 0.6 + Math.sin(phase * 1.7 + t * length * rate * 2.9) * 0.4;
      return a.clone().lerp(b, t).addScaledVector(side, wobble * drift);
    });
  }

  /** A circle on the ground that does not quite close, or runs a little past where it began. */
  private ring(centre: THREE.Vector3, radius: number, random: () => number, wobble: number, turns = 1.04): THREE.Vector3[] {
    const steps = Math.max(24, Math.round(radius * 9 * turns));
    const start = random() * Math.PI * 2;
    const phase = random() * 10;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const angle = start + t * turns * Math.PI * 2;
      const r = radius + wobble * (Math.sin(phase + angle * 2.3) * 0.6 + Math.sin(phase * 1.3 + angle * 5.1) * 0.4) + t * 0.05;
      return new THREE.Vector3(centre.x + Math.cos(angle) * r, centre.y, centre.z + Math.sin(angle) * r);
    });
  }

  /** Two short strokes that cross: a point that was marked out. Drawn as one line with a lift between. */
  private cross(at: THREE.Vector3, size: number, random: () => number): THREE.Vector3[] {
    const tilt = (random() - 0.5) * 0.5;
    const rotate = (x: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(at.x + x * Math.cos(tilt) - z * Math.sin(tilt), at.y, at.z + x * Math.sin(tilt) + z * Math.cos(tilt));
    return [rotate(-size, -size), rotate(size, size), rotate(size * 0.2, size * 0.2), rotate(size, -size), rotate(-size, size)];
  }

  dispose(): void {
    for (const stroke of this.strokes) stroke.line.geometry.dispose();
    this.material.dispose();
    this.faint.dispose();
  }
}
