import {
  BLACK_KINGSIDE,
  BLACK_QUEENSIDE,
  type Position,
  WHITE_KINGSIDE,
  WHITE_QUEENSIDE,
} from './position';
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

/* ------------------------------ geometry ------------------------------ */

type Step = readonly [number, number];

const KNIGHT_STEPS: readonly Step[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_STEPS: readonly Step[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
/** The first four are straight lines, the last four diagonals. */
const DIRECTIONS: readonly Step[] = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, -1], [-1, 1],
];

const targetsOf = (steps: readonly Step[]): Square[][] =>
  Array.from({ length: 64 }, (_, square) => {
    const f = fileOf(square);
    const r = rankOf(square);
    return steps.filter(([df, dr]) => inBounds(f + df, r + dr)).map(([df, dr]) => toSquare(f + df, r + dr));
  });

const KNIGHT_TARGETS = targetsOf(KNIGHT_STEPS);
const KING_TARGETS = targetsOf(KING_STEPS);

/** For every square and direction, the squares along that line until the edge of the board. */
const RAYS: Square[][][] = Array.from({ length: 64 }, (_, square) =>
  DIRECTIONS.map(([df, dr]) => {
    const line: Square[] = [];
    for (let f = fileOf(square) + df, r = rankOf(square) + dr; inBounds(f, r); f += df, r += dr) line.push(toSquare(f, r));
    return line;
  }),
);

/* ------------------------------ attacks ------------------------------ */

export interface Attacker {
  square: Square;
  piece: Piece;
}

/** Is `target` attacked by any piece of colour `by`? A pawn's forward push is not an attack. */
export function isAttacked(cells: Cells, target: Square, by: Color): boolean {
  const f = fileOf(target);
  const r = rankOf(target);

  // A pawn captures diagonally forward, so its attacker sits one rank behind the target.
  const pawnRank = by === 'w' ? r - 1 : r + 1;
  if (pawnRank >= 0 && pawnRank < 8) {
    if (f > 0) {
      const p = cells[pawnRank * 8 + f - 1];
      if (p && p.color === by && p.type === 'p') return true;
    }
    if (f < 7) {
      const p = cells[pawnRank * 8 + f + 1];
      if (p && p.color === by && p.type === 'p') return true;
    }
  }
  for (const s of KNIGHT_TARGETS[target] as Square[]) {
    const p = cells[s];
    if (p && p.color === by && p.type === 'n') return true;
  }
  for (const s of KING_TARGETS[target] as Square[]) {
    const p = cells[s];
    if (p && p.color === by && p.type === 'k') return true;
  }
  const rays = RAYS[target] as Square[][];
  for (let d = 0; d < 8; d++) {
    const slider: PieceType = d < 4 ? 'r' : 'b';
    for (const s of rays[d] as Square[]) {
      const p = cells[s];
      if (!p) continue;
      if (p.color === by && (p.type === slider || p.type === 'q')) return true;
      break;
    }
  }
  return false;
}

/** Every piece of colour `by` that attacks `target`, kings included (they still cover their neighbours). */
export function attackersOf(cells: Cells, target: Square, by: Color): Attacker[] {
  const out: Attacker[] = [];
  const f = fileOf(target);
  const r = rankOf(target);
  const take = (square: Square, type: PieceType): void => {
    const piece = cells[square];
    if (piece && piece.color === by && piece.type === type) out.push({ square, piece });
  };

  const pawnRank = by === 'w' ? r - 1 : r + 1;
  if (pawnRank >= 0 && pawnRank < 8) {
    if (f > 0) take(pawnRank * 8 + f - 1, 'p');
    if (f < 7) take(pawnRank * 8 + f + 1, 'p');
  }
  for (const s of KNIGHT_TARGETS[target] as Square[]) take(s, 'n');
  for (const s of KING_TARGETS[target] as Square[]) take(s, 'k');
  const rays = RAYS[target] as Square[][];
  for (let d = 0; d < 8; d++) {
    const slider: PieceType = d < 4 ? 'r' : 'b';
    for (const s of rays[d] as Square[]) {
      const piece = cells[s];
      if (!piece) continue;
      if (piece.color === by && (piece.type === slider || piece.type === 'q')) out.push({ square: s, piece });
      break;
    }
  }
  return out;
}

