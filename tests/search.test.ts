import { describe, expect, it } from 'vitest';
import { BOOK_LINES, bookReply } from '../src/chess/book';
import { Position, STANDARD_FEN } from '../src/chess/position';
import { type Move, findMove, gameStatus, legalMoves, makeMove, moveToUci } from '../src/chess/rules';
import { evaluate, search } from '../src/chess/search';
import { parseSquare } from '../src/chess/types';

const sq = (name: string): number => {
  const s = parseSquare(name);
  if (s === null) throw new Error(`bad square ${name}`);
  return s;
};

/** A small repeatable random source. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(position: Position, uci: string): Move {
  const move = findMove(position, sq(uci.slice(0, 2)), sq(uci.slice(2, 4)), (uci[4] as 'q' | undefined) ?? 'q');
  if (!move) throw new Error(`${uci} is not legal in ${position.toFen()}`);
  makeMove(position, move);
  return move;
}

describe('evaluate', () => {
  it('counts material and sees the side to move', () => {
    const even = Position.fromFen(STANDARD_FEN);
    expect(Math.abs(evaluate(even))).toBeLessThan(40);
    const upQueen = Position.fromFen('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(evaluate(upQueen)).toBeGreaterThan(800);
    upQueen.turn = 'b';
    expect(evaluate(upQueen)).toBeLessThan(-800);
  });

  it('prefers a developed knight to one on the rim', () => {
    const centre = Position.fromFen('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1');
    const rim = Position.fromFen('4k3/8/8/8/8/8/8/N3K3 w - - 0 1');
    expect(evaluate(centre)).toBeGreaterThan(evaluate(rim));
  });
});

describe('the quiet opponent', () => {
  it('takes a mate in one', () => {
    const backRank = Position.fromFen('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1');
    expect(moveToUci(search(backRank, { random: seeded(1) })?.move as Move)).toBe('d1d8');
    const ladder = Position.fromFen('6k1/8/6K1/8/8/8/8/R7 w - - 0 1');
    expect(moveToUci(search(ladder, { random: seeded(2) })?.move as Move)).toBe('a1a8');
  });

  it('wins a hanging queen and does not hang its own', () => {
    const hanging = Position.fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
    expect(moveToUci(search(hanging, { random: seeded(3) })?.move as Move)).toBe('e4d5');

    // Black's queen is attacked by a pawn: it must not stay where it is.
    const attacked = Position.fromFen('4k3/8/8/3q4/4P3/8/8/4K3 b - - 0 1');
    const reply = search(attacked, { random: seeded(4) })?.move as Move;
    expect(reply.piece === 'q' || reply.captured === 'p').toBe(true);
    expect(moveToUci(reply)).not.toBe('e8d8');
  });

  it('finds a forced mate in two', () => {
    const p = Position.fromFen('7k/8/8/8/8/8/R7/1R4K1 w - - 0 1');
    const first = search(p, { depth: 4, nodes: 60_000, random: seeded(5) });
    expect(first && first.score).toBeGreaterThan(29_000);
    makeMove(p, (first as { move: Move }).move);
    // Whatever black answers, the next move mates.
    for (const reply of legalMoves(p)) {
      const q = p.clone();
      makeMove(q, reply);
      const second = search(q, { depth: 3, random: seeded(6) });
      makeMove(q, (second as { move: Move }).move);
      expect(gameStatus(q).kind, `after ${moveToUci(reply)}`).toBe('checkmate');
    }
  });

  it('plays the same move for the same seed, and only ever a legal one', () => {
    const p = Position.fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    const a = search(p, { random: seeded(11) });
    const b = search(p, { random: seeded(11) });
    expect(a && moveToUci(a.move)).toBe(b && moveToUci(b.move));
    for (let seed = 0; seed < 8; seed++) {
      const result = search(p, { random: seeded(seed) }) as { move: Move };
      expect(legalMoves(p).some((m) => moveToUci(m) === moveToUci(result.move))).toBe(true);
    }
  });

  it('leaves the position it was given alone', () => {
    const p = Position.standard();
    p.set(sq('e2'), { type: 'p', color: 'w', id: 9 });
    const before = p.toFen();
    search(p, { random: seeded(1) });
    expect(p.toFen()).toBe(before);
    expect(p.get(sq('e2'))?.id).toBe(9);
  });

  it('answers within its budget, even from a crowded middlegame', () => {
    const p = Position.fromFen('r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10');
    const started = performance.now();
    const result = search(p, { random: seeded(7) });
    expect(result).not.toBeNull();
    expect(result?.nodes).toBeLessThanOrEqual(30_100);
    expect(performance.now() - started).toBeLessThan(2500);
  });

  it('returns nothing when there is no move to make', () => {
    expect(search(Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBeNull();
  });

  it('plays a whole game against itself without a single illegal move', () => {
    const p = Position.standard();
    const seen = [p.key()];
    const random = seeded(2024);
    const history: string[] = [];
    let status = gameStatus(p, seen);
    for (let ply = 0; ply < 120 && status.kind === 'playing'; ply++) {
      const choice =
        bookReply(history, p, random) ?? search(p, { depth: 3, nodes: 6_000, random })?.move ?? null;
      expect(choice, `ply ${ply} in ${p.toFen()}`).not.toBeNull();
      const move = choice as Move;
      expect(legalMoves(p).some((m) => moveToUci(m) === moveToUci(move))).toBe(true);
      history.push(moveToUci(move));
      makeMove(p, move);
      seen.push(p.key());
      status = gameStatus(p, seen);
    }
    expect(history.length).toBeGreaterThan(20);
  });
});

describe('the opening book', () => {
  it('only suggests legal moves, for every line it knows', () => {
    for (const [line, replies] of Object.entries(BOOK_LINES)) {
      const p = Position.standard();
      const moves = line.split(' ');
      for (const uci of moves) play(p, uci);
      expect(p.turn, line).toBe('b');
      expect(moves.length % 2, line).toBe(1);
      for (const reply of replies) {
        expect(findMove(p, sq(reply.slice(0, 2)), sq(reply.slice(2, 4))), `${line} -> ${reply}`).not.toBeNull();
      }
    }
  });

  it('answers 1.e4 with something, and has nothing for lines it does not know', () => {
    const p = Position.standard();
    play(p, 'e2e4');
    expect(bookReply(['e2e4'], p, seeded(1))).not.toBeNull();
    expect(bookReply(['e2e4', 'a7a6', 'a2a3'], p, seeded(1))).toBeNull();
  });

  it("walks into Scholar's mate, in either move order", () => {
    for (const line of [
      ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'],
      ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'],
    ]) {
      const p = Position.standard();
      const history: string[] = [];
      for (const uci of line) {
        // The very first answer to 1.e4 is a matter of taste; everything after ...e5 is fixed.
        if (p.turn === 'b' && history.length > 1) {
          const reply = bookReply(history, p, seeded(1));
          expect(reply && moveToUci(reply), history.join(' ')).toBe(uci);
        }
        play(p, uci);
        history.push(uci);
      }
      expect(gameStatus(p).kind).toBe('checkmate');
    }
  });

  it("answers 1.f3 with ...e5 and then finds the fool's mate by itself", () => {
    const p = Position.standard();
    play(p, 'f2f3');
    const reply = bookReply(['f2f3'], p, seeded(1)) as Move;
    expect(moveToUci(reply)).toBe('e7e5');
    makeMove(p, reply);
    play(p, 'g2g4');
    const mate = search(p, { random: seeded(1) }) as { move: Move };
    expect(moveToUci(mate.move)).toBe('d8h4');
    makeMove(p, mate.move);
    expect(gameStatus(p).kind).toBe('checkmate');
  });
});
