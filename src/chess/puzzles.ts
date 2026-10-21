import { Position } from './position';

/** The five pieces that can deliver checkmate. A king can never give check. */
export type MatingPiece = 'p' | 'n' | 'b' | 'r' | 'q';

export const MATING_PIECES: readonly MatingPiece[] = ['p', 'n', 'b', 'r', 'q'];

export interface Puzzle {
  /** The piece that has to deliver the mate. */
  piece: MatingPiece;
  /** Classic name of the pattern. */
  pattern: string;
  /** FEN piece placement. White mates black. */
  placement: string;
}

/**
 * One prepared position per mating piece. Pieces are dragged freely, so each
 * position is built so that *only* the intended piece type can produce a mate
 * with a single drag (tests/puzzles.test.ts checks this by trying every drag).
 */
export const PUZZLES: Record<MatingPiece, Puzzle> = {
  p: {
    piece: 'p',
    pattern: 'protected pawn mate',
    placement: '6bk/ppp4p/5KP1/8/8/8/8/8',
  },
  n: {
    piece: 'n',
    pattern: 'smothered mate',
    placement: '6rk/ppp3pp/8/4N3/8/8/8/6K1',
  },
  b: {
    piece: 'b',
    pattern: 'long-diagonal mate',
    placement: '6bk/ppp4p/8/8/8/8/8/2B3K1',
  },
  r: {
    piece: 'r',
    pattern: 'back-rank mate',
    // No white pawns here: dragging one to the last rank promotes it to a queen.
    placement: '6k1/5ppp/8/8/8/8/8/R5K1',
  },
  q: {
    piece: 'q',
    pattern: 'queen backed by the king',
    placement: '4k3/ppp5/4K3/8/8/Q7/8/8',
  },
};

export function puzzlePosition(piece: MatingPiece): Position {
  return Position.fromPlacement(PUZZLES[piece].placement);
}
