import * as THREE from 'three';
import type { MatingPiece } from '../chess/puzzles';
import { PALETTE } from '../theme';
import { GROUND_Y, type LayoutKind, PLINTH_TOP, STAGE_ORDER, plinthPositions } from './layout';
import type { PieceFactory } from './pieceMeshes';
import { type Ring, chamferBox, turnFacet } from './pieces/toolkit';
import { MARK_LAYER } from './sketch/pipeline';
import { type Tweens, ease } from './tween';

const TOKEN_SCALE = 1.35;
/** How firmly a locked piece is inked: it is only pencilled in until the section is unlocked. */
const PENCIL = 0.36;

/** Height of the lock on the plinth's column, and how far it hangs out from the axis. */
const LOCK_Y = -0.42;
const LOCK_Z = 0.99;

/** The stand: a footing, a waisted column with a ring, and a cap with a groove for the piece to stand in. */
const STAND: readonly Ring[] = [
  [0, GROUND_Y],
  [1.36, GROUND_Y],
  [1.42, GROUND_Y + 0.07],
  [1.42, GROUND_Y + 0.2],
  [1.28, GROUND_Y + 0.3],
  [1.18, GROUND_Y + 0.3],
  [1.02, -0.78],
  [0.95, -0.55],
  [0.93, -0.34],
  [1.05, -0.26, 0],
  [1.05, -0.16, 0],
  [0.95, -0.1, 0],
  [1.16, 0.0, 0],
  [1.16, 0.2, 0],
  [1.08, PLINTH_TOP],
  [0.86, PLINTH_TOP],
  [0.84, PLINTH_TOP - 0.02],
  [0.8, PLINTH_TOP - 0.02],
  [0.78, PLINTH_TOP],
  [0, PLINTH_TOP],
];

/** A padlock that hangs on the plinth: a hasp plate, a body with a keyhole and a shackle that can swing open. */
function buildLock(): { group: THREE.Group; shackle: THREE.Group; disposables: Array<{ dispose(): void }> } {
  const body = new THREE.MeshLambertMaterial({ color: 0xb4b4b4 });
  const metal = new THREE.MeshLambertMaterial({ color: 0xdcdcdc });
  const plate = new THREE.MeshLambertMaterial({ color: 0xcfcfcf });
  const ink = new THREE.MeshLambertMaterial({ color: 0x050505 });

  const plateGeo = chamferBox(0.78, 0.66, 0.05, 0.015);
  const bodyGeo = chamferBox(0.5, 0.42, 0.2, 0.05);
  const keyGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16).rotateX(Math.PI / 2);
  const slotGeo = new THREE.BoxGeometry(0.035, 0.15, 0.03);
  const arcGeo = new THREE.TorusGeometry(0.15, 0.04, 8, 22, Math.PI);
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10);
  const rivetGeo = new THREE.SphereGeometry(0.03, 10, 6);

  const group = new THREE.Group();
  const backing = new THREE.Mesh(plateGeo, plate);
  backing.position.z = -0.1;
  const lockBody = new THREE.Mesh(bodyGeo, body);
  const key = new THREE.Mesh(keyGeo, ink);
  key.position.set(0, 0.04, 0.105);
  const slot = new THREE.Mesh(slotGeo, ink);
  slot.position.set(0, -0.07, 0.105);
  group.add(backing, lockBody, key, slot);
  for (const [x, y] of [
    [-0.3, 0.24],
    [0.3, 0.24],
    [-0.3, -0.24],
    [0.3, -0.24],
  ] as const) {
    const rivet = new THREE.Mesh(rivetGeo, metal);
    rivet.position.set(x, y, -0.07);
    group.add(rivet);
  }

  const shackle = new THREE.Group();
  const arc = new THREE.Mesh(arcGeo, metal);
  const left = new THREE.Mesh(legGeo, metal);
  left.position.set(-0.15, -0.08, 0);
  const right = new THREE.Mesh(legGeo, metal);
  right.position.set(0.15, -0.08, 0);
  shackle.add(arc, left, right);
  shackle.position.y = 0.21;
  group.add(shackle);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    group,
    shackle,
    disposables: [body, metal, plate, ink, plateGeo, bodyGeo, keyGeo, slotGeo, arcGeo, legGeo, rivetGeo],
  };
}

