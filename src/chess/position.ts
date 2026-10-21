import {
  type Cells,
  type Color,
  type Piece,
  type PieceType,
  type Square,
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

/**
 * A bare 8x8 board. There is no side to move, castling or en passant: pieces
 * can be dragged anywhere, so the only question the rules ever answer is "what
 * does this arrangement look like?". Piece objects are treated as immutable, so
 * clones can share them.
 */
export class Position {
  readonly cells: Cells;

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
    return new Position(this.cells);
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

  /** Parses the piece-placement field of a FEN string ("8/8/..." from rank 8 down). */
  static fromPlacement(fen: string): Position {
    const placement = fen.trim().split(/\s+/)[0] ?? '';
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
    return position;
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

  static standard(): Position {
    return Position.fromPlacement(STANDARD_PLACEMENT);
  }
}
