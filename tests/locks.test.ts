import { describe, expect, it } from 'vitest';
import { Position } from '../src/chess/position';
import { type Move, legalMoves, makeMove, unmakeMove } from '../src/chess/rules';
import { search } from '../src/chess/search';
import { MATING_PIECES, type MatingPiece, type Square, fileOf, rankOf, squareName } from '../src/chess/types';
import { LOCKS, SPOKES, openedLocks, queenDirection } from '../src/game/locks';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const standingOn = (piece: MatingPiece) => (p: Position): boolean => {
  const there = p.get(LOCKS[piece].square);
  return there?.color === 'w' && there.type === piece;
};

/** Does white get there within `depth` of its own moves, were black to sit still? */
function reaches(p: Position, goal: (p: Position) => boolean, depth: number): boolean {
  if (goal(p)) return true;
  if (depth === 0) return false;
  p.turn = 'w';
  for (const move of legalMoves(p)) {
    const undo = makeMove(p, move);
    const found = reaches(p, goal, depth - 1);
    unmakeMove(p, move, undo);
    p.turn = 'w';
    if (found) return true;
  }
  return false;
}

/** The fewest moves white needs (black sitting still), or null if more than `max`. */
function distance(p: Position, goal: (p: Position) => boolean, max: number): number | null {
  for (let depth = 0; depth <= max; depth++) if (reaches(p.clone(), goal, depth)) return depth;
  return null;
}

describe('the five doors', () => {
  it('stand on five different squares, all empty when a game begins', () => {
    const squares = MATING_PIECES.map((piece) => LOCKS[piece].square);
    expect(new Set(squares).size).toBe(5);
    const start = Position.standard();
    for (const square of squares) {
      expect(start.get(square), squareName(square)).toBeNull();
      // Far enough from the pieces that a ghost is not hidden behind one.
      expect(rankOf(square)).toBeGreaterThanOrEqual(2);
      expect(rankOf(square)).toBeLessThanOrEqual(5);
    }
  });

  it("have four squares a queen on the fifth would see, along four different lines", () => {
    const queen = LOCKS.q.square;
    const directions = SPOKES.map((piece) => queenDirection(queen, LOCKS[piece].square));
    for (const direction of directions) expect(direction).not.toBeNull();
    expect(new Set(directions).size).toBe(4);
  });

  it('keep the queen waiting for the other four', () => {
    expect(LOCKS.q.after).toEqual(SPOKES);
    for (const piece of SPOKES) expect(LOCKS[piece].after).toEqual([]);
  });

  it('open when the right white piece stands on the square, and only then', () => {
    const none = (): boolean => false;
    const p = Position.fromFen('4k3/8/8/8/7P/8/8/4K3 w - - 0 1');
    expect(openedLocks(p, none)).toEqual(['p']);
    expect(openedLocks(p, (piece) => piece === 'p')).toEqual([]);

    // The wrong piece, or the other side's piece, on the square opens nothing.
    expect(openedLocks(Position.fromFen('4k3/8/8/8/7N/8/8/4K3 w - - 0 1'), none)).toEqual([]);
    expect(openedLocks(Position.fromFen('4k3/8/8/8/7p/8/8/4K3 w - - 0 1'), none)).toEqual([]);
  });

  it("do not let the queen's door open early", () => {
    const p = Position.fromFen('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1');
    expect(openedLocks(p, () => false)).toEqual([]);
    expect(openedLocks(p, (piece) => piece !== 'q')).toEqual(['q']);
    expect(openedLocks(p, (piece) => piece === 'p')).toEqual([]);
  });

  it('can each be reached in a handful of moves', () => {
    const start = Position.standard();
    for (const piece of MATING_PIECES) {
      const moves = distance(start, standingOn(piece), 3);
      expect(moves, `${piece} on ${squareName(LOCKS[piece].square)}`).not.toBeNull();
    }
  });
});

/** Plays toward a door by the shortest route available at each turn, while black answers. */
function aimFor(piece: MatingPiece, black: (p: Position) => Move | null): boolean {
  const goal = standingOn(piece);
  const p = Position.standard();
  for (let turn = 0; turn < 8; turn++) {
    const left = distance(p, goal, 3) ?? distance(p, goal, 4);
    if (left === null) return false;
    const moves = legalMoves(p);
    let chosen: Move | null = null;
    for (const move of moves) {
      const undo = makeMove(p, move);
      const closer = goal(p) || (left > 1 && distance(p, goal, left - 1) !== null);
      unmakeMove(p, move, undo);
      if (closer) {
        chosen = move;
        break;
      }
    }
    if (!chosen) return false;
    makeMove(p, chosen);
    if (goal(p)) return true;
    const reply = black(p);
    if (!reply) return false;
    makeMove(p, reply);
  }
  return false;
}

describe('getting there against an opponent that answers', () => {
  it('works for every door when black plays random legal moves', () => {
    for (const piece of MATING_PIECES) {
      const random = seeded(piece.charCodeAt(0));
      let reached = 0;
      const games = 10;
      for (let game = 0; game < games; game++) {
        const ok = aimFor(piece, (p) => {
          const moves = legalMoves(p);
          return moves.length ? (moves[Math.floor(random() * moves.length)] as Move) : null;
        });
        if (ok) reached++;
      }
      expect(reached / games, `${piece} on ${squareName(LOCKS[piece].square)}`).toBeGreaterThanOrEqual(0.9);
    }
  }, 120_000);

  it('works for every door against the real opponent too', () => {
    for (const piece of MATING_PIECES) {
      const random = seeded(99 + piece.charCodeAt(0));
      const ok = aimFor(piece, (p) => search(p, { depth: 3, nodes: 4_000, random })?.move ?? null);
      expect(ok, `${piece} on ${squareName(LOCKS[piece].square)}`).toBe(true);
    }
  }, 120_000);
});

describe('queen directions', () => {
  it('numbers the eight lines from upward, clockwise', () => {
    const d4 = 3 + 3 * 8;
    const toward = (file: number, rank: number): number | null => queenDirection(d4, file + rank * 8);
    expect(toward(3, 6)).toBe(0);
    expect(toward(6, 6)).toBe(1);
    expect(toward(6, 3)).toBe(2);
    expect(toward(6, 0)).toBe(3);
    expect(toward(3, 0)).toBe(4);
    expect(toward(0, 0)).toBe(5);
    expect(toward(0, 3)).toBe(6);
    expect(toward(0, 6)).toBe(7);
    expect(toward(4, 4)).toBe(1);
    expect(toward(5, 4)).toBeNull();
    expect(queenDirection(d4, d4)).toBeNull();
    // A knight's jump is not a line.
    expect(queenDirection(d4, fileOf(d4) + 1 + (rankOf(d4) + 2) * 8)).toBeNull();
  });

  it('gives the same answer from either end, turned half way round', () => {
    const a: Square = 12;
    const b: Square = 12 + 3 * 9;
    expect(((queenDirection(a, b) as number) + 4) % 8).toBe(queenDirection(b, a));
  });
});
