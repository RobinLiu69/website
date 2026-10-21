import type { Position } from './position';
import { type Piece, type Square, fileOf, rankOf } from './types';

const distance = (a: Square, b: Square): number => Math.hypot(fileOf(a) - fileOf(b), rankOf(a) - rankOf(b));

/**
 * Gives every piece in `next` an id. A piece of the same colour and type that
 * already exists in `previous` hands over its id (closest pair first), so the 3D
 * layer can glide it to its new square instead of destroying and rebuilding it.
 * Everything left over gets a fresh id. Mutates the piece objects' `id` by
 * replacing them in `next`.
 */
export function assignIds(next: Position, previous: Position | null, freshId: () => number): void {
  const key = (p: Piece): string => `${p.color}${p.type}`;

  const candidates: Array<{ key: string; to: Square; id: number; d: number }> = [];
  const taken = new Set<number>();
  const olds = previous?.pieces() ?? [];
  const news = next.pieces();

  for (const n of news) {
    for (const o of olds) {
      if (o.piece.id === undefined || key(o.piece) !== key(n.piece)) continue;
      candidates.push({ key: `${n.square}`, to: n.square, id: o.piece.id, d: distance(n.square, o.square) });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.to - b.to || a.id - b.id);

  const assigned = new Map<Square, number>();
  for (const c of candidates) {
    if (assigned.has(c.to) || taken.has(c.id)) continue;
    assigned.set(c.to, c.id);
    taken.add(c.id);
  }

  for (const n of news) {
    const id = assigned.get(n.square) ?? freshId();
    next.set(n.square, { ...n.piece, id });
  }
}

/** Convenience counter for ids. */
export function idCounter(start = 1): () => number {
  let n = start;
  return () => n++;
}
