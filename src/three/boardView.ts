import * as THREE from 'three';
import type { Position } from '../chess/position';
import {
  type Color,
  type PieceType,
  type Square,
  fileOf,
  inBounds,
  rankOf,
  toSquare,
} from '../chess/types';
import { PALETTE } from '../theme';
import type { PieceFactory } from './pieceMeshes';
import { type Tweens, ease } from './tween';

/** Files run left to right, ranks run toward -z, so white sits nearest the camera. */
export function squareCenter(square: Square, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(fileOf(square) - 3.5, y, 3.5 - rankOf(square));
}

export function squareAt(x: number, z: number): Square | null {
  const file = Math.floor(x + 4);
  const rank = Math.floor(4 - z);
  return inBounds(file, rank) ? toSquare(file, rank) : null;
}

/** Pieces are drawn a little under a square's width so neighbours do not crowd each other. */
const PIECE_SCALE = 0.92;

/**
 * Knights stand in profile, looking toward the middle of the board, so the
 * horse reads from the default camera instead of showing a thin slab.
 */
function knightYaw(file: number): number {
  return file < 4 ? 0 : Math.PI;
}

export interface PieceView {
  id: number;
  type: PieceType;
  color: Color;
  square: Square;
  object: THREE.Group;
  mesh: THREE.Mesh;
  /** Bumped whenever something takes over the piece's position, which cancels any hop in flight. */
  motion: number;
}

export interface MoveOptions {
  /** Seconds. Defaults to a duration that grows with the distance travelled. */
  duration?: number;
  /** Peak height of the hop arc. */
  hop?: number;
  delay?: number;
}

function squareFrame(outer: number, inner: number): THREE.BufferGeometry {
  const o = outer / 2;
  const i = inner / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-o, -o);
  shape.lineTo(o, -o);
  shape.lineTo(o, o);
  shape.lineTo(-o, o);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-i, -i);
  hole.lineTo(-i, i);
  hole.lineTo(i, i);
  hole.lineTo(i, -i);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

