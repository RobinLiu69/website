import * as THREE from 'three';
import type { MatingPiece } from '../chess/puzzles';
import { type Square, fileOf, rankOf, toSquare } from '../chess/types';
import { type BoardView, type PieceView, squareAt } from './boardView';
import type { Plinths } from './plinthView';
import type { Stage } from './stage';
import { ease } from './tween';

/** How high a dragged piece floats above the board. */
const LIFT = 0.75;
/** Pointer travel (px) before a press on a piece turns into a drag. */
const DRAG_THRESHOLD = 6;

export interface InputHost {
  /** Pieces can be picked up (false while a side panel is open or a move is playing). */
  boardEnabled(): boolean;
  orbitEnabled(): boolean;
  move(from: Square, to: Square): void;
  plinthClick(piece: MatingPiece): void;
  plinthHover(piece: MatingPiece | null): void;
  /** A click that landed on nothing in particular. */
  backgroundClick(): void;
  /** Called on any press, so idle hints can fade away. */
  touched(): void;
  describeSquare(square: Square): string;
  announce(message: string): void;
}

type Picked = { kind: 'piece'; view: PieceView } | { kind: 'plinth'; piece: MatingPiece } | null;

type Gesture =
  | { kind: 'piece'; id: number; view: PieceView; x: number; y: number; dragging: boolean; wasSelected: boolean }
  | { kind: 'plinth'; id: number; piece: MatingPiece; x: number; y: number; moved: boolean }
  | { kind: 'orbit'; id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean; orbits: boolean };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Pointer and keyboard control of the stage: drag or click pieces, click
 * plinths, orbit and zoom the camera, and a keyboard cursor for the board.
 */
