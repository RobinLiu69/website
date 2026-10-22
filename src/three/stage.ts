import * as THREE from 'three';
import { PALETTE } from '../theme';
import { CameraRig } from './cameraRig';
import { addLighting } from './lighting';
import { SketchPipeline } from './sketch/pipeline';
import { Tweens } from './tween';

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL is not available');
    this.name = 'WebGLUnavailableError';
    this.cause = cause;
  }
}

export type FrameHook = (dt: number, time: number) => void;

/** Renderer, scene, lights, camera rig and the frame loop. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly tweens = new Tweens();
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: CameraRig;
  readonly sketch: SketchPipeline;
  /** Drawn last, over the finished picture: the pen-work that is not part of the scene (coordinates, construction lines). */
  readonly overlay = new THREE.Scene();
  readonly reducedMotion: boolean;
  /** Longest slice of time one frame may advance animations by, in seconds. */
  maxDt = 0.1;

  private readonly hooks = new Set<FrameHook>();
  private readonly resizeHooks = new Set<(w: number, h: number) => void>();
  private readonly observer: ResizeObserver;
  private readonly modest: boolean;
  /** The most pixels per CSS pixel the drawing may use. It only ever comes down, when the device cannot keep up. */
  private ratioCap: number;
  private frameMs = 16;
  private slowFrames = 0;
  private readonly lamp = new THREE.Vector2();
  private last = 0;
  private time = 0;

  constructor(readonly container: HTMLElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      throw new WebGLUnavailableError(error);
    }
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.tweens.instant = this.reducedMotion;

    this.renderer.setClearColor(PALETTE.bg);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage-canvas';
    container.appendChild(canvas);

    this.rig = new CameraRig(this.tweens);
    this.rig.reduced = this.reducedMotion;

    // Smaller phones and low-core machines get a cheaper shadow map and a coarser drawing.
    this.modest = Math.max(screen.width, screen.height) <= 900 || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.ratioCap = this.modest ? 1.5 : 2;
    addLighting(this.scene, { shadowSize: this.modest ? 1024 : 2048 });
    this.sketch = new SketchPipeline(this.renderer);
    this.sketch.overlay = this.overlay;

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  onFrame(hook: FrameHook): () => void {
    this.hooks.add(hook);
    return () => this.hooks.delete(hook);
  }

  onResize(hook: (w: number, h: number) => void): () => void {
    this.resizeHooks.add(hook);
    return () => this.resizeHooks.delete(hook);
  }

  get size(): { w: number; h: number } {
    return { w: this.container.clientWidth, h: this.container.clientHeight };
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    // Hairlines are all the drawing is made of, so it wants the screen's full resolution; a modest device takes a coarser one.
    const ratio = Math.min(window.devicePixelRatio || 1, this.ratioCap);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.sketch.setSize(w, h, ratio);
    // On a small screen the pieces are small too, so the hatching gets finer with them.
    this.sketch.setLook({ hatchGap: Math.min(4.8, Math.max(3.4, h / 190)) });
    this.rig.setSize(w, h);
    this.resizeHooks.forEach((hook) => hook(w, h));
  }

  start(): void {
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  private frame(now: number): void {
    const dt = Math.min((now - (this.last || now)) / 1000, this.maxDt);
    this.last = now;
    this.time += dt;
    this.tweens.step(dt);
    this.rig.update(dt);
    this.hooks.forEach((hook) => hook(dt, this.time));
    // The lamp leans a little toward the pointer, as if it were held in a hand.
    this.lamp.lerp(this.rig.parallaxTarget, 1 - Math.exp(-dt * 1.6));
    this.sketch.setLampOffset(this.lamp.x * 0.22, this.lamp.y * 0.22);
    this.sketch.render(this.scene, this.rig.camera);
    this.watchSpeed(now);
  }

  /**
   * The drawing is done pixel by pixel, so a big, dense screen on a weak GPU can be too much. If frames stay slow
   * for a couple of seconds, draw at fewer pixels (down to one per CSS pixel) rather than stutter.
   */
  private lastFrameAt = 0;
  private watchSpeed(now: number): void {
    const elapsed = now - this.lastFrameAt;
    this.lastFrameAt = now;
    // Skip the gaps of a hidden tab and the first frames, which are spent compiling shaders.
    if (elapsed <= 0 || elapsed > 400 || this.time < 3) return;
    this.frameMs += (elapsed - this.frameMs) * 0.08;
    this.slowFrames = this.frameMs > 30 ? this.slowFrames + 1 : 0;
    const ratio = Math.min(window.devicePixelRatio || 1, this.ratioCap);
    if (this.slowFrames > 90 && ratio > 1) {
      this.ratioCap = Math.max(1, ratio - 0.25);
      this.slowFrames = 0;
      this.resize();
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.tweens.flush();
    this.sketch.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
