import { bookReply } from '../chess/book';
import { assignIds, idCounter } from '../chess/identity';
import { Position } from '../chess/position';
import { type DrawReason, type Move, findMove, gameStatus, legalMoves, makeMove, moveToUci } from '../chess/rules';
import { search } from '../chess/search';
import { type Color, type MatingPiece, type Piece, type Square, isMatingPiece } from '../chess/types';
import { PALETTE } from '../theme';
import { type BoardView, squareCenter } from '../three/boardView';
import type { Effects } from '../three/effects';
import type { Stage } from '../three/stage';
import { Emitter } from './events';

export interface GameEvents extends Record<string, unknown> {
  /** A move has finished animating, by either side. */
  moved: { move: Move; mover: Piece; color: Color };
  /** Fires at the moment of impact, while the shards fly. */
  captured: { victim: Piece; by: Piece; square: Square };
  promoted: { piece: Piece; square: Square };
  castled: { color: Color; side: 'k' | 'q' };
  enPassant: { color: Color; square: Square };
  check: { color: Color };
  checkmate: { loser: Color; pieces: MatingPiece[]; kingSquare: Square };
  stalemate: undefined;
  draw: { reason: DrawReason };
  /** The opponent has started (true) or finished (false) thinking about its answer. */
  thinking: boolean;
  reset: undefined;
}

const none = (): void => {};

/**
 * Owns the game: the position, whose turn it is, and the quiet opponent. The player has the white pieces and
 * plays by the rules; after every move the black side answers by itself. Each move is applied to the position
 * at once and then animated on the 3D board, and the result is reported as events.
 */
export class Game extends Emitter<GameEvents> {
  position = new Position();
  /** True while a move is playing out or the opponent is thinking. */
  busy = false;
  /** The game has ended (mate, stalemate or a draw) and is waiting to be reset. */
  over = false;
  readonly player: Color = 'w';

  private readonly nextId = idCounter(1);
  private history: string[] = [];
  private seen: string[] = [];
  /** Bumped on every reset, so that anything still in flight from the old game drops its result. */
  private epoch = 0;

  constructor(
    private readonly board: BoardView,
    private readonly effects: Effects,
    private readonly stage: Stage,
    private readonly random: () => number = Math.random,
  ) {
    super();
  }

  /** Puts the pieces on the board in the standard starting position. */
  async begin(animate: boolean): Promise<void> {
    const start = Position.standard();
    assignIds(start, null, this.nextId);
    this.position = start;
    this.history = [];
    this.seen = [start.key()];
    this.over = false;
    await this.board.sync(start, animate, 0.016);
  }

  pieceAt(square: Square): Piece | null {
    return this.position.get(square);
  }

  get playersTurn(): boolean {
    return !this.over && !this.busy && this.position.turn === this.player;
  }

  /** Where the player's piece on `square` may go: empty squares, and squares it would take a piece on. */
  targetsFrom(square: Square): { quiet: Square[]; captures: Square[] } {
    const piece = this.position.get(square);
    const out = { quiet: [] as Square[], captures: [] as Square[] };
    if (!piece || piece.color !== this.player || !this.playersTurn) return out;
    const seen = new Set<Square>();
    for (const move of legalMoves(this.position)) {
      if (move.from !== square || seen.has(move.to)) continue;
      seen.add(move.to);
      (move.captured ? out.captures : out.quiet).push(move.to);
    }
    return out;
  }

  /** The player's move. Returns false when it is not legal (or it is not the player's turn). */
  async play(from: Square, to: Square): Promise<boolean> {
    if (!this.playersTurn) return false;
    const move = findMove(this.position, from, to, 'q');
    if (!move) return false;
    this.busy = true;
    const epoch = this.epoch;
    const finished = await this.apply(move, epoch);
    if (finished && !this.over && this.position.turn !== this.player) await this.reply(epoch);
    if (epoch === this.epoch) this.busy = false;
    return true;
  }

  /**
   * Sets the board up from a FEN string, for tests and for trying a position out. The history starts over,
   * so the opponent plays from its own judgement and not from the opening book.
   */
  async setup(fen: string): Promise<void> {
    const epoch = ++this.epoch;
    this.busy = true;
    this.emit('thinking', false);
    const next = Position.fromFen(fen);
    assignIds(next, this.position, this.nextId);
    this.position = next;
    this.history = ['setup'];
    this.seen = [next.key()];
    this.over = false;
    this.board.setChecked([]);
    this.board.setLastMove(null);
    await this.board.sync(next, false);
    if (epoch !== this.epoch) return;
    this.busy = false;
    this.judge();
  }