export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly point = new THREE.Vector3();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly cleanup: Array<() => void> = [];

  private gesture: Gesture | null = null;
  private selected: PieceView | null = null;
  private cursor: Square | null = null;
  private hoverPlinth: MatingPiece | null = null;
  private pinchStart = 0;
  private dragLift = 0;

  constructor(
    private readonly stage: Stage,
    private readonly board: BoardView,
    private readonly plinths: Plinths,
    private readonly host: InputHost,
  ) {
    this.canvas = stage.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');

    this.listen('pointerdown', this.onDown);
    this.listen('pointermove', this.onMove);
    this.listen('pointerup', this.onUp);
    this.listen('pointercancel', this.onCancel);
    this.listen('pointerleave', () => {
      if (!this.gesture) this.leave();
    });
    this.listen('contextmenu', (e) => e.preventDefault());
    this.listen('keydown', this.onKey);
    this.listen('blur', () => {
      this.cursor = null;
      if (!this.selected) this.board.hover(null);
    });
    this.listen(
      'wheel',
      (e) => {
        if (!this.host.orbitEnabled()) return;
        e.preventDefault();
        this.stage.rig.zoomBy(Math.exp(e.deltaY * 0.0011));
      },
      { passive: false },
    );
  }

  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    this.canvas.addEventListener(type, handler as EventListener, options);
    this.cleanup.push(() => this.canvas.removeEventListener(type, handler as EventListener, options));
  }

  get selectedView(): PieceView | null {
    return this.selected;
  }

  setSelected(view: PieceView | null): void {
    this.selected = view;
    this.board.select(view ? view.square : null);
  }

  clearSelection(): void {
    this.setSelected(null);
    this.board.hover(null);
  }

  /** Drops anything in flight, e.g. when a side panel takes over. */
  cancelGesture(): void {
    const g = this.gesture;
    this.gesture = null;
    if (g?.kind === 'piece' && g.dragging) void this.board.settle(g.view);
    this.board.hover(null);
    this.canvas.style.cursor = '';
  }

  /* ------------------------------ picking ------------------------------ */

  private setRay(e: { clientX: number; clientY: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.stage.rig.camera);
  }

  private pick(e: PointerEvent): Picked {
    this.setRay(e);
    const targets: THREE.Object3D[] = [...this.plinths.pickables];
    if (this.host.boardEnabled()) targets.push(...this.board.pickables);
    const first = this.raycaster.intersectObjects(targets, false)[0];
    if (!first) return null;
    const view = this.board.viewFromObject(first.object);
    if (view) return { kind: 'piece', view };
    const plinth = this.plinths.fromObject(first.object);
    return plinth ? { kind: 'plinth', piece: plinth.piece } : null;
  }

  private squareUnderPointer(e: PointerEvent, plane: THREE.Plane): Square | null {
    this.setRay(e);
    if (!this.raycaster.ray.intersectPlane(plane, this.point)) return null;
    return squareAt(this.point.x, this.point.z);
  }

  /* ------------------------------ pointer ------------------------------ */

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.host.touched();
    this.cursor = null;

    if (this.gesture) {
      // A second finger during an orbit becomes a pinch.
      if (this.gesture.kind === 'orbit' && this.pointers.size === 2) this.pinchStart = this.pinchDistance();
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer to capture */
    }

    const picked = this.pick(e);
    if (picked?.kind === 'piece') {
      const view = picked.view;
      const held = this.selected;
      // With a piece already selected, clicking an enemy piece takes it.
      if (held && held.id !== view.id && held.color !== view.color && e.pointerType !== 'touch') {
        const from = held.square;
        this.clearSelection();
        this.host.move(from, view.square);
        return;
      }
      this.gesture = { kind: 'piece', id: e.pointerId, view, x: e.clientX, y: e.clientY, dragging: false, wasSelected: held?.id === view.id };
      this.setSelected(view);
      return;
    }
    if (picked?.kind === 'plinth') {
      this.gesture = { kind: 'plinth', id: e.pointerId, piece: picked.piece, x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    this.gesture = {
      kind: 'orbit',
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      orbits: this.host.orbitEnabled(),
    };
  };

  private onMove = (e: PointerEvent): void => {
    const known = this.pointers.get(e.pointerId);
    if (known) {
      known.x = e.clientX;
      known.y = e.clientY;
    }
    const g = this.gesture;
    if (!g) {
      this.hover(e);
      return;
    }

    if (g.kind === 'piece' && g.id === e.pointerId) {
      if (!g.dragging && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_THRESHOLD) {
        g.dragging = true;
        this.beginDrag();
      }
      if (g.dragging) this.dragTo(e, g.view);
    } else if (g.kind === 'plinth' && g.id === e.pointerId) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_THRESHOLD) g.moved = true;
    } else if (g.kind === 'orbit') {
      if (this.pointers.size >= 2) {
        const d = this.pinchDistance();
        if (this.pinchStart > 0 && d > 0 && g.orbits) this.stage.rig.zoomBy(this.pinchStart / d);
        this.pinchStart = d;
        g.moved = true;
      } else if (g.id === e.pointerId) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 4) g.moved = true;
        if (g.moved && g.orbits) {
          this.stage.rig.orbitBy(-(e.clientX - g.lastX) * 0.0055, (e.clientY - g.lastY) * 0.0045);
          this.canvas.style.cursor = 'grabbing';
        }
        g.lastX = e.clientX;
        g.lastY = e.clientY;
      }
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    this.gesture = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.canvas.style.cursor = '';

    if (g.kind === 'piece') {
      if (g.dragging) {
        const view = g.view;
        const target = squareAt(view.object.position.x, view.object.position.z);
        this.board.hover(null);
        this.setSelected(null);
        if (target === null || target === view.square) void this.board.settle(view);
        else this.host.move(view.square, target);
      } else if (g.wasSelected) {
        this.setSelected(null);
      }
    } else if (g.kind === 'plinth') {
      if (!g.moved) {
        const picked = this.pick(e);
        if (picked?.kind === 'plinth' && picked.piece === g.piece) this.host.plinthClick(g.piece);
      }
    } else if (!g.moved) {
      this.backgroundClick(e);
    }
  };

  private onCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinchStart = 0;
    if (this.gesture?.id === e.pointerId) this.cancelGesture();
  };

  private backgroundClick(e: PointerEvent): void {
    const held = this.selected;
    if (held && this.host.boardEnabled()) {
      const target = this.squareUnderPointer(e, this.groundPlane);
      this.clearSelection();
      if (target !== null && target !== held.square) {
        this.host.move(held.square, target);
        return;
      }
    }
    this.host.backgroundClick();
  }

  private hover(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.setRay(e);
      this.stage.rig.parallaxTarget.set(this.ndc.x, this.ndc.y);
    }
    if (e.pointerType === 'touch') return;
    const picked = this.pick(e);
    const piece = picked?.kind === 'plinth' ? picked.piece : null;
    if (piece !== this.hoverPlinth) {
      this.hoverPlinth = piece;
      this.host.plinthHover(piece);
    }
    this.canvas.style.cursor = picked ? (picked.kind === 'plinth' ? 'pointer' : 'grab') : '';
    if (this.selected && this.host.boardEnabled()) {
      this.board.hover(this.squareUnderPointer(e, this.groundPlane));
    }
  }

  private leave(): void {
    this.canvas.style.cursor = '';
    this.stage.rig.parallaxTarget.set(0, 0);
    if (this.hoverPlinth !== null) {
      this.hoverPlinth = null;
      this.host.plinthHover(null);
    }
    if (!this.selected && this.cursor === null) this.board.hover(null);
  }

  private beginDrag(): void {
    this.canvas.style.cursor = 'grabbing';
    this.dragLift = 0;
    void this.stage.tweens.run(
      0.14,
      (t) => {
        this.dragLift = t;
      },
      { ease: ease.outCubic },
    );
  }

  /**
   * The piece hovers above the square the pointer is *pointing at* (where the ray meets the board),
   * not above the point where the ray meets the lifted piece, which perspective would put a rank away.
   */
  private dragTo(e: PointerEvent, view: PieceView): void {
    this.setRay(e);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.point)) return;
    const x = clamp(this.point.x, -5.4, 5.4);
    const z = clamp(this.point.z, -5.4, 5.4);
    view.object.position.set(x, LIFT * this.dragLift, z);
    this.board.hover(squareAt(x, z));
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /* ----------------------------- keyboard ----------------------------- */

  private onKey = (e: KeyboardEvent): void => {
    if (!this.host.boardEnabled() || e.ctrlKey || e.metaKey || e.altKey) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const delta = step[e.key];
    if (delta) {
      e.preventDefault();
      const from = this.cursor ?? this.selected?.square ?? toSquare(4, 1);
      const next = toSquare(clamp(fileOf(from) + delta[0], 0, 7), clamp(rankOf(from) + delta[1], 0, 7));
      this.cursor = next;
      this.board.hover(next);
      this.host.announce(this.host.describeSquare(next));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const at = this.cursor ?? toSquare(4, 1);
      this.cursor = at;
      this.board.hover(at);
      const held = this.selected;
      if (!held) {
        const view = this.board.viewAtSquare(at);
        if (view) {
          this.setSelected(view);
          this.host.announce(this.host.describeSquare(at));
        }
      } else if (held.square === at) {
        this.setSelected(null);
      } else {
        const from = held.square;
        this.setSelected(null);
        this.host.move(from, at);
      }
      return;
    }
    if (e.key === 'Escape') {
      this.setSelected(null);
      this.cursor = null;
      this.board.hover(null);
    }
  };

  dispose(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup.length = 0;
  }
}
