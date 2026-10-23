import { describe, expect, it } from 'vitest';
import { assignIds, idCounter } from '../src/chess/identity';
import { Position } from '../src/chess/position';

const ids = (p: Position): number[] => p.pieces().map((x) => x.piece.id as number);

describe('assignIds', () => {
  it('numbers a fresh position with unique ids', () => {
    const p = Position.standard();
    assignIds(p, null, idCounter());
    expect(new Set(ids(p)).size).toBe(32);
  });

  it('hands ids over to the closest piece of the same kind', () => {
    const start = Position.standard();
    assignIds(start, null, idCounter());
    const rookA1 = start.get(0)?.id;
    const rookH1 = start.get(7)?.id;

    // A bare ending with a white rook on a1 and a white king on g1.
    const ending = Position.fromPlacement('6k1/5ppp/8/8/8/8/8/R5K1');
    assignIds(ending, start, idCounter(100));
    expect(ending.get(0)?.id).toBe(rookA1);
    expect(ending.get(0)?.id).not.toBe(rookH1);
  });

  it('reuses as many ids as there are matching pieces and mints the rest', () => {
    const start = Position.standard();
    const next = idCounter();
    assignIds(start, null, next);
    const ending = Position.fromPlacement('4k3/ppp5/4K3/8/8/Q7/8/8');
    const fresh: number[] = [];
    assignIds(ending, start, () => {
      const id = 1000 + fresh.length;
      fresh.push(id);
      return id;
    });
    // Every piece in the ending has a counterpart in the full set, so nothing new is needed.
    expect(fresh).toHaveLength(0);
    expect(new Set(ids(ending)).size).toBe(ending.pieces().length);
    const original = new Set(ids(start));
    for (const id of ids(ending)) expect(original.has(id)).toBe(true);
  });
});
