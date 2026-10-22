import * as THREE from 'three';
import { PALETTE } from '../../theme';
import { BOARD_BOTTOM, BOARD_OUTER } from '../layout';

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

const FLOOR = BOARD_BOTTOM - 0.02;

/**
 * The construction lines under a design drawing, laid out round the board: two wandering circles with a ring of
 * tick marks, the board's edges and diagonals run on past its corners, an axis up through the middle, and a few
 * crosses where something was set out. Each is a wavering line of its own, and they are drawn in one at a time
 * when the page opens, circle first, as if the board were being summoned inside it.
 */
export class Guides {
  readonly root = new THREE.Group();

  private strokes: Stroke[] = [];
  private clock = Infinity;
  private readonly material = new THREE.LineBasicMaterial({
    color: PALETTE.ink,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  private readonly faint = new THREE.LineBasicMaterial({
    color: PALETTE.ink,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });

  constructor() {
    this.root.name = 'guides';
    this.build();
  }

  /** Sets every line out. Runs once; the lines do not depend on the screen. */
  private build(): void {
    const random = mulberry32(7);
    const centre = new THREE.Vector3(0, FLOOR, 0);

    // Two circles, the second a little larger, a little off and a little fainter.
    this.add(this.ring(centre, 8.3, random, 0.05, 1.03), 0, false);
    this.add(this.ring(centre.clone().add(new THREE.Vector3(0.06, 0, -0.04)), 8.62, random, 0.07, 1.04), 0.5, true);
    this.add(this.ring(centre, 11.8, random, 0.12, 0.7), 1.2, true);

    // A ring of ticks between the circles: long every 45 degrees, short every 15, drawn as one loose scribble each.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + (random() - 0.5) * 0.01;
      const long = k % 6 === 0;
      const inner = 8.3 + 0.02;
      const outer = 8.62 - (long ? -0.55 : 0.05);
      this.add(
        this.pen(
          new THREE.Vector3(Math.cos(a) * inner, FLOOR, Math.sin(a) * inner),
          new THREE.Vector3(Math.cos(a) * outer, FLOOR, Math.sin(a) * outer),
          random,
          0.01,
        ),
        0.9 + (k / 24) * 1.1,
        !long,
      );
    }

    // The board's edges and diagonals, run on past its corners.
    const e = BOARD_OUTER;
    const over = () => 1.6 + random() * 1.8;
    for (const s of [-1, 1]) {
      this.add(this.pen(new THREE.Vector3(-e - over(), FLOOR, s * e), new THREE.Vector3(e + over(), FLOOR, s * e), random, 0.04), 0.4 + random() * 0.4, true);
      this.add(this.pen(new THREE.Vector3(s * e, FLOOR, -e - over()), new THREE.Vector3(s * e, FLOOR, e + over()), random, 0.04), 0.5 + random() * 0.4, true);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const far = e + 3.2 + random() * 1.5;
        this.add(this.pen(new THREE.Vector3(sx * (e - 0.3), FLOOR, sz * (e - 0.3)), new THREE.Vector3(sx * far, FLOOR, sz * far), random, 0.04), 1.3 + random() * 0.5, true);
      }
    }

    // The board's own axes, on the floor and up through the middle.
    this.add(this.pen(new THREE.Vector3(-11.2, FLOOR, 0), new THREE.Vector3(11.2, FLOOR, 0), random, 0.05), 0.8, true);
    this.add(this.pen(new THREE.Vector3(0, FLOOR, -11.2), new THREE.Vector3(0, FLOOR, 11.2), random, 0.05), 1.0, true);
    this.add(this.pen(new THREE.Vector3(0, FLOOR, 0), new THREE.Vector3(0, 4.4, 0), random, 0.03), 1.6, true);
    this.add(this.pen(new THREE.Vector3(-1.4, 4.0, 0), new THREE.Vector3(1.4, 4.0, 0), random, 0.02), 2.0, true);

    // Crosses where something was set out.
    for (const [x, z] of [
      [-6.4, 5.8],
      [6.9, 5.1],
      [-9.8, -3.4],
      [9.4, -4.6],
      [0.8, 9.4],
      [-3.6, -9.2],
      [4.4, -8.8],
    ] as const) {
      this.add(this.cross(new THREE.Vector3(x, FLOOR, z), 0.22, random), 1.4 + random() * 1.2, false);
    }
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

  private add(points: THREE.Vector3[], delay: number, faint: boolean): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, faint ? this.faint : this.material);
    line.frustumCulled = false;
    line.renderOrder = 10;
    this.root.add(line);
    this.strokes.push({ line, vertices: points.length, delay, duration: 0.5 + Math.min(1.6, points.length * 0.025) });
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

  /** A circle on the floor that does not quite close, or runs a little past where it began. */
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
