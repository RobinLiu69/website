import * as THREE from 'three';
import { MARK_LAYER } from './pipeline';

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * A few specks of chalk dust hanging in the lamp's light over the board. They live in the lit pass only, so they
 * come out as plain chalk dots with no outline, and the board and the pieces hide the ones behind them.
 */
export class Dust {
  readonly points: THREE.Points;
  private readonly seeds: Float32Array;
  private readonly home: Float32Array;

  constructor(count = 64) {
    this.home = new Float32Array(count * 3);
    this.seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // a loose column of air above and round the board
      const angle = rand(0, Math.PI * 2);
      const radius = 2 + Math.sqrt(Math.random()) * 8;
      this.home[i * 3] = Math.cos(angle) * radius;
      this.home[i * 3 + 1] = rand(0.2, 5.5);
      this.home[i * 3 + 2] = Math.sin(angle) * radius;
      this.seeds[i * 3] = rand(0, 100);
      this.seeds[i * 3 + 1] = rand(0.05, 0.16);
      this.seeds[i * 3 + 2] = rand(0.15, 0.5);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.home.slice(), 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, depthWrite: false });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.layers.set(MARK_LAYER);
    this.points.name = 'dust';
  }

  update(time: number): void {
    const position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const seed = this.seeds[i * 3] as number;
      const rise = this.seeds[i * 3 + 1] as number;
      const sway = this.seeds[i * 3 + 2] as number;
      // slowly up, wrapping from the top of the column back to the floor
      const y = ((this.home[i * 3 + 1] as number) + time * rise) % 5.7;
      position.setXYZ(
        i,
        (this.home[i * 3] as number) + Math.sin(time * 0.21 + seed) * sway,
        y,
        (this.home[i * 3 + 2] as number) + Math.cos(time * 0.17 + seed * 1.3) * sway,
      );
    }
    position.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