/** One display stand: a plinth, the piece standing on it and the padlock hanging from its front. */
export class PlinthView {
  readonly group = new THREE.Group();
  readonly piece: MatingPiece;

  private readonly parts: THREE.Mesh[] = [];
  private readonly tokenPivot = new THREE.Group();
  private readonly tokenMaterial: THREE.MeshLambertMaterial;
  private readonly tokenHeight: number;
  private readonly lock = new THREE.Group();
  private readonly shackle: THREE.Group;
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly phase = Math.random() * Math.PI * 2;

  private unlockAmount = 0;
  private dropAmount = 0;
  private hoverAmount = 0;
  private hoverGoal = 0;
  private glow = 0;
  private locked = true;

  constructor(
    piece: MatingPiece,
    factory: PieceFactory,
    private readonly tweens: Tweens,
  ) {
    this.piece = piece;
    this.group.name = `plinth-${piece}`;

    const stone = new THREE.MeshLambertMaterial({ color: PALETTE.plinth, flatShading: true });
    const standGeo = turnFacet(STAND, 12);
    const stand = new THREE.Mesh(standGeo, stone);
    stand.castShadow = true;
    stand.receiveShadow = true;
    this.group.add(stand);
    this.parts.push(stand);
    this.disposables.push(stone, standGeo);

    // The piece is drawn with whatever ink the section has earned: its alpha is read by the sketch pass as pen pressure.
    this.tokenMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      opacity: PENCIL,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
      emissive: PALETTE.accent,
      emissiveIntensity: 0,
    });
    const geometry = factory.geometry(piece, 'w');
    this.tokenHeight = (geometry.boundingBox?.max.y ?? 1.4) * TOKEN_SCALE;
    const token = new THREE.Mesh(geometry, this.tokenMaterial);
    token.scale.setScalar(TOKEN_SCALE);
    token.receiveShadow = true;
    this.tokenPivot.position.y = PLINTH_TOP;
    this.tokenPivot.add(token);
    this.group.add(this.tokenPivot);
    this.parts.push(token);
    this.disposables.push(this.tokenMaterial);

    const built = buildLock();
    this.lock.add(built.group);
    this.shackle = built.shackle;
    this.lock.position.set(0, LOCK_Y, LOCK_Z);
    this.group.add(this.lock);
    this.disposables.push(...built.disposables);
    built.group.traverse((o) => {
      if (o instanceof THREE.Mesh) this.parts.push(o);
    });

    const ringGeo = new THREE.RingGeometry(0.66, 0.9, 48).rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.accent,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMaterial);
    this.ring.position.y = PLINTH_TOP + 0.015;
    this.ring.layers.set(MARK_LAYER);
    this.group.add(this.ring);
    this.disposables.push(ringGeo, this.ringMaterial);

    for (const mesh of this.parts) mesh.userData['plinth'] = piece;
    this.apply(0);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Height of the token above the plinth top. */
  get height(): number {
    return this.tokenHeight;
  }

  get pickables(): THREE.Mesh[] {
    return this.parts;
  }

  /** World position just above the token, where the HTML label hangs. */
  get labelAnchor(): THREE.Vector3 {
    const p = this.group.position;
    return new THREE.Vector3(p.x, PLINTH_TOP + this.tokenHeight + 0.5, p.z);
  }

  get tokenCenter(): THREE.Vector3 {
    const p = this.group.position;
    return new THREE.Vector3(p.x, PLINTH_TOP + this.tokenHeight / 2, p.z);
  }

  placeAt(position: THREE.Vector3, facing: THREE.Vector3): void {
    this.group.position.set(position.x, 0, position.z);
    this.group.rotation.y = Math.atan2(facing.x - position.x, facing.z - position.z);
  }

  setHover(on: boolean): void {
    this.hoverGoal = on ? 1 : 0;
  }

  setLocked(locked: boolean, animate = true): Promise<void> {
    this.locked = locked;
    const from = this.unlockAmount;
    const to = locked ? 0 : 1;
    if (!animate || from === to) {
      this.apply(to);
      return Promise.resolve();
    }
    return this.tweens.run(1.1, (t) => this.apply(from + (to - from) * t), { ease: ease.inOutCubic });
  }

  /** A short flash of marker colour on the token. */
  flash(): Promise<void> {
    return this.tweens.run(
      1.1,
      (t) => {
        this.glow = Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.7;
      },
      { ease: ease.linear },
    );
  }

  private apply(u: number): void {
    this.unlockAmount = u;
    this.tokenMaterial.opacity = PENCIL + (1 - PENCIL) * u;
    this.tokenPivot.children.forEach((c) => (c.castShadow = u > 0.5));

    const open = Math.min(u / 0.3, 1);
    const drop = Math.max(0, Math.min((u - 0.3) / 0.7, 1));
    this.dropAmount = drop;
    this.shackle.position.y = 0.21 + 0.1 * open;
    this.shackle.rotation.z = -0.5 * open;
    this.lock.scale.setScalar(Math.max(1 - drop, 0.001));
    this.lock.rotation.y = drop * 2.4;
    this.lock.visible = u < 0.995;
  }

  update(dt: number, time: number): void {
    this.hoverAmount += (this.hoverGoal - this.hoverAmount) * (1 - Math.exp(-dt * 10));
    const u = this.unlockAmount;
    const bob = Math.sin(time * 1.6 + this.phase) * 0.06 * u;
    this.tokenPivot.position.y = PLINTH_TOP + bob + this.hoverAmount * 0.14;
    this.tokenPivot.rotation.y = u * time * 0.45;
    this.tokenMaterial.emissiveIntensity = this.glow + this.hoverAmount * 0.14;

    if (this.lock.visible) {
      this.lock.rotation.z = Math.sin(time * 2 + this.phase) * 0.05 * (1 - u);
      this.lock.position.y = LOCK_Y - this.dropAmount * 0.9 + Math.sin(time * 1.8 + this.phase) * 0.012 * (1 - u);
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + this.phase);
    this.ringMaterial.opacity = u * (0.45 + 0.35 * pulse);
    this.ring.scale.setScalar(1 + 0.05 * pulse);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

/** The five plinths together. */
export class Plinths {
  readonly root = new THREE.Group();
  readonly views = new Map<MatingPiece, PlinthView>();
  private kind: LayoutKind = 'arc';

  constructor(factory: PieceFactory, tweens: Tweens) {
    this.root.name = 'plinths';
    for (const piece of STAGE_ORDER) {
      const view = new PlinthView(piece, factory, tweens);
      this.views.set(piece, view);
      this.root.add(view.group);
    }
    this.layout('arc');
  }

  get layoutKind(): LayoutKind {
    return this.kind;
  }

  layout(kind: LayoutKind): void {
    this.kind = kind;
    const positions = plinthPositions(kind);
    const camera = new THREE.Vector3(0, 0, 40);
    for (const [piece, view] of this.views) view.placeAt(positions[piece], camera);
  }

  get pickables(): THREE.Mesh[] {
    return [...this.views.values()].flatMap((v) => v.pickables);
  }

  /** How tall each token stands above its plinth. */
  tokenHeights(): Record<MatingPiece, number> {
    const out = {} as Record<MatingPiece, number>;
    this.views.forEach((v, piece) => (out[piece] = v.height));
    return out;
  }

  fromObject(object: THREE.Object3D | null): PlinthView | undefined {
    const piece = object?.userData['plinth'] as MatingPiece | undefined;
    return piece ? this.views.get(piece) : undefined;
  }

  update(dt: number, time: number): void {
    this.views.forEach((v) => v.update(dt, time));
  }

  dispose(): void {
    this.views.forEach((v) => v.dispose());
  }
}
