import { describe, expect, it } from 'vitest';
import { applyFreeMove } from '../src/chess/freeMove';
import { Position } from '../src/chess/position';
import { MATING_PIECES, PUZZLES, puzzlePosition } from '../src/chess/puzzles';
import { evaluate, matingTypes } from '../src/chess/rules';
import { type Color, type PieceType, type Square, parseSquare } from '../src/chess/types';

const sq = (name: string): Square => {
  const s = parseSquare(name);
  if (s === null) throw new Error(`bad square ${name}`);
  return s;
};

interface Outcome {
  from: Square;
  to: Square;
  types: PieceType[];
  mated: Color[];
}

/** Every position reachable by dragging one piece, of either colour, to any other square. */
function mateInOneDrag(position: Position): Outcome[] {
  const found: Outcome[] = [];
  for (const { square: from } of position.pieces()) {
    for (let to = 0; to < 64; to++) {
      if (to === from) continue;
      const next = position.clone();
      applyFreeMove(next, from, to);
      const e = evaluate(next);
      const types = matingTypes(e);
      if (types.length === 0) continue;
      const mated = (['w', 'b'] as const).filter((c) => e[c].status === 'checkmate');
      found.push({ from, to, types, mated });
    }
  }
  return found;
}

describe('puzzles', () => {
  it('has one puzzle for each piece that can deliver mate', () => {
    expect(Object.keys(PUZZLES).sort()).toEqual([...MATING_PIECES].sort());
  });

  for (const piece of MATING_PIECES) {
    describe(`${piece}: ${PUZZLES[piece].pattern}`, () => {
      const start = puzzlePosition(piece);

      it('starts quietly: no check, mate or stalemate for either side', () => {
        const e = evaluate(start);
        expect(e.w.status).toBe('ok');
        expect(e.b.status).toBe('ok');
      });

      it('can be solved with one drag, by the right piece and only the right piece', () => {
        const solutions = mateInOneDrag(start);
        expect(solutions.length).toBeGreaterThan(0);
        for (const s of solutions) {
          expect(s.types, `drag ${s.from}->${s.to}`).toEqual([piece]);
          expect(s.mated, `drag ${s.from}->${s.to}`).toEqual(['b']);
        }
      });
    });
  }

  it('has the intended textbook solution for each pattern', () => {
    const solve = (piece: keyof typeof PUZZLES, from: string, to: string) => {
      const p = puzzlePosition(piece);
      applyFreeMove(p, sq(from), sq(to));
      return matingTypes(evaluate(p));
    };
    expect(solve('r', 'a1', 'a8')).toEqual(['r']);
    expect(solve('q', 'a3', 'e7')).toEqual(['q']);
    expect(solve('n', 'e5', 'f7')).toEqual(['n']);
    expect(solve('b', 'c1', 'b2')).toEqual(['b']);
    expect(solve('p', 'g6', 'g7')).toEqual(['p']);
  });
});

describe('sandbox', () => {
  it('lets a visitor reach mates by dragging pieces from the starting position', () => {
    const queen = Position.standard();
    applyFreeMove(queen, sq('f1'), sq('c4'));
    applyFreeMove(queen, sq('d1'), sq('f7'));
    expect(matingTypes(evaluate(queen))).toEqual(['q']);

    const pawn = Position.standard();
    applyFreeMove(pawn, sq('e2'), sq('e6'));
    applyFreeMove(pawn, sq('f1'), sq('c4'));
    applyFreeMove(pawn, sq('e6'), sq('f7'));
    expect(matingTypes(evaluate(pawn))).toEqual(['p']);
  });
});
