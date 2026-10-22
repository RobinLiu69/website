import * as THREE from 'three';
import { type Tweens, ease } from './tween';

export interface Pose {
  target: THREE.Vector3;
  /** Radians around the y axis; 0 looks from +z toward the board (white's side). */
  yaw: number;
  /** Elevation above the horizon in radians. */
  pitch: number;
  dist: number;
}

export interface Limits {
  yaw: readonly [number, number];
  pitch: readonly [number, number];
  dist: readonly [number, number];
}

export interface FitMargins {
  /** Fractions of the half-viewport kept free on each side (NDC units). */
  side: number;
  top: number;
  bottom: number;
}

/** A part of the viewport, in NDC (-1..1, y up), that the scene must stay inside. */
export interface Region {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const HOME_PITCH = 0.86;

const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clonePose = (p: Pose): Pose => ({ ...p, target: p.target.clone() });

export function limitsAround(pose: Pose, dYaw: number, dPitch: number, distSpan: number): Limits {
  return {
    yaw: [pose.yaw - dYaw, pose.yaw + dYaw],
    pitch: [Math.max(0.12, pose.pitch - dPitch), Math.min(1.45, pose.pitch + dPitch)],
    dist: [pose.dist * (1 - distSpan), pose.dist * (1 + distSpan)],
  };
}

/**
 * A small orbit camera with soft limits, scripted flights and a screen-space
 * "shift" so the scene can slide aside to make room for a side panel.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Pointer position in NDC (-1..1). The camera drifts a few degrees toward it for a bit of life. */
  readonly parallaxTarget = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  reduced = false;

  home: Pose = { target: new THREE.Vector3(0, 0.3, 0), yaw: 0, pitch: HOME_PITCH, dist: 26 };

  private pose = clonePose(this.home);
  private goal = clonePose(this.home);
  private limits: Limits = limitsAround(this.home, 0.7, 0.4, 0.3);
  private size = { w: 1, h: 1 };
  /** Where the scene should sit on screen, in px, relative to centre. */
  private shift = new THREE.Vector2();
  private flight = 0;
  private flying = false;
  private readonly probe: THREE.PerspectiveCamera;

