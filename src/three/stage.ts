import * as THREE from 'three';
import { PALETTE } from '../theme';
import { CameraRig } from './cameraRig';
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
  readonly reducedMotion: boolean;
  /** Longest slice of time one frame may advance animations by, in seconds. */
  maxDt = 0.1;

  private readonly hooks = new Set<FrameHook>();
  private readonly resizeHooks = new Set<(w: number, h: number) => void>();
  private readonly observer: ResizeObserver;
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

    this.buildEnvironment();

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  private buildEnvironment(): void {
    const hemi = new THREE.HemisphereLight(0xfff6ea, 0xcdbba2, 1.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-6, 13, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -12;
    cam.right = 12;
    cam.top = 12;
    cam.bottom = -12;
    cam.near = 2;
    cam.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun);

    // Soft fill from the camera side so vertical faces never go flat grey.
    const fill = new THREE.DirectionalLight(0xfff0e0, 0.85);
    fill.position.set(4, 7, 14);
    this.scene.add(fill);

    // A soft disc to stand everything on, and a catcher for the shadows.
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(233, 225, 211, 1)');
      g.addColorStop(0.55, 'rgba(236, 229, 217, 0.85)');
      g.addColorStop(1, 'rgba(242, 237, 228, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(19, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    disc.position.y = -1.2;
    disc.renderOrder = -1;
    this.scene.add(disc);

    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ color: PALETTE.shadow, opacity: 0.2 }),
    );
    catcher.position.y = -1.19;
    catcher.receiveShadow = true;
    this.scene.add(catcher);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
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
    this.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.tweens.flush();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
