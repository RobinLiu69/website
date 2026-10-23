import type { Position } from '../chess/position';
import { MATING_PIECES, type MatingPiece, type Square, fileOf, parseSquare, rankOf } from '../chess/types';

/**
 * The five doors. Each page opens when its piece, played by white, comes to rest on its square: the board
 * shows where only to someone carrying a light (see Whispers). The queen's page is the last one: it is
 * waiting for the other four, and then the four lines they draw across the board all end on its square,
 * because from there a queen can see every one of them.
 *
 * These are the answers. Change them here; `tests/locks.test.ts` checks that every square can still be
 * reached by a legal game and that the queen's lines still meet.
 */
export interface Lock {
  piece: MatingPiece;
  square: Square;
  /** Pages that have to be open already before this one will open. */
  after: readonly MatingPiece[];
}

const at = (name: string): Square => {
  const square = parseSquare(name);
  if (square === null) throw new Error(`Not a square: ${name}`);
  return square;
};

export const LOCKS: Readonly<Record<MatingPiece, Lock>> = {
  p: { piece: 'p', square: at('h4'), after: [] },
  n: { piece: 'n', square: at('e3'), after: [] },
  b: { piece: 'b', square: at('c5'), after: [] },
  r: { piece: 'r', square: at('a4'), after: [] },
  q: { piece: 'q', square: at('d4'), after: ['p', 'n', 'b', 'r'] },
};

/** The pieces whose squares point at the queen's. */
export const SPOKES: readonly MatingPiece[] = ['p', 'n', 'b', 'r'];

/** Locks whose piece is standing on its square right now and which may open. */
export function openedLocks(position: Position, isOpen: (piece: MatingPiece) => boolean): MatingPiece[] {
  return MATING_PIECES.filter((piece) => {
    const lock = LOCKS[piece];
    if (isOpen(piece) || !lock.after.every(isOpen)) return false;
    const there = position.get(lock.square);
    return there?.color === 'w' && there.type === lock.piece;
  });
}

/** Which of the eight queen directions (0..7, starting upward and turning clockwise) leads from one square to another, if any. */
export function queenDirection(from: Square, to: Square): number | null {
  const df = fileOf(to) - fileOf(from);
  const dr = rankOf(to) - rankOf(from);
  if (df === 0 && dr === 0) return null;
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
  const sign = (n: number): number => Math.sign(n);
  const key = `${sign(df)},${sign(dr)}`;
  const order = ['0,1', '1,1', '1,0', '1,-1', '0,-1', '-1,-1', '-1,0', '-1,1'];
  const index = order.indexOf(key);
  return index === -1 ? null : index;
}