  constructor(
    private readonly tweens: Tweens,
    fov = 34,
  ) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 220);
    this.probe = new THREE.PerspectiveCamera(fov, 1, 0.5, 220);
    this.place();
  }

  get isFlying(): boolean {
    return this.flying;
  }

  get currentPose(): Pose {
    return clonePose(this.pose);
  }

  setSize(w: number, h: number): void {
    this.size = { w, h };
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.probe.aspect = w / h;
    this.probe.updateProjectionMatrix();
    this.applyShift();
  }

  setLimits(limits: Limits): void {
    this.limits = limits;
    this.goal.yaw = clamp(this.goal.yaw, limits.yaw);
    this.goal.pitch = clamp(this.goal.pitch, limits.pitch);
    this.goal.dist = clamp(this.goal.dist, limits.dist);
  }

  /** Overview limits scale with the fitted distance. */
  overviewLimits(): Limits {
    return {
      yaw: [-0.95, 0.95],
      pitch: [0.3, 1.2],
      dist: [this.home.dist * 0.62, this.home.dist * 1.15],
    };
  }

  /**
   * Finds the closest distance at which every point stays inside the viewport,
   * and stores it as the home pose. Does not move the camera.
   */
  fit(points: THREE.Vector3[], margins: FitMargins, pitch = HOME_PITCH, target = this.home.target): Pose {
    const pose: Pose = { target: target.clone(), yaw: 0, pitch, dist: 10 };
    this.probe.clearViewOffset();
    const fits = (dist: number): boolean => {
      pose.dist = dist;
      this.orient(this.probe, pose);
      this.probe.updateMatrixWorld(true);
      return points.every((p) => {
        const v = p.clone().project(this.probe);
        return (
          Math.abs(v.x) <= 1 - margins.side && v.y <= 1 - margins.top && v.y >= -1 + margins.bottom
        );
      });
    };
    let lo = 6;
    let hi = 160;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    pose.dist = hi;
    this.home = pose;
    return clonePose(pose);
  }

  /**
   * Like `fit`, but for when a panel covers part of the screen: finds the closest distance at which every
   * point lands inside `region`, and the shift (px) that puts the target in the middle of it.
   * Changes nothing; the caller flies there.
   */
  fitRegion(
    points: THREE.Vector3[],
    region: Region,
    pitch: number,
    target: THREE.Vector3,
  ): { pose: Pose; shift: { x: number; y: number } } {
    const { w, h } = this.size;
    const shift = {
      x: ((region.xMin + region.xMax) / 2) * (w / 2),
      y: -((region.yMin + region.yMax) / 2) * (h / 2),
    };
    const pose: Pose = { target: target.clone(), yaw: 0, pitch, dist: 10 };
    this.probe.setViewOffset(w, h, -shift.x, -shift.y, w, h);
    const fits = (dist: number): boolean => {
      pose.dist = dist;
      this.orient(this.probe, pose);
      this.probe.updateMatrixWorld(true);
      return points.every((p) => {
        const v = p.clone().project(this.probe);
        return v.x >= region.xMin && v.x <= region.xMax && v.y >= region.yMin && v.y <= region.yMax;
      });
    };
    let lo = 6;
    let hi = 200;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    pose.dist = hi;
    this.probe.clearViewOffset();
    return { pose: clonePose(pose), shift };
  }

  /** Jump straight to a pose with no animation. */
  snapTo(pose: Pose, limits?: Limits): void {
    this.flight++;
    this.flying = false;
    this.pose = clonePose(pose);
    this.goal = clonePose(pose);
    if (limits) this.limits = limits;
    this.place();
  }

  orbitBy(dYaw: number, dPitch: number): void {
    if (this.flying) return;
    this.goal.yaw = clamp(this.goal.yaw + dYaw, this.limits.yaw);
    this.goal.pitch = clamp(this.goal.pitch + dPitch, this.limits.pitch);
  }

  zoomBy(factor: number): void {
    if (this.flying) return;
    this.goal.dist = clamp(this.goal.dist * factor, this.limits.dist);
  }

  /** Slides the scene on screen (px). Positive x moves it right, positive y down. */
  setShift(x: number, y: number, duration = 0): Promise<void> {
    const from = this.shift.clone();
    const to = new THREE.Vector2(x, y);
    if (duration <= 0 || this.reduced) {
      this.shift.copy(to);
      this.applyShift();
      return Promise.resolve();
    }
    return this.tweens.run(
      duration,
      (t) => {
        this.shift.lerpVectors(from, to, t);
        this.applyShift();
      },
      { ease: ease.inOutCubic },
    );
  }

  async flyTo(
    to: Pose,
    options: { duration?: number; limits?: Limits; shift?: { x: number; y: number } } = {},
  ): Promise<void> {
    const id = ++this.flight;
    this.flying = true;
    const from = clonePose(this.pose);
    const fromShift = this.shift.clone();
    const toShift = options.shift ? new THREE.Vector2(options.shift.x, options.shift.y) : fromShift.clone();
    // Take the long way round if the yaw difference is big: keep it as given, limits are applied after.
    await this.tweens.run(
      options.duration ?? 1.2,
      (t) => {
        if (id !== this.flight) return;
        this.pose.target.lerpVectors(from.target, to.target, t);
        this.pose.yaw = lerp(from.yaw, to.yaw, t);
        this.pose.pitch = lerp(from.pitch, to.pitch, t);
        this.pose.dist = lerp(from.dist, to.dist, t);
        this.goal = clonePose(this.pose);
        this.shift.lerpVectors(fromShift, toShift, t);
        this.applyShift();
      },
      { ease: ease.inOutCubic },
    );
    if (id !== this.flight) return;
    this.flying = false;
    if (options.limits) this.setLimits(options.limits);
  }

  update(dt: number): void {
    this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 3));
    if (!this.flying) {
      const k = this.reduced ? 1 : 1 - Math.exp(-dt * 9);
      this.pose.target.lerp(this.goal.target, k);
      this.pose.yaw = lerp(this.pose.yaw, this.goal.yaw, k);
      this.pose.pitch = lerp(this.pose.pitch, this.goal.pitch, k);
      this.pose.dist = lerp(this.pose.dist, this.goal.dist, k);
    }
    this.place();
  }

  private place(): void {
    const nudge = this.reduced ? 0 : 1;
    const pose: Pose = {
      target: this.pose.target,
      yaw: this.pose.yaw + this.parallax.x * 0.035 * nudge,
      pitch: this.pose.pitch - this.parallax.y * 0.02 * nudge,
      dist: this.pose.dist,
    };
    this.orient(this.camera, pose);
    // Keep the matrices fresh for anything that projects points before the next render.
    this.camera.updateMatrixWorld(true);
  }

  private orient(camera: THREE.PerspectiveCamera, pose: Pose): void {
    const cp = Math.cos(pose.pitch);
    camera.position.set(
      pose.target.x + pose.dist * cp * Math.sin(pose.yaw),
      pose.target.y + pose.dist * Math.sin(pose.pitch),
      pose.target.z + pose.dist * cp * Math.cos(pose.yaw),
    );
    camera.lookAt(pose.target);
  }

  private applyShift(): void {
    const { w, h } = this.size;
    if (Math.abs(this.shift.x) < 0.5 && Math.abs(this.shift.y) < 0.5) {
      if (this.camera.view?.enabled) {
        this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    // Moving the render window one way moves the scene the other way.
    this.camera.setViewOffset(w, h, -this.shift.x, -this.shift.y, w, h);
  }
}
