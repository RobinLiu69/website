import { describe, expect, it } from 'vitest';
import { assignIds, idCounter } from '../src/chess/identity';
import { Position } from '../src/chess/position';
import { puzzlePosition } from '../src/chess/puzzles';

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

    // The back-rank puzzle has a white rook on a1 and a white king on g1.
    const puzzle = puzzlePosition('r');
    assignIds(puzzle, start, idCounter(100));
    expect(puzzle.get(0)?.id).toBe(rookA1);
    expect(puzzle.get(0)?.id).not.toBe(rookH1);
  });

  it('reuses as many ids as there are matching pieces and mints the rest', () => {
    const start = Position.standard();
    const next = idCounter();
    assignIds(start, null, next);
    const puzzle = puzzlePosition('q');
    const fresh: number[] = [];
    assignIds(puzzle, start, () => {
      const id = 1000 + fresh.length;
      fresh.push(id);
      return id;
    });
    // Every piece in the puzzle has a counterpart in the full set, so nothing new is needed.
    expect(fresh).toHaveLength(0);
    expect(new Set(ids(puzzle)).size).toBe(puzzle.pieces().length);
    const original = new Set(ids(start));
    for (const id of ids(puzzle)) expect(original.has(id)).toBe(true);
  });
});
