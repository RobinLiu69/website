import * as THREE from 'three';
import type { MatingPiece } from '../chess/puzzles';
import { PALETTE } from '../theme';
import { GROUND_Y, type LayoutKind, PLINTH_TOP, STAGE_ORDER, plinthPositions } from './layout';
import type { PieceFactory } from './pieceMeshes';
import { type Tweens, ease } from './tween';

const TOKEN_SCALE = 1.35;
const LOCK_Y = PLINTH_TOP + 0.62;
const LOCK_SCALE = 0.82;
/** Approximate model heights, used to place labels above the tokens. */
const TOKEN_MODEL_HEIGHT: Record<MatingPiece, number> = { p: 0.95, n: 1.32, b: 1.42, r: 0.98, q: 1.62 };

const GHOST = new THREE.Color(0xa59b8c);
const SOLID = new THREE.Color(0xffffff);

/** One display stand: a plinth, the piece standing on it and the padlock in front of it. */
export class PlinthView {
  readonly group = new THREE.Group();
  readonly piece: MatingPiece;

  private readonly parts: THREE.Mesh[] = [];
  private readonly tokenPivot = new THREE.Group();
  private readonly tokenMaterial: THREE.MeshStandardMaterial;
  private readonly lock = new THREE.Group();
  private readonly shackle: THREE.Mesh;
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

    const stone = new THREE.MeshStandardMaterial({ color: PALETTE.plinth, flatShading: true, roughness: 0.92 });
    const stoneDark = new THREE.MeshStandardMaterial({ color: PALETTE.plinthDark, flatShading: true, roughness: 0.92 });
    const baseGeo = new THREE.CylinderGeometry(1.12, 1.26, 0.5, 8);
    const columnGeo = new THREE.CylinderGeometry(0.8, 0.96, 0.8, 8);
    const capGeo = new THREE.CylinderGeometry(1.06, 0.92, 0.2, 8);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number): void => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.parts.push(mesh);
    };
    add(baseGeo, stoneDark, GROUND_Y + 0.25);
    add(columnGeo, stone, -0.3);
    add(capGeo, stoneDark, 0.2);
    this.disposables.push(stone, stoneDark, baseGeo, columnGeo, capGeo);

    this.tokenMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.82,
      transparent: true,
      opacity: 0.55,
      color: GHOST,
      emissive: PALETTE.accent,
      emissiveIntensity: 0,
    });
    const token = new THREE.Mesh(factory.geometry(piece, 'w'), this.tokenMaterial);
    token.scale.setScalar(TOKEN_SCALE);
    token.receiveShadow = true;
    this.tokenPivot.position.y = PLINTH_TOP;
    this.tokenPivot.add(token);
    this.group.add(this.tokenPivot);
    this.parts.push(token);
    this.disposables.push(this.tokenMaterial);

    const lockBody = new THREE.MeshStandardMaterial({ color: PALETTE.boardRim, flatShading: true, roughness: 0.8 });
    const lockMetal = new THREE.MeshStandardMaterial({ color: 0xcdbd9f, flatShading: true, roughness: 0.6 });
    const lockDark = new THREE.MeshStandardMaterial({ color: PALETTE.ink, flatShading: true });
    const bodyGeo = new THREE.BoxGeometry(0.66, 0.52, 0.32);
    const shackleGeo = new THREE.TorusGeometry(0.2, 0.06, 5, 10, Math.PI);
    const keyGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.04, 6).rotateX(Math.PI / 2);
    const slotGeo = new THREE.BoxGeometry(0.045, 0.15, 0.04);
    const body = new THREE.Mesh(bodyGeo, lockBody);
    this.shackle = new THREE.Mesh(shackleGeo, lockMetal);
    this.shackle.position.y = 0.26;
    const key = new THREE.Mesh(keyGeo, lockDark);
    key.position.set(0, 0.05, 0.165);
    const slot = new THREE.Mesh(slotGeo, lockDark);
    slot.position.set(0, -0.06, 0.165);
    this.lock.add(body, this.shackle, key, slot);
    this.lock.position.set(0, LOCK_Y, 1.0);
    this.lock.scale.setScalar(LOCK_SCALE);
    for (const m of [body, this.shackle]) m.castShadow = true;
    this.group.add(this.lock);
    this.parts.push(body, this.shackle);
    this.disposables.push(lockBody, lockMetal, lockDark, bodyGeo, shackleGeo, keyGeo, slotGeo);

    const ringGeo = new THREE.RingGeometry(0.72, 0.92, 8).rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.accent,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMaterial);
    this.ring.position.y = PLINTH_TOP + 0.015;
    this.group.add(this.ring);
    this.disposables.push(ringGeo, this.ringMaterial);

    for (const mesh of this.parts) mesh.userData['plinth'] = piece;
    this.apply(0);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get pickables(): THREE.Mesh[] {
    return this.parts;
  }

  /** World position just above the token, where the HTML label hangs. */
  get labelAnchor(): THREE.Vector3 {
    const p = this.group.position;
    return new THREE.Vector3(p.x, PLINTH_TOP + TOKEN_MODEL_HEIGHT[this.piece] * TOKEN_SCALE + 0.55, p.z);
  }

  get tokenCenter(): THREE.Vector3 {
    const p = this.group.position;
    return new THREE.Vector3(p.x, PLINTH_TOP + (TOKEN_MODEL_HEIGHT[this.piece] * TOKEN_SCALE) / 2, p.z);
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

  /** A short flash of accent colour on the token. */
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
    this.tokenMaterial.opacity = 0.55 + 0.45 * u;
    this.tokenMaterial.color.lerpColors(GHOST, SOLID, u);
    this.tokenPivot.children.forEach((c) => (c.castShadow = u > 0.5));

    const open = Math.min(u / 0.3, 1);
    const drop = Math.max(0, Math.min((u - 0.3) / 0.7, 1));
    this.dropAmount = drop;
    this.shackle.position.y = 0.26 + 0.14 * open;
    this.shackle.rotation.z = -0.55 * open;
    this.lock.scale.setScalar(Math.max(1 - drop, 0.001) * LOCK_SCALE);
    this.lock.rotation.y = drop * 2.4;
    this.lock.visible = u < 0.995;
  }

  update(dt: number, time: number): void {
    this.hoverAmount += (this.hoverGoal - this.hoverAmount) * (1 - Math.exp(-dt * 10));
    const u = this.unlockAmount;
    const bob = Math.sin(time * 1.6 + this.phase) * 0.06 * u;
    this.tokenPivot.position.y = PLINTH_TOP + bob + this.hoverAmount * 0.14;
    this.tokenPivot.rotation.y = u * time * 0.45;
    this.tokenMaterial.emissiveIntensity = this.glow + this.hoverAmount * 0.12;

    if (this.lock.visible) {
      this.lock.rotation.z = Math.sin(time * 2 + this.phase) * 0.07 * (1 - u);
      this.lock.position.y = LOCK_Y - this.dropAmount * 0.9 + Math.sin(time * 1.8 + this.phase) * 0.03 * (1 - u);
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
