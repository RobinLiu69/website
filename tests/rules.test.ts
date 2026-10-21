import { describe, expect, it } from 'vitest';
import { Position } from '../src/chess/position';
import { type Evaluation, evaluate, matingTypes } from '../src/chess/rules';

const look = (placement: string): Evaluation => evaluate(Position.fromPlacement(placement));
const checkerTypes = (side: Evaluation['w']) => side.checkers.map((a) => a.piece.type).sort();

describe('evaluate', () => {
  it('sees nothing special in the starting position', () => {
    const e = look('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(e.w.status).toBe('ok');
    expect(e.b.status).toBe('ok');
    expect(matingTypes(e)).toEqual([]);
  });

  it("finds the fool's mate (white mated by a queen)", () => {
    const e = look('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR');
    expect(e.w.status).toBe('checkmate');
    expect(e.b.status).toBe('ok');
    expect(matingTypes(e)).toEqual(['q']);
  });

  it("finds the scholar's mate (black mated by a queen)", () => {
    const e = look('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR');
    expect(e.b.status).toBe('checkmate');
    expect(matingTypes(e)).toEqual(['q']);
  });

  it('finds a back-rank mate, including the escape square behind the king', () => {
    // h8 is only "attacked" through the king's own square (x-ray).
    const e = look('4R1k1/5ppp/8/8/8/8/8/6K1');
    expect(e.b.status).toBe('checkmate');
    expect(matingTypes(e)).toEqual(['r']);
  });

  it('is not mate when a piece can interpose', () => {
    const e = look('4R1k1/5ppp/8/2b5/8/8/8/6K1');
    expect(e.b.status).toBe('check');
    expect(matingTypes(e)).toEqual([]);
  });

  it('is not mate when the king can take an unprotected checker', () => {
    const e = look('7k/6Q1/8/8/8/8/8/K7');
    expect(e.b.status).toBe('check');
  });

  it('is mate when the adjacent checker is protected', () => {
    const e = look('7k/6Q1/5K2/8/8/8/8/8');
    expect(e.b.status).toBe('checkmate');
    expect(matingTypes(e)).toEqual(['q']);
  });

  it('finds a smothered mate by a knight', () => {
    const e = look('6rk/5Npp/8/8/8/8/8/6K1');
    expect(e.b.status).toBe('checkmate');
    expect(matingTypes(e)).toEqual(['n']);
  });

  it('is not mate when the checking knight can be captured', () => {
    // Nf7 is not available here: the knight on g6 is taken by the h7 pawn.
    const e = look('6rk/6pp/6N1/8/8/8/8/6K1');
    expect(e.b.status).toBe('check');
  });

  it('finds a mate by a protected pawn', () => {
    // Pg7 checks Kh8 and is guarded by Bf6; the g8 bishop cannot take it (a rook could).
    const e = look('6bk/6Pp/5B2/8/8/8/8/6K1');
    expect(e.b.status).toBe('checkmate');
    expect(matingTypes(e)).toEqual(['p']);
    expect(look('6rk/6Pp/5B2/8/8/8/8/6K1').b.status).toBe('check');
  });

  it('detects stalemate, including when the only mobile piece is pinned', () => {
    expect(look('7k/5Q2/6K1/8/8/8/8/8').b.status).toBe('stalemate');
    // The b8 bishop is pinned to its king by the rook on h8, and the white king covers a7/b7.
    const pinned = look('kb5R/8/1K6/8/8/8/8/8');
    expect(pinned.b.status).toBe('stalemate');
    expect(pinned.w.status).toBe('ok');
  });

  it('reports a missing king instead of a mate', () => {
    const e = look('rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
    expect(e.b.status).toBe('noKing');
    expect(e.w.status).toBe('ok');
    expect(matingTypes(e)).toEqual([]);
  });

  it('does not treat touching kings as check', () => {
    const e = look('8/8/8/3kK3/8/8/8/8');
    expect(e.w.status).toBe('ok');
    expect(e.b.status).toBe('ok');
    expect(checkerTypes(e.w)).toEqual([]);
  });

  it('keeps a king off squares guarded by the other king', () => {
    // Kb6 covers a7 and b7. With the rook on h1 the king still has b8; Rh8+ takes that away too.
    expect(look('k7/8/1K6/8/8/8/8/7R').b.status).toBe('ok');
    const mate = look('k6R/8/1K6/8/8/8/8/8');
    expect(mate.b.status).toBe('checkmate');
    expect(matingTypes(mate)).toEqual(['r']);
  });

  it('lists every checking piece type in a double check', () => {
    // Bb5 and Re1 both attack Ke8, but d8 and f8 are still free: check, not mate.
    const double = look('4k3/8/8/1B6/8/8/8/4R1K1');
    expect(checkerTypes(double.b)).toEqual(['b', 'r']);
    expect(double.b.status).toBe('check');
    // A blocked rook is not a checker.
    expect(checkerTypes(look('4k3/3pp3/8/8/8/8/8/4R1B1').b)).toEqual([]);
  });

  it('evaluates both kings independently', () => {
    // Ra8 mates Kg8 and the black queen on e1 mates Kg1 (the e2 pawn stops her reaching the 8th rank).
    // Impossible in a real game, but a perfectly good arrangement to drag the pieces into.
    const e = look('R5k1/5ppp/8/8/8/8/4PPPP/4q1K1');
    expect(e.b.status).toBe('checkmate');
    expect(e.w.status).toBe('checkmate');
    expect(matingTypes(e).sort()).toEqual(['q', 'r']);
  });
});
