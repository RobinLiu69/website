import { type FreeMoveResult, applyFreeMove } from '../chess/freeMove';
import { assignIds, idCounter } from '../chess/identity';
import { Position } from '../chess/position';
import { MATING_PIECES, type MatingPiece, puzzlePosition } from '../chess/puzzles';
import { type Evaluation, evaluate, matingTypes } from '../chess/rules';
import type { Color, Piece, PieceType, Square } from '../chess/types';
import { PALETTE } from '../theme';
import { type BoardView, squareCenter } from '../three/boardView';
import type { Effects } from '../three/effects';
import type { Stage } from '../three/stage';
import { Emitter } from './events';

export type GameMode = { kind: 'sandbox' } | { kind: 'puzzle'; piece: MatingPiece };

export interface GameEvents extends Record<string, unknown> {
  /** A move has finished animating. */
  moved: { result: FreeMoveResult; mover: Piece };
  /** Fires at the moment of impact, while the shards fly. */
  captured: { victim: Piece; by: Piece; square: Square };
  promoted: { piece: Piece; square: Square };
  swapped: { a: Piece; b: Piece };
  check: { color: Color };
  checkmate: { mated: Color[]; pieces: MatingPiece[]; evaluation: Evaluation };
  stalemate: { color: Color };
  noKing: { color: Color };
  mode: GameMode;
  reset: undefined;
}

const isMatingPiece = (type: PieceType): type is MatingPiece => (MATING_PIECES as readonly string[]).includes(type);

/**
 * Owns the arrangement of pieces and plays moves on it. Moves have no rules:
 * the controller applies them, animates the 3D board, then looks at the result
 * and reports checks, mates and the like.
 */
export class Game extends Emitter<GameEvents> {
  position = new Position();
  mode: GameMode = { kind: 'sandbox' };
  busy = false;

  private readonly nextId = idCounter(1);
  private sandboxSnapshot: Position | null = null;

  constructor(
    private readonly board: BoardView,
    private readonly effects: Effects,
    private readonly stage: Stage,
  ) {
    super();
  }

  /** Puts the pieces on the board in the standard starting position. */
  async begin(animate: boolean): Promise<void> {
    const start = Position.standard();
    assignIds(start, null, this.nextId);
    this.position = start;
    await this.board.sync(start, animate, 0.016);
  }

  pieceAt(square: Square): Piece | null {
    return this.position.get(square);
  }

  async move(from: Square, to: Square): Promise<boolean> {
    if (this.busy) return false;
    const mover = this.position.get(from);
    if (!mover || mover.id === undefined) return false;

    const duration = this.board.travelTime(mover.id, to);
    const result = applyFreeMove(this.position, from, to);
    if (!result) return false;
    this.busy = true;

    const jobs: Promise<void>[] = [this.board.movePiece(mover.id, to, { duration })];
    if (result.swapped?.id !== undefined) {
      jobs.push(this.board.movePiece(result.swapped.id, from, { duration, hop: 0.55 }));
    }
    if (result.captured) {
      const victim = result.captured;
      jobs.push(this.stage.tweens.run(duration * 0.72, () => {}).then(() => this.impact(victim, mover, to)));
    }
    await Promise.all(jobs);

    for (const promotion of result.promotions) {
      const view = promotion.after.id === undefined ? undefined : this.board.viewById(promotion.after.id);
      if (view) this.board.setType(view, promotion.after.type);
      this.emit('promoted', { piece: promotion.after, square: promotion.square });
    }
    if (result.swapped) this.emit('swapped', { a: mover, b: result.swapped });
    this.emit('moved', { result, mover });
    this.judge();
    this.busy = false;
    return true;
  }

  private impact(victim: Piece, by: Piece, square: Square): void {
    if (victim.id !== undefined) this.board.removePiece(victim.id);
    const color = victim.color === 'w' ? PALETTE.white : PALETTE.black;
    this.effects.shatter(squareCenter(square, 0.4), color, victim.type === 'p' ? 0.85 : 1.15);
    this.emit('captured', { victim, by, square });
  }

  /** Looks at the arrangement and reports what is going on. */
  private judge(): void {
    const evaluation = evaluate(this.position);
    const marked: Square[] = [];
    const mated: Color[] = [];
    for (const color of ['w', 'b'] as const) {
      const side = evaluation[color];
      if (side.status === 'check' || side.status === 'checkmate') marked.push(side.kingSquare);
      if (side.status === 'check') this.emit('check', { color });
      else if (side.status === 'checkmate') mated.push(color);
      else if (side.status === 'stalemate') this.emit('stalemate', { color });
      else if (side.status === 'noKing') this.emit('noKing', { color });
    }
    this.board.setChecked(marked);
    if (mated.length > 0) {
      const pieces = matingTypes(evaluation).filter(isMatingPiece);
      this.emit('checkmate', { mated, pieces, evaluation });
    }
  }

  async loadPuzzle(piece: MatingPiece): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (this.mode.kind === 'sandbox') this.sandboxSnapshot = this.position.clone();
    this.mode = { kind: 'puzzle', piece };
    this.emit('mode', this.mode);
    await this.install(puzzlePosition(piece), true);
    this.busy = false;
  }

  async leavePuzzle(): Promise<void> {
    if (this.mode.kind !== 'puzzle' || this.busy) return;
    this.busy = true;
    const snapshot = this.sandboxSnapshot ?? Position.standard();
    this.sandboxSnapshot = null;
    this.mode = { kind: 'sandbox' };
    this.emit('mode', this.mode);
    await this.install(snapshot, !this.sandboxHasIds(snapshot));
    this.busy = false;
  }

  /** Back to the start of whatever is on the board: the opening, or the current puzzle. */
  async resetBoard(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const fresh = this.mode.kind === 'puzzle' ? puzzlePosition(this.mode.piece) : Position.standard();
    await this.install(fresh, true);
    this.emit('reset', undefined);
    this.busy = false;
  }

  private sandboxHasIds(position: Position): boolean {
    return position.pieces().every((p) => p.piece.id !== undefined);
  }

  private async install(next: Position, needIds: boolean): Promise<void> {
    if (needIds) assignIds(next, this.position, this.nextId);
    this.position = next;
    this.board.setChecked([]);
    await this.board.sync(next, true);
  }
}
