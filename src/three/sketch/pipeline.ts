import * as THREE from 'three';
import { FRAGMENT, VERTEX } from './shader';

/** Objects on this layer are drawn in the lit pass only: they leave no outline (marks, shards). */
export const MARK_LAYER = 1;

export interface SketchLook {
  /** The dark sheet, and the same sheet inside the lamp's pool of light. */
  paper: number;
  paperLit: number;
  chalk: number;
  accent: number;
  /** Brightness (0 = bare sheet, 1 = white) at which each of the four hatching directions begins. */
  tone: readonly [number, number, number, number];
  /** Brightness at which the chalk gives up on hatching and fills the area in. */
  solid: number;
  /** CSS px between hatch lines. */
  hatchGap: number;
  /** Outline half width in CSS px. */
  line: number;
  /** 0..1: how firmly the edges between facets are drawn, against silhouettes. */
  crease: number;
}

export const DEFAULT_LOOK: SketchLook = {
  paper: 0x0c0c0f,
  paperLit: 0x1d1d23,
  chalk: 0xece8df,
  accent: 0xf0904f,
  tone: [0.38, 0.8, 0.97, 1.5],
  solid: 0.985,
  hatchGap: 4.6,
  line: 1,
  crease: 0.5,
};

const NDC_CENTER = new THREE.Vector3(0, 0.4, 0);

/**
 * Draws a scene as a chalk drawing. The scene is rendered three times: lit (what is bright gets hatched), as
 * normals + depth (what gets outlined), and then both are combined into the picture. An optional overlay scene
 * (construction lines) is drawn after that, unaffected by any of it, but hidden where the scene is in front of it.
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
  private readonly center = new THREE.Vector3();
  private readonly lampOffset = new THREE.Vector2();
  private pixelRatio = 1;

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
      // The depth test must stay on for the depth to be written; it just always passes.
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
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
        uPaperLit: { value: new THREE.Color() },
        uChalk: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uTone: { value: new THREE.Vector4() },
        uSolid: { value: 0.975 },
        uHatchGap: { value: 5 },
        uLine: { value: 1 },
        uCrease: { value: 0.5 },
        uCenter: { value: new THREE.Vector2() },
        uReveal: { value: 1 },
        uExposure: { value: 1 },
        uDebug: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.setLook(look);
  }

  private uniform<T>(name: string): THREE.IUniform<T> {
    return this.composite.uniforms[name] as THREE.IUniform<T>;
  }

  setLook(look: Partial<SketchLook>): void {
    // The pass writes display colours straight to the screen, so the colours must not be converted.
    const raw = (hex: number): THREE.Color => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
    if (look.paper !== undefined) this.uniform<THREE.Color>('uPaper').value.copy(raw(look.paper));
    if (look.paperLit !== undefined) this.uniform<THREE.Color>('uPaperLit').value.copy(raw(look.paperLit));
    if (look.chalk !== undefined) this.uniform<THREE.Color>('uChalk').value.copy(raw(look.chalk));
    if (look.accent !== undefined) this.uniform<THREE.Color>('uAccent').value.copy(raw(look.accent));
    if (look.tone) this.uniform<THREE.Vector4>('uTone').value.set(...look.tone);
    if (look.solid !== undefined) this.uniform<number>('uSolid').value = look.solid;
    if (look.hatchGap !== undefined) this.uniform<number>('uHatchGap').value = look.hatchGap;
    if (look.line !== undefined) this.uniform<number>('uLine').value = look.line;
    if (look.crease !== undefined) this.uniform<number>('uCrease').value = look.crease;
  }

  /** Moves the lamp off the middle of the board, e.g. to lean toward the pointer (NDC units, small). */
  setLampOffset(x: number, y: number): void {
    this.lampOffset.set(x, y);
  }

  /** 0 = nothing drawn yet, 1 = all of it. */
  setReveal(amount: number): void {
    this.uniform<number>('uReveal').value = amount;
  }

  /** Overall chalk strength: lower it to let the drawing recede. */
  setExposure(amount: number): void {
    this.uniform<number>('uExposure').value = amount;
  }

  /** Shows the brightness the scene is lit with instead of the drawing (for tuning the lights). */
  setDebug(on: boolean): void {
    this.uniform<number>('uDebug').value = on ? 1 : 0;
  }

  /** `width` and `height` in CSS px. */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    this.lit.setSize(w, h);
    this.geometry.setSize(w, h);
    this.uniform<THREE.Vector2>('uRes').value.set(w, h);
    this.uniform<number>('uUnit').value = pixelRatio;
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

    // 1. The lit picture, on a black sheet.
    camera.layers.enable(MARK_LAYER);
    r.setRenderTarget(this.lit);
    r.setClearColor(0x000000, 1);
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

    // 3. Combine. The lamp hangs over the middle of the board, wherever the camera has put it on screen.
    this.center.copy(NDC_CENTER).project(camera);
    this.uniform<THREE.Vector2>('uCenter').value.set(this.center.x + this.lampOffset.x, this.center.y + this.lampOffset.y);
    this.uniform<number>('uNear').value = camera.near;
    this.uniform<number>('uFar').value = camera.far;
    r.setRenderTarget(null);
    r.setClearColor(previous.clear, previous.alpha);
    r.autoClear = true;
    r.render(this.quadScene, this.quadCamera);

    // 4. Construction lines, drawn against the scene's depth: they pass behind the board and the pieces.
    if (this.overlay) {
      r.autoClear = false;
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
