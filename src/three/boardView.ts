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
import { BOARD_BOTTOM, BOARD_OUTER } from './layout';
import { chamferBox } from './pieces/toolkit';
import { MARK_LAYER } from './sketch/pipeline';
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

/** The frame round the playing area, in squares. */
const FRAME = 0.55;

/** Pieces are modelled at real-world size against the squares, so they are drawn as they are. */
const PIECE_SCALE = 1;

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
    this.buildCoordinates();
    this.root.add(this.piecesRoot);

    const fill = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    const frame = squareFrame(0.98, 0.84);
    this.disposables.push(fill, frame);

    const hoverMaterial = overlay(PALETTE.accent, 0.5);
    const selectMaterial = overlay(PALETTE.accent, 0.95);
    const checkMaterial = overlay(PALETTE.accent, 0.9);
    this.disposables.push(hoverMaterial, selectMaterial, checkMaterial);

    this.hoverMark = new THREE.Mesh(fill, hoverMaterial);
    this.selectMark = new THREE.Mesh(frame, selectMaterial);
    for (const mark of [this.hoverMark, this.selectMark]) {
      mark.position.y = 0.012;
      mark.visible = false;
      mark.renderOrder = 2;
      mark.layers.set(MARK_LAYER);
      this.root.add(mark);
    }
    for (let i = 0; i < 2; i++) {
      const mark = new THREE.Mesh(frame, checkMaterial);
      mark.position.y = 0.014;
      mark.visible = false;
      mark.renderOrder = 2;
      mark.layers.set(MARK_LAYER);
      this.checkMarks.push(mark);
      this.root.add(mark);
    }
  }

  private buildBoard(): void {
    // Each square is a chamfered tile with a hairline gap around it, so the pen finds a line between every pair.
    const tileGeo = chamferBox(0.985, 0.985, 0.14, 0.006).rotateX(-Math.PI / 2).translate(0, -0.07, 0);
    const lightMat = new THREE.MeshLambertMaterial({ color: PALETTE.boardLight });
    const darkMat = new THREE.MeshLambertMaterial({ color: PALETTE.boardDark });
    const light = new THREE.InstancedMesh(tileGeo, lightMat, 32);
    const dark = new THREE.InstancedMesh(tileGeo, darkMat, 32);
    const matrix = new THREE.Matrix4();
    let li = 0;
    let di = 0;
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        matrix.makeTranslation(file - 3.5, 0, 3.5 - rank);
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

    // The frame: a border half a square wide, a hair higher than the tiles.
    const frameMat = new THREE.MeshLambertMaterial({ color: PALETTE.boardRim });
    const border = FRAME;
    const mid = 4 + border / 2;
    const frameParts: Array<[number, number, number, number]> = [
      // width (x), depth (z), x, z
      [8 + 2 * border, border, 0, -mid],
      [8 + 2 * border, border, 0, mid],
      [border, 8, -mid, 0],
      [border, 8, mid, 0],
    ];
    const frameGeos = frameParts.map(([w, d, x, z]) => {
      const geometry = chamferBox(w, d, 0.3, 0.035).rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, frameMat);
      mesh.position.set(x, -0.11, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return geometry;
    });

    // A slab underneath that overhangs the frame a little.
    const baseGeo = chamferBox(2 * BOARD_OUTER, 2 * BOARD_OUTER, 0.24, 0.045).rotateX(-Math.PI / 2);
    const baseMat = new THREE.MeshLambertMaterial({ color: PALETTE.boardBase });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = BOARD_BOTTOM + 0.12;
    base.castShadow = true;
    base.receiveShadow = true;
    this.root.add(base);

    this.disposables.push(tileGeo, lightMat, darkMat, frameMat, baseGeo, baseMat, ...frameGeos);
  }

  /**
   * a-h along the front rim and 1-8 down the left one, as seen from white's side. They are written in chalk
   * over the finished drawing (see Stage.overlay), so they are not part of `root`.
   */
  readonly coordinates = new THREE.Group();
  private readonly coordinateMaterials: THREE.MeshBasicMaterial[] = [];

  /** 0..1: how much of the chalk lettering shows. */
  setCoordinateOpacity(amount: number): void {
    for (const material of this.coordinateMaterials) material.opacity = 0.5 * amount;
    this.coordinates.visible = amount > 0.01;
  }

  private buildCoordinates(): void {
    const geometry = new THREE.PlaneGeometry(0.36, 0.36).rotateX(-Math.PI / 2);
    this.disposables.push(geometry);
    const redraw: Array<() => void> = [];
    const add = (text: string, x: number, z: number): void => {
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      // Written again when the handwriting font arrives, if it was not there yet.
      const write = (): void => {
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#ece8df';
        ctx.font = `600 ${size * 0.62}px "Caveat", "Segoe Print", "Bradley Hand", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, size / 2, size / 2 + 4);
        texture.needsUpdate = true;
      };
      write();
      redraw.push(write);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 0.07, z);
      mesh.rotation.y = (Math.random() - 0.5) * 0.25;
      this.coordinates.add(mesh);
      this.coordinateMaterials.push(material);
      this.disposables.push(texture, material);
    };
    document.fonts?.addEventListener('loadingdone', () => redraw.forEach((write) => write()));
    const label = 4 + FRAME / 2;
    for (let file = 0; file < 8; file++) add('abcdefgh'.charAt(file), file - 3.5, label);
    for (let rank = 0; rank < 8; rank++) add(String(rank + 1), -label, 3.5 - rank);
    this.setCoordinateOpacity(0);
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
