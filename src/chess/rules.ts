import type { Position } from './position';
import {
  type Cells,
  type Color,
  type Piece,
  type PieceType,
  type Square,
  fileOf,
  inBounds,
  opposite,
  rankOf,
  toSquare,
} from './types';

type Step = readonly [number, number];

const KNIGHT_STEPS: readonly Step[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_STEPS: readonly Step[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const ROOK_DIRS: readonly Step[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: readonly Step[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface Attacker {
  square: Square;
  piece: Piece;
}

/**
 * Pieces of colour `by` that attack `target`. Works on any arrangement, however
 * illegal. A pawn's forward push is not an attack; kings are included because
 * they still cover their neighbours.
 */
export function attackersOf(cells: Cells, target: Square, by: Color, firstOnly = false): Attacker[] {
  const out: Attacker[] = [];
  const tf = fileOf(target);
  const tr = rankOf(target);

  const take = (f: number, r: number, type: PieceType): boolean => {
    if (!inBounds(f, r)) return false;
    const square = toSquare(f, r);
    const piece = cells[square];
    if (!piece || piece.color !== by || piece.type !== type) return false;
    out.push({ square, piece });
    return firstOnly;
  };

  // A pawn captures diagonally forward, so its attacker sits one rank behind the target.
  const pawnRank = by === 'w' ? tr - 1 : tr + 1;
  if (take(tf - 1, pawnRank, 'p') || take(tf + 1, pawnRank, 'p')) return out;
  for (const [df, dr] of KNIGHT_STEPS) if (take(tf + df, tr + dr, 'n')) return out;
  for (const [df, dr] of KING_STEPS) if (take(tf + df, tr + dr, 'k')) return out;

  const sweep = (dirs: readonly Step[], slider: PieceType): boolean => {
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (inBounds(f, r)) {
        const square = toSquare(f, r);
        const piece = cells[square];
        if (piece) {
          if (piece.color === by && (piece.type === slider || piece.type === 'q')) {
            out.push({ square, piece });
            if (firstOnly) return true;
          }
          break;
        }
        f += df;
        r += dr;
      }
    }
    return false;
  };
  if (sweep(ROOK_DIRS, 'r')) return out;
  sweep(BISHOP_DIRS, 'b');
  return out;
}

export function isAttacked(cells: Cells, target: Square, by: Color): boolean {
  return attackersOf(cells, target, by, true).length > 0;
}

/** Squares `piece` could step to, ignoring check. Kings are never capturable. */
function pseudoTargets(cells: Cells, from: Square, piece: Piece): Square[] {
  const out: Square[] = [];
  const f0 = fileOf(from);
  const r0 = rankOf(from);

  // 0 = off the board or blocked, 1 = empty, 2 = capturable enemy
  const probe = (f: number, r: number): 0 | 1 | 2 => {
    if (!inBounds(f, r)) return 0;
    const occupant = cells[toSquare(f, r)];
    if (!occupant) return 1;
    return occupant.color !== piece.color && occupant.type !== 'k' ? 2 : 0;
  };

  const stepAll = (steps: readonly Step[]): void => {
    for (const [df, dr] of steps) {
      if (probe(f0 + df, r0 + dr) !== 0) out.push(toSquare(f0 + df, r0 + dr));
    }
  };

  const slideAll = (dirs: readonly Step[]): void => {
    for (const [df, dr] of dirs) {
      let f = f0 + df;
      let r = r0 + dr;
      for (let seen = probe(f, r); seen !== 0; seen = probe(f, r)) {
        out.push(toSquare(f, r));
        if (seen === 2) break;
        f += df;
        r += dr;
      }
    }
  };

  switch (piece.type) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      const startRank = piece.color === 'w' ? 1 : 6;
      if (probe(f0, r0 + dir) === 1) {
        out.push(toSquare(f0, r0 + dir));
        if (r0 === startRank && probe(f0, r0 + 2 * dir) === 1) out.push(toSquare(f0, r0 + 2 * dir));
      }
      for (const df of [-1, 1]) {
        if (probe(f0 + df, r0 + dir) === 2) out.push(toSquare(f0 + df, r0 + dir));
      }
      break;
    }
    case 'n':
      stepAll(KNIGHT_STEPS);
      break;
    case 'k':
      stepAll(KING_STEPS);
      break;
    case 'b':
      slideAll(BISHOP_DIRS);
      break;
    case 'r':
      slideAll(ROOK_DIRS);
      break;
    case 'q':
      slideAll(ROOK_DIRS);
      slideAll(BISHOP_DIRS);
      break;
  }
  return out;
}

/**
 * Does `color` have any move that leaves its own king unattacked? Each candidate
 * is played on the board and undone, so pins, interpositions, captures of the
 * checker and x-rays through the king's old square are all handled by the same test.
 */
export function hasLegalMove(cells: Cells, color: Color): boolean {
  const enemy = opposite(color);
  const kingSquare = cells.findIndex((p) => p?.type === 'k' && p.color === color);
  for (let from = 0; from < 64; from++) {
    const mover = cells[from];
    if (!mover || mover.color !== color) continue;
    for (const to of pseudoTargets(cells, from, mover)) {
      const captured = cells[to] ?? null;
      cells[to] = mover;
      cells[from] = null;
      const guarded = mover.type === 'k' ? to : kingSquare;
      const safe = guarded === -1 || !isAttacked(cells, guarded, enemy);
      cells[from] = mover;
      cells[to] = captured;
      if (safe) return true;
    }
  }
  return false;
}

export type SideStatus = 'ok' | 'check' | 'checkmate' | 'stalemate' | 'noKing';

export interface SideReport {
  status: SideStatus;
  kingSquare: Square;
  /** Non-king enemy pieces attacking this side's king. */
  checkers: Attacker[];
}

export interface Evaluation {
  w: SideReport;
  b: SideReport;
}

function evaluateSide(cells: Cells, color: Color): SideReport {
  const kingSquare = cells.findIndex((p) => p?.type === 'k' && p.color === color);
  if (kingSquare === -1) return { status: 'noKing', kingSquare, checkers: [] };

  // A king never gives check, so two kings touching is just an odd arrangement.
  const checkers = attackersOf(cells, kingSquare, opposite(color)).filter((a) => a.piece.type !== 'k');
  const canMove = hasLegalMove(cells, color);
  if (checkers.length > 0) return { status: canMove ? 'check' : 'checkmate', kingSquare, checkers };
  return { status: canMove ? 'ok' : 'stalemate', kingSquare, checkers };
}

/**
 * Looks at both kings independently. There is no turn order here: whoever's
 * king is boxed in and attacked counts as mated, and the pieces attacking that
 * king are the ones that delivered it.
 */
export function evaluate(position: Position): Evaluation {
  return {
    w: evaluateSide(position.cells, 'w'),
    b: evaluateSide(position.cells, 'b'),
  };
}

/** Piece types that are delivering checkmate right now (empty if nobody is mated). */
export function matingTypes(evaluation: Evaluation): PieceType[] {
  const types = new Set<PieceType>();
  for (const side of [evaluation.w, evaluation.b]) {
    if (side.status !== 'checkmate') continue;
    for (const attacker of side.checkers) types.add(attacker.piece.type);
  }
  return [...types];
}
