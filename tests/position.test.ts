import { describe, expect, it } from 'vitest';
import { Position, STANDARD_PLACEMENT } from '../src/chess/position';
import { parseSquare, squareName, toSquare } from '../src/chess/types';

const sq = (name: string): number => {
  const s = parseSquare(name);
  if (s === null) throw new Error(`bad square ${name}`);
  return s;
};

describe('Position', () => {
  it('round-trips a FEN placement', () => {
    expect(Position.standard().toPlacement()).toBe(STANDARD_PLACEMENT);
    const odd = '4R1k1/5ppp/8/2b5/8/8/8/6K1';
    expect(Position.fromPlacement(odd).toPlacement()).toBe(odd);
  });

  it('accepts a full FEN and reads what follows the placement', () => {
    const p = Position.fromPlacement(`${STANDARD_PLACEMENT} w KQkq - 0 1`);
    expect(p.get(sq('e1'))).toEqual({ type: 'k', color: 'w' });
    expect(p.get(sq('d8'))).toEqual({ type: 'q', color: 'b' });
    expect(p.turn).toBe('w');
    expect(p.castling).toBe(15);
  });

  it('rejects malformed placements', () => {
    expect(() => Position.fromPlacement('8/8/8')).toThrow();
    expect(() => Position.fromPlacement('9/8/8/8/8/8/8/8')).toThrow();
    expect(() => Position.fromPlacement('7/8/8/8/8/8/8/8')).toThrow();
    expect(() => Position.fromPlacement('x7/8/8/8/8/8/8/8')).toThrow();
  });

  it('numbers squares from a1 = 0 to h8 = 63', () => {
    expect(sq('a1')).toBe(0);
    expect(sq('h1')).toBe(7);
    expect(sq('a8')).toBe(56);
    expect(sq('h8')).toBe(63);
    expect(squareName(toSquare(4, 3))).toBe('e4');
    expect(parseSquare('i9')).toBeNull();
  });

  it('clones without sharing its cells, but shares the pieces', () => {
    const p = Position.standard();
    const copy = p.clone();
    copy.set(sq('e2'), null);
    expect(p.get(sq('e2'))).not.toBeNull();
    copy.set(sq('e2'), p.get(sq('e2')));
    expect(copy.toFen()).toBe(p.toFen());
    expect(copy.turn).toBe('w');
  });
});