/* ------------------------------- moves ------------------------------- */

export type MoveFlag = 'quiet' | 'double' | 'ep' | 'castle-k' | 'castle-q';

export interface Move {
  from: Square;
  to: Square;
  piece: PieceType;
  /** What the move takes (for en passant, the pawn beside the destination). */
  captured: PieceType | null;
  promotion: PieceType | null;
  flag: MoveFlag;
}

const PROMOTIONS: readonly PieceType[] = ['q', 'r', 'b', 'n'];

function pushPawnMove(out: Move[], from: Square, to: Square, captured: PieceType | null, promotes: boolean, flag: MoveFlag): void {
  if (promotes) {
    for (const promotion of PROMOTIONS) out.push({ from, to, piece: 'p', captured, promotion, flag });
  } else {
    out.push({ from, to, piece: 'p', captured, promotion: null, flag });
  }
}

/**
 * Moves that obey how each piece moves but may leave the mover's own king attacked. With `capturesOnly`,
 * just the captures and queen promotions (what a search needs to settle a position).
 */
export function pseudoMoves(position: Position, capturesOnly = false): Move[] {
  const { cells, turn } = position;
  const enemy = opposite(turn);
  const out: Move[] = [];

  for (let from = 0; from < 64; from++) {
    const piece = cells[from];
    if (!piece || piece.color !== turn) continue;

    switch (piece.type) {
      case 'p': {
        const forward = turn === 'w' ? 8 : -8;
        const lastRank = turn === 'w' ? 7 : 0;
        const startRank = turn === 'w' ? 1 : 6;
        const file = fileOf(from);
        const one = from + forward;
        if (!cells[one]) {
          const promotes = rankOf(one) === lastRank;
          if (promotes) {
            if (capturesOnly) out.push({ from, to: one, piece: 'p', captured: null, promotion: 'q', flag: 'quiet' });
            else pushPawnMove(out, from, one, null, true, 'quiet');
          } else if (!capturesOnly) {
            out.push({ from, to: one, piece: 'p', captured: null, promotion: null, flag: 'quiet' });
            const two = one + forward;
            if (rankOf(from) === startRank && !cells[two]) {
              out.push({ from, to: two, piece: 'p', captured: null, promotion: null, flag: 'double' });
            }
          }
        }
        for (const df of [-1, 1]) {
          if (file + df < 0 || file + df > 7) continue;
          const to = one + df;
          const target = cells[to];
          if (target) {
            if (target.color === enemy && target.type !== 'k') {
              pushPawnMove(out, from, to, target.type, rankOf(to) === lastRank, 'quiet');
            }
          } else if (to === position.ep) {
            out.push({ from, to, piece: 'p', captured: 'p', promotion: null, flag: 'ep' });
          }
        }
        break;
      }
      case 'n':
      case 'k': {
        const list = (piece.type === 'n' ? KNIGHT_TARGETS : KING_TARGETS)[from] as Square[];
        for (const to of list) {
          const target = cells[to];
          if (!target) {
            if (!capturesOnly) out.push({ from, to, piece: piece.type, captured: null, promotion: null, flag: 'quiet' });
          } else if (target.color === enemy && target.type !== 'k') {
            out.push({ from, to, piece: piece.type, captured: target.type, promotion: null, flag: 'quiet' });
          }
        }
        if (piece.type === 'k' && !capturesOnly) castlingMoves(position, from, out);
        break;
      }
      default: {
        const rays = RAYS[from] as Square[][];
        const first = piece.type === 'b' ? 4 : 0;
        const last = piece.type === 'r' ? 4 : 8;
        for (let d = first; d < last; d++) {
          for (const to of rays[d] as Square[]) {
            const target = cells[to];
            if (!target) {
              if (!capturesOnly) out.push({ from, to, piece: piece.type, captured: null, promotion: null, flag: 'quiet' });
              continue;
            }
            if (target.color === enemy && target.type !== 'k') {
              out.push({ from, to, piece: piece.type, captured: target.type, promotion: null, flag: 'quiet' });
            }
            break;
          }
        }
      }
    }
  }
  return out;
}