function overlay(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** The board, its squares and every piece standing on it. */
export class BoardView {
  readonly root = new THREE.Group();
  private readonly piecesRoot = new THREE.Group();
  private readonly views = new Map<number, PieceView>();
  private pickMeshes: THREE.Mesh[] = [];

  private readonly hoverMark: THREE.Mesh;
  private readonly selectMark: THREE.Mesh;
  private readonly checkMarks: THREE.Mesh[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly tweens: Tweens,
    private readonly factory: PieceFactory,
  ) {
    this.root.name = 'board';
    this.buildBoard();
    this.root.add(this.piecesRoot);

    const fill = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const frame = squareFrame(0.98, 0.84);
    this.disposables.push(fill, frame);

    const hoverMaterial = overlay(PALETTE.accent, 0.5);
    const selectMaterial = overlay(PALETTE.accentDeep, 0.95);
    const checkMaterial = overlay(PALETTE.accentDeep, 0.9);
    this.disposables.push(hoverMaterial, selectMaterial, checkMaterial);

    this.hoverMark = new THREE.Mesh(fill, hoverMaterial);
    this.selectMark = new THREE.Mesh(frame, selectMaterial);
    for (const mark of [this.hoverMark, this.selectMark]) {
      mark.position.y = 0.012;
      mark.visible = false;
      mark.renderOrder = 2;
      this.root.add(mark);
    }
    for (let i = 0; i < 2; i++) {
      const mark = new THREE.Mesh(frame, checkMaterial);
      mark.position.y = 0.014;
      mark.visible = false;
      mark.renderOrder = 2;
      this.checkMarks.push(mark);
      this.root.add(mark);
    }
  }

  private buildBoard(): void {
    const squareGeo = new THREE.BoxGeometry(1, 0.2, 1);
    const lightMat = new THREE.MeshStandardMaterial({ color: PALETTE.boardLight, roughness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: PALETTE.boardDark, roughness: 0.9 });
    const light = new THREE.InstancedMesh(squareGeo, lightMat, 32);
    const dark = new THREE.InstancedMesh(squareGeo, darkMat, 32);
    const matrix = new THREE.Matrix4();
    let li = 0;
    let di = 0;
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        matrix.makeTranslation(file - 3.5, -0.1, 3.5 - rank);
        // a1 is a dark square.
        if ((file + rank) % 2 === 0) dark.setMatrixAt(di++, matrix);
        else light.setMatrixAt(li++, matrix);
      }
    }
    for (const mesh of [light, dark]) {
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.root.add(mesh);
    }

    const rimMat = new THREE.MeshStandardMaterial({ color: PALETTE.boardRim, roughness: 0.9, flatShading: true });
    const rimParts: Array<[number, number, number, number]> = [
      // width, depth, x, z
      [8.8, 0.4, 0, -4.2],
      [8.8, 0.4, 0, 4.2],
      [0.4, 8.0, -4.2, 0],
      [0.4, 8.0, 4.2, 0],
    ];
    const rimGeos = rimParts.map(([w, d, x, z]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), rimMat);
      mesh.position.set(x, -0.06, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh.geometry;
    });

    this.buildCoordinates();

    // A tapered slab underneath, so the board reads as a floating tray.
    const baseGeo = new THREE.CylinderGeometry(6.5, 5.4, 0.55, 4, 1).rotateY(Math.PI / 4);
    const baseMat = new THREE.MeshStandardMaterial({ color: PALETTE.boardBase, roughness: 0.95, flatShading: true });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.475;
    base.castShadow = true;
    base.receiveShadow = true;
    this.root.add(base);

    this.disposables.push(squareGeo, lightMat, darkMat, rimMat, baseGeo, baseMat, ...rimGeos);
  }

  /** a-h along the front rim and 1-8 down the left one, as seen from white's side. */
  private buildCoordinates(): void {
    const geometry = new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2);
    this.disposables.push(geometry);
    const add = (text: string, x: number, z: number): void => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#f3e9d8';
      ctx.font = '600 42px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, size / 2, size / 2 + 3);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 0.085, z);
      this.root.add(mesh);
      this.disposables.push(texture, material);
    };
    for (let file = 0; file < 8; file++) add('abcdefgh'.charAt(file), file - 3.5, 4.2);
    for (let rank = 0; rank < 8; rank++) add(String(rank + 1), -4.2, 3.5 - rank);
  }

  /* ----------------------------- queries ----------------------------- */

  get pickables(): THREE.Mesh[] {
    return this.pickMeshes;
  }

  viewById(id: number): PieceView | undefined {
    return this.views.get(id);
  }

  viewFromObject(object: THREE.Object3D | null): PieceView | undefined {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      const id = o.userData['pieceId'] as number | undefined;
      if (id !== undefined) return this.views.get(id);
    }
    return undefined;
  }

  viewAtSquare(square: Square): PieceView | undefined {
    for (const view of this.views.values()) if (view.square === square) return view;
    return undefined;
  }

  allViews(): PieceView[] {
    return [...this.views.values()];
  }

  /* ----------------------------- markers ----------------------------- */

  hover(square: Square | null): void {
    this.placeMark(this.hoverMark, square);
  }

  select(square: Square | null): void {
    this.placeMark(this.selectMark, square);
  }

  setChecked(squares: Square[]): void {
    this.checkMarks.forEach((mark, i) => this.placeMark(mark, squares[i] ?? null));
  }

  private placeMark(mark: THREE.Mesh, square: Square | null): void {
    mark.visible = square !== null;
    if (square !== null) {
      const p = squareCenter(square);
      mark.position.x = p.x;
      mark.position.z = p.z;
    }
  }

  /* ------------------------------ pieces ------------------------------ */

  private refreshPickables(): void {
    this.pickMeshes = [...this.views.values()].map((v) => v.mesh);
  }

  addPiece(
    id: number,
    type: PieceType,
    color: Color,
    square: Square,
    options: { pop?: boolean; delay?: number } = {},
  ): PieceView {
    const mesh = this.factory.create(type, color);
    mesh.scale.setScalar(PIECE_SCALE);
    if (type === 'n') mesh.rotation.y = knightYaw(fileOf(square));
    const object = new THREE.Group();
    object.add(mesh);
    object.userData['pieceId'] = id;
    mesh.userData['pieceId'] = id;
    squareCenter(square, 0, object.position);
    this.piecesRoot.add(object);

    const view: PieceView = { id, type, color, square, object, mesh, motion: 0 };
    this.views.set(id, view);
    this.refreshPickables();

    if (options.pop) {
      object.scale.setScalar(0.001);
      object.position.y = -0.8;
      void this.tweens.run(
        0.55,
        (t) => {
          object.scale.setScalar(Math.max(t, 0.001));
          object.position.y = -0.8 * (1 - t);
        },
        { delay: options.delay ?? 0, ease: ease.outBack },
      );
    }
    return view;
  }

  /** Removes a piece with no animation. */
  removePiece(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    this.piecesRoot.remove(view.object);
    this.views.delete(id);
    this.refreshPickables();
  }

  /** Shrinks a piece away, then removes it. */
  async fadeOutPiece(id: number, delay = 0): Promise<void> {
    const view = this.views.get(id);
    if (!view) return;
    const startY = view.object.position.y;
    await this.tweens.run(
      0.32,
      (t) => {
        view.object.scale.setScalar(Math.max(1 - t, 0.001));
        view.object.position.y = startY - 0.3 * t;
      },
      { delay, ease: ease.inCubic },
    );
    this.removePiece(id);
  }

  /** Swaps the mesh for a different piece type, with a little pop. */
  setType(view: PieceView, type: PieceType): void {
    view.type = type;
    view.mesh.geometry = this.factory.geometry(type, view.color);
    const object = view.object;
    void this.tweens.run(
      0.45,
      (t) => {
        const s = 1 + 0.35 * Math.sin(Math.PI * t);
        object.scale.setScalar(s);
      },
      { ease: ease.linear },
    );
  }

  /** How long a hop from wherever the piece is now to `square` takes, in seconds. */
  travelTime(id: number, square: Square): number {
    const view = this.views.get(id);
    if (!view) return 0;
    const to = squareCenter(square);
    const distance = Math.hypot(to.x - view.object.position.x, to.z - view.object.position.z);
    return Math.min(0.28 + 0.05 * distance, 0.7);
  }

  /** Slides a piece to a square along a hop arc. Resolves when it has landed. */
  movePiece(id: number, square: Square, options: MoveOptions = {}): Promise<void> {
    const view = this.views.get(id);
    if (!view) return Promise.resolve();
    view.square = square;
    const from = view.object.position.clone();
    const to = squareCenter(square);
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const duration = options.duration ?? this.travelTime(id, square);
    const hop = options.hop ?? Math.min(0.2 + 0.07 * distance, 0.9);
    const token = ++view.motion;
    return this.tweens.run(
      duration,
      (t) => {
        if (view.motion !== token) return;
        view.object.position.x = from.x + (to.x - from.x) * t;
        view.object.position.z = from.z + (to.z - from.z) * t;
        view.object.position.y = from.y * (1 - t) + hop * Math.sin(Math.PI * t);
      },
      { delay: options.delay ?? 0, ease: ease.inOutSine },
    );
  }

  /** Brings a lifted or displaced piece back to the centre of its own square. */
  settle(view: PieceView): Promise<void> {
    return this.movePiece(view.id, view.square, { hop: 0.05, duration: 0.2 });
  }

  /**
   * Make the 3D pieces match `position`. Pieces are matched by id, so a piece
   * that exists in both glides to its new square, new ones pop in, missing ones shrink away.
   */
  async sync(position: Position, animate: boolean, stagger = 0.018): Promise<void> {
    const wanted = new Map<number, { type: PieceType; color: Color; square: Square }>();
    for (const { piece, square } of position.pieces()) {
      if (piece.id === undefined) throw new Error('BoardView.sync needs every piece to have an id');
      wanted.set(piece.id, { type: piece.type, color: piece.color, square });
    }

    const jobs: Promise<void>[] = [];
    for (const id of [...this.views.keys()]) {
      if (wanted.has(id)) continue;
      if (animate) jobs.push(this.fadeOutPiece(id));
      else this.removePiece(id);
    }

    let n = 0;
    for (const [id, want] of wanted) {
      const view = this.views.get(id);
      if (!view) {
        this.addPiece(id, want.type, want.color, want.square, {
          pop: animate,
          delay: animate ? n * stagger : 0,
        });
        n++;
        continue;
      }
      if (view.type !== want.type) this.setType(view, want.type);
      if (view.square !== want.square) {
        view.square = want.square;
        if (animate) jobs.push(this.movePiece(id, want.square, { delay: n * stagger * 0.5 }));
        else squareCenter(want.square, 0, view.object.position);
        n++;
      }
    }
    await Promise.all(jobs);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
  }
}
