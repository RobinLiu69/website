import type { Position } from './position';
import { type Color, type Piece, type Square, rankOf } from './types';

export interface Promotion {
  before: Piece;
  after: Piece;
  square: Square;
}

export interface FreeMoveResult {
  from: Square;
  to: Square;
  /** Enemy piece that was taken, if any. */
  captured: Piece | null;
  /** Friendly piece that traded places with the mover, if any. */
  swapped: Piece | null;
  promotions: Promotion[];
}

const lastRank = (color: Color): number => (color === 'w' ? 7 : 0);

function promoteIfNeeded(piece: Piece, square: Square, promotions: Promotion[]): Piece {
  if (piece.type !== 'p' || rankOf(square) !== lastRank(piece.color)) return piece;
  const after: Piece = { ...piece, type: 'q' };
  promotions.push({ before: piece, after, square });
  return after;
}

/**
 * Plays a move with no rules: any piece may go to any square. Landing on an
 * enemy piece takes it, landing on a friendly piece swaps the two. Pawns that
 * reach their last rank become queens. Mutates `position`; returns null when
 * there is nothing to move.
 */
export function applyFreeMove(position: Position, from: Square, to: Square): FreeMoveResult | null {
  const mover = position.get(from);
  if (!mover || from === to) return null;

  const target = position.get(to);
  const captured = target && target.color !== mover.color ? target : null;
  const swapped = target && target.color === mover.color ? target : null;

  const promotions: Promotion[] = [];
  position.set(to, promoteIfNeeded(mover, to, promotions));
  position.set(from, swapped ? promoteIfNeeded(swapped, from, promotions) : null);
  return { from, to, captured, swapped, promotions };
}