/** Castling: the king and rook have not moved, nothing stands between, and the king never crosses an attacked square. */
function castlingMoves(position: Position, from: Square, out: Move[]): void {
  const { cells, turn } = position;
  const home = turn === 'w' ? 4 : 60;
  if (from !== home) return;
  const enemy = opposite(turn);
  const kingside = turn === 'w' ? WHITE_KINGSIDE : BLACK_KINGSIDE;
  const queenside = turn === 'w' ? WHITE_QUEENSIDE : BLACK_QUEENSIDE;
  if ((position.castling & (kingside | queenside)) === 0) return;
  if (isAttacked(cells, home, enemy)) return;

  const rookAt = (square: Square): boolean => {
    const piece = cells[square];
    return piece?.color === turn && piece.type === 'r';
  };

  if ((position.castling & kingside) !== 0 && rookAt(home + 3)) {
    if (!cells[home + 1] && !cells[home + 2] && !isAttacked(cells, home + 1, enemy) && !isAttacked(cells, home + 2, enemy)) {
      out.push({ from, to: home + 2, piece: 'k', captured: null, promotion: null, flag: 'castle-k' });
    }
  }
  if ((position.castling & queenside) !== 0 && rookAt(home - 4)) {
    if (
      !cells[home - 1] &&
      !cells[home - 2] &&
      !cells[home - 3] &&
      !isAttacked(cells, home - 1, enemy) &&
      !isAttacked(cells, home - 2, enemy)
    ) {
      out.push({ from, to: home - 2, piece: 'k', captured: null, promotion: null, flag: 'castle-q' });
    }
  }
}

/** What a move leaves behind, so it can be taken back. */
export interface Undo {
  mover: Piece;
  captured: Piece | null;
  capturedSquare: Square;
  castling: number;
  ep: Square;
  halfmove: number;
  fullmove: number;
}

/** Castling rights that survive a piece leaving or arriving on each square. */
const KEEPS_CASTLING: number[] = Array.from({ length: 64 }, () => 15);
KEEPS_CASTLING[0] = 15 & ~WHITE_QUEENSIDE;
KEEPS_CASTLING[7] = 15 & ~WHITE_KINGSIDE;
KEEPS_CASTLING[4] = 15 & ~(WHITE_KINGSIDE | WHITE_QUEENSIDE);
KEEPS_CASTLING[56] = 15 & ~BLACK_QUEENSIDE;
KEEPS_CASTLING[63] = 15 & ~BLACK_KINGSIDE;
KEEPS_CASTLING[60] = 15 & ~(BLACK_KINGSIDE | BLACK_QUEENSIDE);

/** Plays a move on the position in place and returns what is needed to take it back. The move must be pseudo-legal. */
export function makeMove(position: Position, move: Move): Undo {
  const { cells } = position;
  const mover = cells[move.from] as Piece;
  const capturedSquare = move.flag === 'ep' ? move.to + (mover.color === 'w' ? -8 : 8) : move.to;
  const undo: Undo = {
    mover,
    captured: cells[capturedSquare] ?? null,
    capturedSquare,
    castling: position.castling,
    ep: position.ep,
    halfmove: position.halfmove,
    fullmove: position.fullmove,
  };

  cells[capturedSquare] = null;
  cells[move.from] = null;
  cells[move.to] = move.promotion ? { ...mover, type: move.promotion } : mover;

  if (move.flag === 'castle-k') {
    cells[move.to - 1] = cells[move.to + 1] ?? null;
    cells[move.to + 1] = null;
  } else if (move.flag === 'castle-q') {
    cells[move.to + 1] = cells[move.to - 2] ?? null;
    cells[move.to - 2] = null;
  }

  position.castling &= (KEEPS_CASTLING[move.from] as number) & (KEEPS_CASTLING[move.to] as number);
  position.ep = move.flag === 'double' ? (move.from + move.to) >> 1 : -1;
  position.halfmove = mover.type === 'p' || undo.captured ? 0 : position.halfmove + 1;
  if (position.turn === 'b') position.fullmove += 1;
  position.turn = opposite(position.turn);
  return undo;
}

export function unmakeMove(position: Position, move: Move, undo: Undo): void {
  const { cells } = position;
  position.turn = opposite(position.turn);
  position.castling = undo.castling;
  position.ep = undo.ep;
  position.halfmove = undo.halfmove;
  position.fullmove = undo.fullmove;

  if (move.flag === 'castle-k') {
    cells[move.to + 1] = cells[move.to - 1] ?? null;
    cells[move.to - 1] = null;
  } else if (move.flag === 'castle-q') {
    cells[move.to - 2] = cells[move.to + 1] ?? null;
    cells[move.to + 1] = null;
  }

  cells[move.to] = null;
  cells[move.from] = undo.mover;
  cells[undo.capturedSquare] = undo.captured;
}

