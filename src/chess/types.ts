export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
  /** Stable identity for the 3D layer. The rules never look at it. */
  id?: number;
}

/** 0..63 with index = rank * 8 + file: a1 = 0, h1 = 7, a8 = 56, h8 = 63. */
export type Square = number;

export type Cells = (Piece | null)[];

export const FILES = 'abcdefgh';

export const fileOf = (s: Square): number => s & 7;
export const rankOf = (s: Square): number => s >> 3;
export const toSquare = (file: number, rank: number): Square => rank * 8 + file;
export const inBounds = (file: number, rank: number): boolean =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8;

export const squareName = (s: Square): string => `${FILES[fileOf(s)]}${rankOf(s) + 1}`;

export function parseSquare(name: string): Square | null {
  const m = /^([a-h])([1-8])$/.exec(name.trim().toLowerCase());
  if (!m) return null;
  return toSquare(FILES.indexOf(m[1]!), Number(m[2]) - 1);
}

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export const PIECE_TYPES: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
