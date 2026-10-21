import { describe, expect, it } from 'vitest';
import { applyFreeMove } from '../src/chess/freeMove';
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

  it('accepts a full FEN and ignores everything after the placement', () => {
    const p = Position.fromPlacement(`${STANDARD_PLACEMENT} w KQkq - 0 1`);
    expect(p.get(sq('e1'))).toEqual({ type: 'k', color: 'w' });
    expect(p.get(sq('d8'))).toEqual({ type: 'q', color: 'b' });
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
});

describe('applyFreeMove', () => {
  it('moves a piece anywhere, ignoring the rules', () => {
    const p = Position.standard();
    const result = applyFreeMove(p, sq('a1'), sq('d5'));
    expect(result?.captured).toBeNull();
    expect(p.get(sq('a1'))).toBeNull();
    expect(p.get(sq('d5'))).toEqual({ type: 'r', color: 'w' });
  });

  it('captures an enemy piece, kings included', () => {
    const p = Position.standard();
    const result = applyFreeMove(p, sq('d1'), sq('e8'));
    expect(result?.captured).toEqual({ type: 'k', color: 'b' });
    expect(p.findKing('b')).toBe(-1);
    expect(p.get(sq('e8'))).toEqual({ type: 'q', color: 'w' });
  });

  it('swaps two friendly pieces instead of taking one', () => {
    const p = Position.standard();
    const result = applyFreeMove(p, sq('b1'), sq('c1'));
    expect(result?.captured).toBeNull();
    expect(result?.swapped).toEqual({ type: 'b', color: 'w' });
    expect(p.get(sq('b1'))).toEqual({ type: 'b', color: 'w' });
    expect(p.get(sq('c1'))).toEqual({ type: 'n', color: 'w' });
  });

  it('promotes a pawn that reaches the last rank and keeps its identity', () => {
    const p = Position.fromPlacement('8/8/8/8/8/8/8/8');
    p.set(sq('e2'), { type: 'p', color: 'w', id: 7 });
    const result = applyFreeMove(p, sq('e2'), sq('e8'));
    expect(result?.promotions).toHaveLength(1);
    expect(p.get(sq('e8'))).toEqual({ type: 'q', color: 'w', id: 7 });

    const black = Position.fromPlacement('8/8/8/8/8/8/8/8');
    black.set(sq('a7'), { type: 'p', color: 'b' });
    applyFreeMove(black, sq('a7'), sq('a1'));
    expect(black.get(sq('a1'))?.type).toBe('q');
  });

  it('does nothing for an empty square or the same square', () => {
    const p = Position.standard();
    expect(applyFreeMove(p, sq('e4'), sq('e5'))).toBeNull();
    expect(applyFreeMove(p, sq('e2'), sq('e2'))).toBeNull();
    expect(p.toPlacement()).toBe(STANDARD_PLACEMENT);
  });
});
