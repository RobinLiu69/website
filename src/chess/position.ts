import {
  type Cells,
  type Color,
  type Piece,
  type PieceType,
  type Square,
  parseSquare,
  squareName,
  toSquare,
} from './types';

const LETTER_TO_TYPE: Record<string, PieceType> = {
  p: 'p',
  n: 'n',
  b: 'b',
  r: 'r',
  q: 'q',
  k: 'k',
};

export const STANDARD_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
export const STANDARD_FEN = `${STANDARD_PLACEMENT} w KQkq - 0 1`;

/** Castling rights, as bits of `Position.castling`. */
export const WHITE_KINGSIDE = 1;
export const WHITE_QUEENSIDE = 2;
export const BLACK_KINGSIDE = 4;
export const BLACK_QUEENSIDE = 8;

const RIGHT_LETTERS: ReadonlyArray<readonly [number, string]> = [
  [WHITE_KINGSIDE, 'K'],
  [WHITE_QUEENSIDE, 'Q'],
  [BLACK_KINGSIDE, 'k'],
  [BLACK_QUEENSIDE, 'q'],
];

/**
 * A chess position: the pieces, whose turn it is, which sides may still castle, and the square a pawn
 * could be taken on en passant. Piece objects are treated as immutable and carry the id the 3D layer
 * follows, so a move only ever swaps which cell points at which piece.
 */
export class Position {
  readonly cells: Cells;
  turn: Color = 'w';
  /** Bits WHITE_KINGSIDE ... BLACK_QUEENSIDE. */
  castling = 0;
  /** The square a pawn skipped over on the last move (a pawn may be taken there), or -1. */
  ep: Square = -1;
  /** Moves since the last capture or pawn move, for the fifty-move rule. */
  halfmove = 0;
  fullmove = 1;

  constructor(cells?: Cells) {
    this.cells = cells ? cells.slice() : new Array<Piece | null>(64).fill(null);
  }

  get(square: Square): Piece | null {
    return this.cells[square] ?? null;
  }

  set(square: Square, piece: Piece | null): void {
    this.cells[square] = piece;
  }

  clone(): Position {
    const copy = new Position(this.cells);
    copy.turn = this.turn;
    copy.castling = this.castling;
    copy.ep = this.ep;
    copy.halfmove = this.halfmove;
    copy.fullmove = this.fullmove;
    return copy;
  }

  findKing(color: Color): Square {
    return this.cells.findIndex((p) => p?.type === 'k' && p.color === color);
  }

  pieces(): { square: Square; piece: Piece }[] {
    const out: { square: Square; piece: Piece }[] = [];
    this.cells.forEach((piece, square) => {
      if (piece) out.push({ square, piece });
    });
    return out;
  }

  /**
   * Parses a FEN string. Only the piece placement is required; whatever follows (side to move,
   * castling, en passant, clocks) is read when present. Without a castling field, the rights are
   * worked out from where the kings and rooks stand.
   */
  static fromPlacement(fen: string): Position {
    const [placement = '', turn, castling, ep, half, full] = fen.trim().split(/\s+/);
    const ranks = placement.split('/');
    if (ranks.length !== 8) throw new Error(`Placement needs 8 ranks: "${placement}"`);
    const position = new Position();
    ranks.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (/[1-8]/.test(ch)) {
          file += Number(ch);
          continue;
        }
        const type = LETTER_TO_TYPE[ch.toLowerCase()];
        if (!type || file > 7) throw new Error(`Bad placement "${placement}" at "${ch}"`);
        position.set(toSquare(file, rank), {
          type,
          color: ch === ch.toUpperCase() ? 'w' : 'b',
        });
        file += 1;
      }
      if (file !== 8) throw new Error(`Rank "${row}" does not add up to 8 files`);
    });

    if (turn === 'b') position.turn = 'b';
    position.castling = castling === undefined ? position.inferCastling() : parseCastling(castling);
    if (ep && ep !== '-') {
      const square = parseSquare(ep);
      if (square !== null) position.ep = square;
    }
    if (half !== undefined && Number.isFinite(Number(half))) position.halfmove = Number(half);
    if (full !== undefined && Number(full) >= 1) position.fullmove = Number(full);
    return position;
  }

  static fromFen(fen: string): Position {
    return Position.fromPlacement(fen);
  }

  /** Rights that make sense for the pieces as they stand: a king and a rook on their home squares. */
  private inferCastling(): number {
    const is = (square: Square, color: Color, type: PieceType): boolean => {
      const piece = this.cells[square];
      return piece?.color === color && piece.type === type;
    };
    let rights = 0;
    if (is(4, 'w', 'k')) {
      if (is(7, 'w', 'r')) rights |= WHITE_KINGSIDE;
      if (is(0, 'w', 'r')) rights |= WHITE_QUEENSIDE;
    }
    if (is(60, 'b', 'k')) {
      if (is(63, 'b', 'r')) rights |= BLACK_KINGSIDE;
      if (is(56, 'b', 'r')) rights |= BLACK_QUEENSIDE;
    }
    return rights;
  }

  toPlacement(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let gap = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.get(toSquare(file, rank));
        if (!piece) {
          gap += 1;
          continue;
        }
        if (gap) row += String(gap);
        gap = 0;
        row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
      }
      if (gap) row += String(gap);
      rows.push(row);
    }
    return rows.join('/');
  }

  toFen(): string {
    const rights = RIGHT_LETTERS.filter(([bit]) => (this.castling & bit) !== 0)
      .map(([, letter]) => letter)
      .join('');
    const ep = this.ep >= 0 ? squareName(this.ep) : '-';
    return `${this.toPlacement()} ${this.turn} ${rights || '-'} ${ep} ${this.halfmove} ${this.fullmove}`;
  }

  /** Identifies the position for the repetition rule: the pieces, the side to move, castling and en passant. */
  key(): string {
    return `${this.toPlacement()} ${this.turn} ${this.castling} ${this.ep}`;
  }

  static standard(): Position {
    return Position.fromPlacement(STANDARD_FEN);
  }
}

function parseCastling(field: string): number {
  let rights = 0;
  for (const [bit, letter] of RIGHT_LETTERS) if (field.includes(letter)) rights |= bit;
  return rights;
}