/** True when the side to move has a king and it is attacked. */
export function inCheck(position: Position, color: Color = position.turn): boolean {
  const king = position.findKing(color);
  return king !== -1 && isAttacked(position.cells, king, opposite(color));
}

/** Every legal move for the side to move. */
export function legalMoves(position: Position): Move[] {
  const me = position.turn;
  const enemy = opposite(me);
  const king = position.findKing(me);
  const legal: Move[] = [];
  for (const move of pseudoMoves(position)) {
    const undo = makeMove(position, move);
    const guarded = move.piece === 'k' ? move.to : king;
    if (guarded === -1 || !isAttacked(position.cells, guarded, enemy)) legal.push(move);
    unmakeMove(position, move, undo);
  }
  return legal;
}

export function hasLegalMove(position: Position): boolean {
  const me = position.turn;
  const enemy = opposite(me);
  const king = position.findKing(me);
  for (const move of pseudoMoves(position)) {
    const undo = makeMove(position, move);
    const guarded = move.piece === 'k' ? move.to : king;
    const safe = guarded === -1 || !isAttacked(position.cells, guarded, enemy);
    unmakeMove(position, move, undo);
    if (safe) return true;
  }
  return false;
}

/** The legal move from `from` to `to`; a pawn that reaches the last rank promotes to `promotion` (a queen by default). */
export function findMove(position: Position, from: Square, to: Square, promotion: PieceType = 'q'): Move | null {
  const matches = legalMoves(position).filter((m) => m.from === from && m.to === to);
  return matches.find((m) => m.promotion === null || m.promotion === promotion) ?? null;
}

/** Squares the piece on `from` may legally go to. */
export function legalTargets(position: Position, from: Square): Square[] {
  const targets = new Set<Square>();
  for (const move of legalMoves(position)) if (move.from === from) targets.add(move.to);
  return [...targets];
}

/** "e2e4", "e7e8q": the notation the opening book is written in. */
export function moveToUci(move: Move): string {
  const name = (s: Square): string => `${'abcdefgh'[fileOf(s)]}${rankOf(s) + 1}`;
  return `${name(move.from)}${name(move.to)}${move.promotion ?? ''}`;
}

/* ------------------------------- status ------------------------------- */

export type DrawReason = 'insufficient' | 'fifty' | 'repetition';

export type GameStatus =
  | { kind: 'playing'; check: boolean }
  | { kind: 'checkmate'; loser: Color; checkers: Attacker[] }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: DrawReason };

/** Neither side can possibly give mate: bare kings, a lone minor piece, or bishops that all stand on one colour. */
export function insufficientMaterial(position: Position): boolean {
  const minors: Array<{ type: PieceType; shade: number }> = [];
  for (const { square, piece } of position.pieces()) {
    if (piece.type === 'k') continue;
    if (piece.type !== 'n' && piece.type !== 'b') return false;
    minors.push({ type: piece.type, shade: (fileOf(square) + rankOf(square)) & 1 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.type === 'b' && m.shade === (minors[0] as { shade: number }).shade);
}

/**
 * Where the game stands. `seen` holds the key() of every position so far (the current one included),
 * which is what the threefold repetition rule counts.
 */
export function gameStatus(position: Position, seen: readonly string[] = []): GameStatus {
  const me = position.turn;
  const check = inCheck(position, me);
  if (!hasLegalMove(position)) {
    if (!check) return { kind: 'stalemate' };
    const king = position.findKing(me);
    const checkers = attackersOf(position.cells, king, opposite(me)).filter((a) => a.piece.type !== 'k');
    return { kind: 'checkmate', loser: me, checkers };
  }
  if (insufficientMaterial(position)) return { kind: 'draw', reason: 'insufficient' };
  if (position.halfmove >= 100) return { kind: 'draw', reason: 'fifty' };
  const key = position.key();
  if (seen.filter((k) => k === key).length >= 3) return { kind: 'draw', reason: 'repetition' };
  return { kind: 'playing', check };
}
