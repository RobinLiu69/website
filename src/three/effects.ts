import * as THREE from 'three';
import { PALETTE } from '../theme';
import { MARK_LAYER } from './sketch/pipeline';
import type { Stage } from './stage';

interface Bit {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  gravity: number;
  age: number;
  life: number;
  scale: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  from: number;
  to: number;
}

const CONFETTI = [PALETTE.accent, PALETTE.accentSoft, PALETTE.white, PALETTE.ink];

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/** Low-poly shards and chalk dust. Everything is cleaned up as it expires. */
export class Effects {
  private readonly group = new THREE.Group();
  private readonly bits: Bit[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly shapes = [new THREE.TetrahedronGeometry(1), new THREE.OctahedronGeometry(1)];
  private readonly ringGeometry = new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2);
  private readonly materials = new Map<number, THREE.MeshLambertMaterial>();

  constructor(private readonly stage: Stage) {
    this.group.name = 'effects';
    stage.scene.add(this.group);
    stage.onFrame((dt) => this.update(dt));
  }

  private material(color: number): THREE.MeshLambertMaterial {
    let m = this.materials.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      this.materials.set(color, m);
    }
    return m;
  }

  private spawn(
    at: THREE.Vector3,
    color: number,
    scale: number,
    velocity: THREE.Vector3,
    gravity: number,
    life: number,
  ): void {
    const shape = this.shapes[Math.floor(Math.random() * this.shapes.length)] as THREE.BufferGeometry;
    const mesh = new THREE.Mesh(shape, this.material(color));
    mesh.castShadow = true;
    mesh.position.copy(at);
    mesh.scale.setScalar(scale);
    mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    this.group.add(mesh);
    this.bits.push({
      mesh,
      velocity,
      spin: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
      gravity,
      age: 0,
      life,
      scale,
    });
  }

  /** A captured piece bursts into shards of its own colour. */
  shatter(at: THREE.Vector3, color: number, power = 1): void {
    const count = this.stage.reducedMotion ? 4 : 16;
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const out = rand(0.8, 2.6) * power;
      this.spawn(
        at.clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(0.1, 0.9), rand(-0.15, 0.15))),
        color,
        rand(0.05, 0.14) * power,
        new THREE.Vector3(Math.cos(angle) * out, rand(1.5, 4.2) * power, Math.sin(angle) * out),
        11,
        rand(0.8, 1.3),
      );
    }
  }

  confetti(at: THREE.Vector3, count = 40): void {
    if (this.stage.reducedMotion) count = Math.min(count, 8);
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const out = rand(0.6, 3.4);
      this.spawn(
        at.clone(),
        CONFETTI[Math.floor(Math.random() * CONFETTI.length)] as number,
        rand(0.05, 0.12),
        new THREE.Vector3(Math.cos(angle) * out, rand(3, 6.5), Math.sin(angle) * out),
        5.5,
        rand(1.4, 2.4),
      );
    }
  }

  /** An expanding ring on the ground: a quiet "something happened here". */
  ripple(at: THREE.Vector3, color: number = PALETTE.accent, to = 3.2): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.layers.set(MARK_LAYER);
    mesh.position.copy(at);
    mesh.scale.setScalar(0.4);
    this.group.add(mesh);
    this.ripples.push({ mesh, age: 0, life: 1, from: 0.4, to });
  }

  private update(dt: number): void {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const bit = this.bits[i] as Bit;
      bit.age += dt;
      if (bit.age >= bit.life) {
        this.group.remove(bit.mesh);
        this.bits.splice(i, 1);
        continue;
      }
      bit.velocity.y -= bit.gravity * dt;
      bit.mesh.position.addScaledVector(bit.velocity, dt);
      bit.mesh.rotation.x += bit.spin.x * dt;
      bit.mesh.rotation.y += bit.spin.y * dt;
      bit.mesh.rotation.z += bit.spin.z * dt;
      const remaining = 1 - bit.age / bit.life;
      bit.mesh.scale.setScalar(bit.scale * Math.min(1, remaining * 2.5));
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i] as Ripple;
      ripple.age += dt;
      const t = Math.min(ripple.age / ripple.life, 1);
      ripple.mesh.scale.setScalar(ripple.from + (ripple.to - ripple.from) * (1 - (1 - t) ** 3));
      (ripple.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
      if (t >= 1) {
        this.group.remove(ripple.mesh);
        (ripple.mesh.material as THREE.Material).dispose();
        this.ripples.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.stage.scene.remove(this.group);
    this.shapes.forEach((s) => s.dispose());
    this.ringGeometry.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}
