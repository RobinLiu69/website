import * as THREE from 'three';
import { FRAGMENT, VERTEX } from './shader';

/** Objects on this layer are drawn in the lit pass only: they leave no outline (marks, shards, the ground shadow). */
export const MARK_LAYER = 1;

export interface SketchLook {
  paper: number;
  ink: number;
  accent: number;
  /** Ink wanted (0 = bare paper, 1 = black) at which each of the four hatching directions begins. */
  tone: readonly [number, number, number, number];
  /** Ink wanted at which the pen gives up on hatching and fills the area in. */
  solid: number;
  /** CSS px between hatch lines. */
  hatchGap: number;
  /** Outline half width in CSS px. */
  line: number;
  /** 0..1: how firmly the edges between facets are drawn, against silhouettes. */
  crease: number;
}

export const DEFAULT_LOOK: SketchLook = {
  paper: 0xf7f5f0,
  ink: 0x1d1d21,
  accent: 0xe2704a,
  tone: [0.08, 0.34, 0.6, 0.8],
  solid: 0.9,
  hatchGap: 5.4,
  line: 1,
  crease: 0.5,
};

/**
 * Draws a scene as a pen drawing. The scene is rendered three times: lit (what is dark gets hatched),
 * as normals + depth (what gets outlined), and then both are combined into the picture. An optional
 * overlay scene (construction lines) is drawn on top, unaffected by any of it.
 */
export class SketchPipeline {
  overlay: THREE.Scene | null = null;

  private readonly lit: THREE.WebGLRenderTarget;
  private readonly geometry: THREE.WebGLRenderTarget;
  private readonly normals = new THREE.MeshNormalMaterial();
  private readonly composite: THREE.ShaderMaterial;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private pixelRatio = 1;
  private seed = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    look: SketchLook = DEFAULT_LOOK,
  ) {
    const samples = 4;
    this.lit = new THREE.WebGLRenderTarget(2, 2, { samples, type: THREE.UnsignedByteType });
    this.geometry = new THREE.WebGLRenderTarget(2, 2, {
      samples,
      type: THREE.UnsignedByteType,
      depthTexture: new THREE.DepthTexture(2, 2),
    });

    this.composite = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tBeauty: { value: this.lit.texture },
        tNormal: { value: this.geometry.texture },
        tDepth: { value: this.geometry.depthTexture },
        uRes: { value: new THREE.Vector2(2, 2) },
        uUnit: { value: 1 },
        uNear: { value: 0.5 },
        uFar: { value: 220 },
        uSeed: { value: 0 },
        uPaper: { value: new THREE.Color() },
        uInk: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uTone: { value: new THREE.Vector4() },
        uSolid: { value: 0.97 },
        uHatchGap: { value: 5 },
        uLine: { value: 1 },
        uCrease: { value: 0.5 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.setLook(look);
  }

  setLook(look: Partial<SketchLook>): void {
    const u = this.composite.uniforms as Record<string, THREE.IUniform>;
    // The pass writes display colours straight to the screen, so the colours must not be converted.
    const raw = (hex: number): THREE.Color => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
    if (look.paper !== undefined) (u['uPaper'] as THREE.IUniform<THREE.Color>).value.copy(raw(look.paper));
    if (look.ink !== undefined) (u['uInk'] as THREE.IUniform<THREE.Color>).value.copy(raw(look.ink));
    if (look.accent !== undefined) (u['uAccent'] as THREE.IUniform<THREE.Color>).value.copy(raw(look.accent));
    if (look.tone) (u['uTone'] as THREE.IUniform<THREE.Vector4>).value.set(...look.tone);
    if (look.solid !== undefined) (u['uSolid'] as THREE.IUniform<number>).value = look.solid;
    if (look.hatchGap !== undefined) (u['uHatchGap'] as THREE.IUniform<number>).value = look.hatchGap;
    if (look.line !== undefined) (u['uLine'] as THREE.IUniform<number>).value = look.line;
    if (look.crease !== undefined) (u['uCrease'] as THREE.IUniform<number>).value = look.crease;
  }

  /** Re-rolls the wobble, so a re-drawn picture is never the same twice. */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /** `width` and `height` in CSS px. */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    this.lit.setSize(w, h);
    this.geometry.setSize(w, h);
    const u = this.composite.uniforms as Record<string, THREE.IUniform>;
    (u['uRes'] as THREE.IUniform<THREE.Vector2>).value.set(w, h);
    (u['uUnit'] as THREE.IUniform<number>).value = pixelRatio;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    const previous = {
      target: r.getRenderTarget(),
      autoClear: r.autoClear,
      shadowAuto: r.shadowMap.autoUpdate,
      clear: r.getClearColor(new THREE.Color()),
      alpha: r.getClearAlpha(),
    };

    // 1. The lit picture, on white paper.
    camera.layers.enable(MARK_LAYER);
    r.setRenderTarget(this.lit);
    r.setClearColor(0xffffff, 1);
    r.clear();
    r.render(scene, camera);

    // 2. Normals and depth of everything that gets an outline.
    camera.layers.disable(MARK_LAYER);
    r.shadowMap.autoUpdate = false;
    scene.overrideMaterial = this.normals;
    r.setRenderTarget(this.geometry);
    r.setClearColor(0x8080ff, 1);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null;
    r.shadowMap.autoUpdate = previous.shadowAuto;
    camera.layers.enable(MARK_LAYER);

    // 3. Combine.
    const u = this.composite.uniforms as Record<string, THREE.IUniform<number>>;
    (u['uNear'] as THREE.IUniform<number>).value = camera.near;
    (u['uFar'] as THREE.IUniform<number>).value = camera.far;
    (u['uSeed'] as THREE.IUniform<number>).value = this.seed;
    r.setRenderTarget(null);
    r.setClearColor(previous.clear, previous.alpha);
    r.autoClear = true;
    r.render(this.quadScene, this.quadCamera);

    // 4. Construction lines, on top.
    if (this.overlay) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.overlay, camera);
    }
    r.autoClear = previous.autoClear;
    r.setRenderTarget(previous.target);
  }

  get ratio(): number {
    return this.pixelRatio;
  }

  dispose(): void {
    this.lit.dispose();
    this.geometry.dispose();
    this.geometry.depthTexture?.dispose();
    this.normals.dispose();
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}
