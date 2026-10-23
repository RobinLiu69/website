import type { Position } from './position';
import { type Move, isAttacked, legalMoves, makeMove, pseudoMoves, unmakeMove } from './rules';
import { type PieceType, opposite } from './types';

/* ------------------------------ evaluation ------------------------------ */

const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 30000;
const INFINITY = 1_000_000;

// Piece-square tables from white's side, written the way a board is drawn: the first row is the eighth rank.
// (The "simplified evaluation function": enough to make a pawn storm, a developed knight and a safe king look good.)
const PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_OPENING = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const KING_ENDING = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const TABLES: Record<Exclude<PieceType, 'k'>, number[]> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN };
/** How much each piece counts towards "this is still the opening" (the king's table fades from one to the other). */
const PHASE: Record<PieceType, number> = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

/** Static score in centipawns, from the point of view of the side to move. */
export function evaluate(position: Position): number {
  let white = 0;
  let phase = 0;
  let kingOpening = 0;
  let kingEnding = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  const { cells } = position;
  for (let square = 0; square < 64; square++) {
    const piece = cells[square];
    if (!piece) continue;
    const file = square & 7;
    const rank = square >> 3;
    const isWhite = piece.color === 'w';
    // White reads the tables from the top, black from the bottom.
    const index = (isWhite ? 7 - rank : rank) * 8 + file;
    const sign = isWhite ? 1 : -1;
    phase += PHASE[piece.type];
    if (piece.type === 'k') {
      kingOpening += sign * (KING_OPENING[index] as number);
      kingEnding += sign * (KING_ENDING[index] as number);
      continue;
    }
    white += sign * (VALUE[piece.type] + (TABLES[piece.type][index] as number));
    if (piece.type === 'b') {
      if (isWhite) whiteBishops++;
      else blackBishops++;
    }
  }
  const mix = Math.min(phase, 24) / 24;
  white += Math.round(kingOpening * mix + kingEnding * (1 - mix));
  if (whiteBishops >= 2) white += 30;
  if (blackBishops >= 2) white -= 30;
  return (position.turn === 'w' ? white : -white) + 10;
}

/* -------------------------------- search -------------------------------- */

const MAX_PLY = 10;
const QUIET_PLY = 8;

class Searcher {
  nodes = 0;
  stopped = false;
  private readonly killers: Array<[Move | null, Move | null]> = Array.from({ length: MAX_PLY + 8 }, () => [null, null]);

  constructor(
    private readonly position: Position,
    private readonly maxNodes: number,
  ) {}

  private spent(): boolean {
    if (++this.nodes > this.maxNodes) this.stopped = true;
    return this.stopped;
  }

  /** Captures first (the most valuable victim by the cheapest piece), then promotions, then killer moves. */
  order(moves: Move[], ply: number): Move[] {
    const killers = this.killers[ply] as [Move | null, Move | null];
    const scored = moves.map((move) => {
      let score = 0;
      if (move.captured) score = 10_000 + 10 * VALUE[move.captured] - VALUE[move.piece] / 10;
      if (move.promotion) score += 9_000 + VALUE[move.promotion];
      if (!move.captured && !move.promotion) {
        if (killers[0] && same(killers[0], move)) score = 8_000;
        else if (killers[1] && same(killers[1], move)) score = 7_900;
      }
      return { move, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.move);
  }

  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if (this.spent()) return 0;
    const pos = this.position;
    const me = pos.turn;
    const enemy = opposite(me);
    const king = pos.findKing(me);
    const check = king !== -1 && isAttacked(pos.cells, king, enemy);
    if (check && ply < MAX_PLY) depth += 1;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (pos.halfmove >= 100) return 0;

    let best = -INFINITY;
    let legal = 0;
    for (const move of this.order(pseudoMoves(pos), ply)) {
      const undo = makeMove(pos, move);
      const guarded = move.piece === 'k' ? move.to : king;
      if (guarded !== -1 && isAttacked(pos.cells, guarded, enemy)) {
        unmakeMove(pos, move, undo);
        continue;
      }
      legal++;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(pos, move, undo);
      if (this.stopped) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!move.captured && !move.promotion) {
          const slots = this.killers[ply] as [Move | null, Move | null];
          if (!slots[0] || !same(slots[0], move)) {
            slots[1] = slots[0];
            slots[0] = move;
          }
        }
        break;
      }
    }
    if (legal === 0) return check ? -MATE + ply : 0;
    return best;
  }

  /** Plays out the captures, so a position is not judged in the middle of an exchange. */
  quiesce(alpha: number, beta: number, ply: number): number {
    if (this.spent()) return 0;
    const pos = this.position;
    const stand = evaluate(pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= MAX_PLY + QUIET_PLY) return stand;

    const me = pos.turn;
    const enemy = opposite(me);
    const king = pos.findKing(me);
    let best = stand;
    for (const move of this.order(pseudoMoves(pos, true), ply)) {
      // A capture that cannot lift the score back up to alpha, even with a margin, is not worth looking at.
      if (!move.promotion && stand + VALUE[move.captured ?? 'p'] + 200 < alpha) continue;
      const undo = makeMove(pos, move);
      const guarded = move.piece === 'k' ? move.to : king;
      if (guarded !== -1 && isAttacked(pos.cells, guarded, enemy)) {
        unmakeMove(pos, move, undo);
        continue;
      }
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      unmakeMove(pos, move, undo);
      if (this.stopped) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }
}

