import * as THREE from 'three';
import { type Square, fileOf, rankOf, toSquare } from '../chess/types';
import { type BoardView, type PieceView, squareAt } from './boardView';
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
  /** Whether the player may pick this piece up. */
  canPick(view: PieceView): boolean;
  /** Where a picked piece may go: empty squares, and squares where it would take something. */
  targets(square: Square): { quiet: Square[]; captures: Square[] };
  /** Resolves false when the move is not legal. */
  move(from: Square, to: Square): Promise<boolean>;
  /** A click that landed on nothing in particular. */
  backgroundClick(): void;
  /** Called on any press, so idle hints can fade away. */
  touched(): void;
  /**
   * Where the player's hand is over the board (a point on the floor, in board units), or null once it leaves.
   * A touch or a key press leaves the light behind for a moment.
   */
  light(point: { x: number; z: number } | null, brief: boolean): void;
  describeSquare(square: Square): string;
  announce(message: string): void;
}

type Picked = { kind: 'piece'; view: PieceView } | null;

type Gesture =
  | { kind: 'piece'; id: number; view: PieceView; x: number; y: number; dragging: boolean; wasSelected: boolean }
  | { kind: 'orbit'; id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean; orbits: boolean };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Pointer and keyboard control of the stage: drag or click pieces, orbit and
 * zoom the camera, and a keyboard cursor for the board.
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
  private pinchStart = 0;
  private dragLift = 0;
  /** Squares the selected piece may legally go to. */
  private legal = new Set<Square>();

  constructor(
    private readonly stage: Stage,
    private readonly board: BoardView,
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
    if (view) {
      const { quiet, captures } = this.host.targets(view.square);
      this.legal = new Set([...quiet, ...captures]);
      this.board.showTargets(quiet, captures);
    } else {
      this.legal = new Set();
      this.board.showTargets([], []);
    }
  }

  /** Plays a move; a piece that was carried to a square it may not go to flies back. */
  private async attempt(from: Square, to: Square, carried?: PieceView): Promise<void> {
    const moved = await this.host.move(from, to);
    if (!moved && carried) void this.board.settle(carried);
  }

  /** Reports where the pointer is over the floor, so a light can be held there. */
  private shine(e: { clientX: number; clientY: number }, brief: boolean): void {
    this.setRay(e);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.point)) {
      this.host.light({ x: this.point.x, z: this.point.z }, brief);
    }
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
    if (!this.host.boardEnabled()) return null;
    const first = this.raycaster.intersectObjects(this.board.pickables, false)[0];
    const view = first ? this.board.viewFromObject(first.object) : undefined;
    return view ? { kind: 'piece', view } : null;
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

    this.shine(e, e.pointerType !== 'mouse');
    const picked = this.pick(e);
    if (picked?.kind === 'piece') {
      const view = picked.view;
      const held = this.selected;
      if (this.host.canPick(view)) {
        this.gesture = { kind: 'piece', id: e.pointerId, view, x: e.clientX, y: e.clientY, dragging: false, wasSelected: held?.id === view.id };
        this.setSelected(view);
        return;
      }
      // With a piece in hand, clicking one of the other side's pieces is an attempt to take it.
      if (held) {
        const from = held.square;
        this.clearSelection();
        void this.attempt(from, view.square);
        return;
      }
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
    this.shine(e, e.pointerType !== 'mouse');

    if (g.kind === 'piece' && g.id === e.pointerId) {
      if (!g.dragging && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_THRESHOLD) {
        g.dragging = true;
        this.beginDrag(g.view);
      }
      if (g.dragging) this.dragTo(e, g.view);
    } else if (g.kind === 'orbit') {
      if (this.pointers.size >= 2) {
        const d = this.pinchDistance();
        if (this.pinchStart > 0 && d > 0 && g.orbits) this.stage.rig.zoomBy(this.pinchStart / d);
        this.pinchStart = d;
        g.moved = true;
      } else if (g.id === e.pointerId) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 4) g.moved = true;
        if (g.moved && g.orbits) {
          this.stage.rig.orbitBy(-(e.clientX - g.lastX) * 0.0042, (e.clientY - g.lastY) * 0.0035);
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
        else void this.attempt(view.square, target, view);
      } else if (g.wasSelected) {
        this.setSelected(null);
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
        void this.attempt(held.square, target);
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
    this.shine(e, false);
    const view = this.pick(e)?.view;
    this.canvas.style.cursor = view && this.host.canPick(view) ? 'grab' : '';
    if (this.selected && this.host.boardEnabled()) {
      const square = this.squareUnderPointer(e, this.groundPlane);
      this.board.hover(square !== null && this.legal.has(square) ? square : null);
    }
  }

  private leave(): void {
    this.canvas.style.cursor = '';
    this.stage.rig.parallaxTarget.set(0, 0);
    this.host.light(null, false);
    if (!this.selected && this.cursor === null) this.board.hover(null);
  }

  private beginDrag(view: PieceView): void {
    view.motion++; // a hop that is still settling must not fight the pointer
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
    const over = squareAt(x, z);
    this.board.hover(over !== null && this.legal.has(over) ? over : null);
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
      this.host.light({ x: fileOf(next) - 3.5, z: 3.5 - rankOf(next) }, true);
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
        if (view && this.host.canPick(view)) {
          this.setSelected(view);
          this.host.announce(this.host.describeSquare(at));
        }
      } else if (held.square === at) {
        this.setSelected(null);
      } else {
        const from = held.square;
        this.setSelected(null);
        void this.attempt(from, at);
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