  /** Starts a fresh game: every piece glides home. Works at any moment, even while the opponent is thinking. */
  async resetBoard(): Promise<void> {
    const epoch = ++this.epoch;
    this.busy = true;
    this.emit('thinking', false);
    const fresh = Position.standard();
    assignIds(fresh, this.position, this.nextId);
    this.position = fresh;
    this.history = [];
    this.seen = [fresh.key()];
    this.over = false;
    this.board.setChecked([]);
    this.board.setLastMove(null);
    await this.board.sync(fresh, true);
    if (epoch !== this.epoch) return;
    this.busy = false;
    this.emit('reset', undefined);
  }

  /* ------------------------------ one move ------------------------------ */

  /** Plays `move` on the position and on the board. Resolves false if a reset got in the way. */
  private async apply(move: Move, epoch: number): Promise<boolean> {
    const position = this.position;
    const mover = position.get(move.from) as Piece;
    const color = mover.color;
    const victimSquare = move.flag === 'ep' ? move.to + (color === 'w' ? -8 : 8) : move.to;
    const victim = move.captured ? position.get(victimSquare) : null;
    const id = mover.id as number;
    const duration = this.board.travelTime(id, move.to);

    makeMove(position, move);

    const jobs: Promise<void>[] = [this.board.movePiece(id, move.to, { duration })];
    if (move.flag === 'castle-k' || move.flag === 'castle-q') {
      // The rook has already been moved on the position; it hops over the king on the board.
      const rookTo = move.flag === 'castle-k' ? move.to - 1 : move.to + 1;
      const rook = position.get(rookTo);
      if (rook?.id !== undefined) jobs.push(this.board.movePiece(rook.id, rookTo, { duration, hop: 0.55 }));
    }
    if (victim) {
      jobs.push(this.stage.tweens.run(duration * 0.72, none).then(() => this.impact(victim, mover, victimSquare)));
    }
    await Promise.all(jobs);
    if (epoch !== this.epoch) return false;

    if (move.promotion) {
      const after = position.get(move.to);
      const view = after?.id === undefined ? undefined : this.board.viewById(after.id);
      if (after && view) {
        this.board.setType(view, after.type);
        this.emit('promoted', { piece: after, square: move.to });
      }
    }
    if (move.flag === 'castle-k' || move.flag === 'castle-q') {
      this.emit('castled', { color, side: move.flag === 'castle-k' ? 'k' : 'q' });
    }
    if (move.flag === 'ep') this.emit('enPassant', { color, square: move.to });

    this.history.push(moveToUci(move));
    this.seen.push(position.key());
    this.board.setLastMove(move.from, move.to);
    this.emit('moved', { move, mover, color });
    this.judge();
    return true;
  }

  private impact(victim: Piece, by: Piece, square: Square): void {
    if (victim.id !== undefined) this.board.removePiece(victim.id);
    const color = victim.color === 'w' ? PALETTE.white : PALETTE.black;
    this.effects.shatter(squareCenter(square, 0.4), color, victim.type === 'p' ? 0.85 : 1.15);
    this.emit('captured', { victim, by, square });
  }

  /** Looks at the position and reports what is going on. */
  private judge(): void {
    const status = gameStatus(this.position, this.seen);
    if (status.kind === 'playing') {
      const turn = this.position.turn;
      this.board.setChecked(status.check ? [this.position.findKing(turn)] : []);
      if (status.check) this.emit('check', { color: turn });
      return;
    }

    this.over = true;
    if (status.kind === 'checkmate') {
      const kingSquare = this.position.findKing(status.loser);
      this.board.setChecked([kingSquare]);
      const pieces = [...new Set(status.checkers.map((c) => c.piece.type))].filter(isMatingPiece);
      this.emit('checkmate', { loser: status.loser, pieces, kingSquare });
      return;
    }
    this.board.setChecked([]);
    if (status.kind === 'stalemate') this.emit('stalemate', undefined);
    else this.emit('draw', { reason: status.reason });
  }

  /** The opponent's turn: it thinks for a moment, then plays. */
  private async reply(epoch: number): Promise<void> {
    this.emit('thinking', true);
    const started = performance.now();
    // Give the lamp a moment to start dimming before the search holds the frame up.
    await this.stage.tweens.run(0.08, none);
    if (epoch !== this.epoch) return;

    const move = bookReply(this.history, this.position, this.random) ?? search(this.position, { random: this.random })?.move ?? null;

    const wanted = this.stage.reducedMotion ? 350 : 700 + this.random() * 900;
    await this.stage.tweens.run(Math.max(0, wanted - (performance.now() - started)) / 1000, none);
    if (epoch !== this.epoch) return;
    if (move) await this.apply(move, epoch);
    if (epoch === this.epoch) this.emit('thinking', false);
  }
}