const same = (a: Move, b: Move): boolean => a.from === b.from && a.to === b.to && a.promotion === b.promotion;

export interface SearchOptions {
  /** How many moves ahead to look, at most. */
  depth?: number;
  /** Stops thinking after this many positions, so a reply always comes quickly. */
  nodes?: number;
  /** Moves this close to the best (in centipawns) are all considered good enough to play. */
  margin?: number;
  /** A number in [0, 1), for choosing between equally good moves. */
  random?: () => number;
}

export interface SearchResult {
  move: Move;
  score: number;
  depth: number;
  nodes: number;
}

/**
 * The quiet opponent: it looks a few moves ahead (more when the position is simple), judges the pieces and
 * where they stand, and plays one of the moves that are about as good as the best. It never touches the
 * position it is given.
 */
export function search(position: Position, options: SearchOptions = {}): SearchResult | null {
  const { depth: maxDepth = 4, nodes: maxNodes = 30_000, margin = 12, random = Math.random } = options;
  const work = position.clone();
  const roots = legalMoves(work);
  if (roots.length === 0) return null;
  if (roots.length === 1) return { move: roots[0] as Move, score: 0, depth: 0, nodes: 0 };

  const searcher = new Searcher(work, maxNodes);
  let ordered = searcher.order(roots, 0);
  let chosen: { move: Move; score: number }[] = [];
  let reached = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const scores: { move: Move; score: number }[] = [];
    let best = -INFINITY;
    for (const move of ordered) {
      const undo = makeMove(work, move);
      // Anything worse than `margin` below the best so far fails low straight away and is dropped.
      const floor = best === -INFINITY ? -INFINITY : best - margin;
      const score = -searcher.negamax(depth - 1, -INFINITY, -floor, 1);
      unmakeMove(work, move, undo);
      if (searcher.stopped) break;
      if (score > floor) {
        scores.push({ move, score });
        if (score > best) best = score;
      }
    }
    if (searcher.stopped) break;
    scores.sort((a, b) => b.score - a.score);
    chosen = scores;
    reached = depth;
    ordered = [...scores.map((s) => s.move), ...ordered.filter((m) => !scores.some((s) => s.move === m))];
    // A forced mate cannot be improved on.
    if (best >= MATE - 100) break;
  }

  if (chosen.length === 0) {
    // Not even depth one finished (a tiny node budget): fall back to the first-ordered move.
    return { move: ordered[0] as Move, score: 0, depth: 0, nodes: searcher.nodes };
  }

  const top = (chosen[0] as { score: number }).score;
  const pool = top >= MATE - 100 ? chosen.slice(0, 1) : chosen.filter((s) => s.score >= top - margin);
  const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] as { move: Move; score: number };
  return { move: pick.move, score: pick.score, depth: reached, nodes: searcher.nodes };
}
