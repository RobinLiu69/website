import { describe, expect, it } from 'vitest';
import { Position, STANDARD_FEN } from '../src/chess/position';
import {
  type Move,
  attackersOf,
  findMove,
  gameStatus,
  inCheck,
  insufficientMaterial,
  isAttacked,
  legalMoves,
  legalTargets,
  makeMove,
  moveToUci,
  unmakeMove,
} from '../src/chess/rules';
import { parseSquare } from '../src/chess/types';

const sq = (name: string): number => {
  const s = parseSquare(name);
  if (s === null) throw new Error(`bad square ${name}`);
  return s;
};

function perft(position: Position, depth: number): number {
  const moves = legalMoves(position);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    const undo = makeMove(position, move);
    nodes += perft(position, depth - 1);
    unmakeMove(position, move, undo);
  }
  return nodes;
}

const ucis = (position: Position): string[] => legalMoves(position).map(moveToUci).sort();

/** Well-known positions with their move-path counts from the chess programming community. */
const PERFT: Array<{ name: string; fen: string; counts: number[] }> = [
  { name: 'the starting position', fen: STANDARD_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: 'Kiwipete (castling, pins, en passant everywhere)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  { name: 'a rook ending (en passant checks)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238] },
  {
    name: 'promotions and castling out of check',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  {
    name: 'promotion with capture',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379],
  },
  {
    name: 'a middlegame with every piece',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890],
  },
];

describe('move generation (perft)', () => {
  for (const { name, fen, counts } of PERFT) {
    it(`counts every line from ${name}`, () => {
      const position = Position.fromFen(fen);
      const before = position.toFen();
      counts.forEach((expected, i) => {
        expect(perft(position, i + 1), `depth ${i + 1}`).toBe(expected);
      });
      expect(position.toFen()).toBe(before);
    });
  }

  it('leaves the position exactly as it found it', () => {
    for (const { fen } of PERFT) {
      const position = Position.fromFen(fen);
      const before = position.toFen();
      const ids = position.pieces().map((p) => p.piece);
      perft(position, 2);
      expect(position.toFen()).toBe(before);
      expect(position.pieces().map((p) => p.piece)).toEqual(ids);
    }
  });
});

describe('special moves', () => {
  it('castles on both sides when nothing is in the way', () => {
    const p = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const moves = ucis(p);
    expect(moves).toContain('e1g1');
    expect(moves).toContain('e1c1');

    const castle = findMove(p, sq('e1'), sq('g1')) as Move;
    expect(castle.flag).toBe('castle-k');
    makeMove(p, castle);
    expect(p.get(sq('g1'))).toEqual({ type: 'k', color: 'w' });
    expect(p.get(sq('f1'))).toEqual({ type: 'r', color: 'w' });
    expect(p.get(sq('h1'))).toBeNull();
    expect(p.castling & 3).toBe(0);
    expect(p.castling & 12).toBe(12);
  });

  it('keeps the pieces and their ids through castling and takes it back cleanly', () => {
    const p = Position.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    p.set(sq('e1'), { type: 'k', color: 'w', id: 1 });
    p.set(sq('a1'), { type: 'r', color: 'w', id: 2 });
    const move = findMove(p, sq('e1'), sq('c1')) as Move;
    const undo = makeMove(p, move);
    expect(p.get(sq('c1'))?.id).toBe(1);
    expect(p.get(sq('d1'))?.id).toBe(2);
    unmakeMove(p, move, undo);
    expect(p.get(sq('e1'))?.id).toBe(1);
    expect(p.get(sq('a1'))?.id).toBe(2);
    expect(p.get(sq('c1'))).toBeNull();
    expect(p.get(sq('d1'))).toBeNull();
  });

  it('refuses to castle out of, through or into check, or after the king or rook has moved', () => {
    // A rook on e8 gives check.
    expect(ucis(Position.fromFen('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'))).not.toContain('e1g1');
    // The f1 square is attacked by a bishop on c4.
    expect(ucis(Position.fromFen('6k1/8/8/8/2b5/8/8/R3K2R w KQ - 0 1'))).not.toContain('e1g1');
    // The g1 square is attacked by a rook on g8.
    expect(ucis(Position.fromFen('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1'))).not.toContain('e1g1');
    // But a rook attacking b1 does not stop the queenside castle.
    expect(ucis(Position.fromFen('1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'))).toContain('e1c1');
    // No rights.
    expect(ucis(Position.fromFen('6k1/8/8/8/8/8/8/R3K2R w - - 0 1'))).not.toContain('e1g1');
    // Moving the rook away and back loses the right.
    const p = Position.fromFen('6k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    makeMove(p, findMove(p, sq('h1'), sq('h2')) as Move);
    makeMove(p, findMove(p, sq('g8'), sq('f8')) as Move);
    makeMove(p, findMove(p, sq('h2'), sq('h1')) as Move);
    makeMove(p, findMove(p, sq('f8'), sq('g8')) as Move);
    expect(ucis(p)).not.toContain('e1g1');
    expect(ucis(p)).toContain('e1c1');
  });

  it('loses the right to castle when the rook is captured at home', () => {
    const p = Position.fromFen('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1');
    makeMove(p, findMove(p, sq('g2'), sq('h1')) as Move);
    expect(p.castling & 1).toBe(0);
    expect(p.castling & 2).toBe(2);
  });

  it('takes en passant only on the very next move', () => {
    const p = Position.fromFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const take = findMove(p, sq('e5'), sq('d6')) as Move;
    expect(take.flag).toBe('ep');
    expect(take.captured).toBe('p');
    makeMove(p, take);
    expect(p.get(sq('d5'))).toBeNull();
    expect(p.get(sq('d6'))).toEqual({ type: 'p', color: 'w' });

    const late = Position.fromFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3');
    expect(findMove(late, sq('e5'), sq('d6'))).toBeNull();
  });

  it('sets the en passant square after a double step and clears it after anything else', () => {
    const p = Position.standard();
    makeMove(p, findMove(p, sq('e2'), sq('e4')) as Move);
    expect(p.ep).toBe(sq('e3'));
    makeMove(p, findMove(p, sq('g8'), sq('f6')) as Move);
    expect(p.ep).toBe(-1);
  });

  it('will not take en passant if that exposes the king along the rank', () => {
    const p = Position.fromFen('8/8/8/KPp4r/8/8/8/7k w - c6 0 1');
    expect(ucis(p)).not.toContain('b5c6');
  });

  it('promotes to each piece, and a capture on the last rank promotes too', () => {
    const p = Position.fromFen('1n5k/P7/8/8/8/8/8/K7 w - - 0 1');
    const list = ucis(p).filter((m) => m.startsWith('a7'));
    expect(list).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r', 'a7b8b', 'a7b8n', 'a7b8q', 'a7b8r']);

    const queen = findMove(p, sq('a7'), sq('b8')) as Move;
    expect(queen.promotion).toBe('q');
    p.set(sq('a7'), { type: 'p', color: 'w', id: 5 });
    const undo = makeMove(p, queen);
    expect(p.get(sq('b8'))).toEqual({ type: 'q', color: 'w', id: 5 });
    unmakeMove(p, queen, undo);
    expect(p.get(sq('a7'))).toEqual({ type: 'p', color: 'w', id: 5 });
    expect(p.get(sq('b8'))).toEqual({ type: 'n', color: 'b' });

    const knight = findMove(p, sq('a7'), sq('a8'), 'n') as Move;
    expect(knight.promotion).toBe('n');
  });

  it('keeps a pinned piece on its line and answers a check', () => {
    // The knight on e2 is pinned by the rook on e8.
    const pinned = Position.fromFen('4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(legalTargets(pinned, sq('e2'))).toEqual([]);
    // In check from a rook: the king steps away, the bishop interposes or the rook is captured.
    const check = Position.fromFen('4r1k1/8/8/8/8/5B2/8/4K3 w - - 0 1');
    expect(inCheck(check)).toBe(true);
    expect(ucis(check)).toEqual(['e1d1', 'e1d2', 'e1f1', 'e1f2', 'f3e2', 'f3e4']);
  });
});

describe('the end of the game', () => {
  it('knows the fastest checkmate and who delivered it', () => {
    const p = Position.standard();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']] as const) {
      makeMove(p, findMove(p, sq(from), sq(to)) as Move);
    }
    const status = gameStatus(p);
    expect(status.kind).toBe('checkmate');
    if (status.kind === 'checkmate') {
      expect(status.loser).toBe('w');
      expect(status.checkers.map((c) => c.piece.type)).toEqual(['q']);
    }
  });

  it('recognises a back-rank mate and a smothered mate, and which piece gave them', () => {
    const backRank = gameStatus(Position.fromFen('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'));
    expect(backRank.kind === 'checkmate' && backRank.checkers.map((c) => c.piece.type)).toEqual(['r']);
    const smothered = gameStatus(Position.fromFen('6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1'));
    expect(smothered.kind === 'checkmate' && smothered.checkers.map((c) => c.piece.type)).toEqual(['n']);
  });

  it('lists both pieces of a double check, and only the king can answer it', () => {
    // The rook on e1 and the bishop on b5 both attack the king on e8.
    const p = Position.fromFen('4k3/8/8/1B6/8/8/8/4R1K1 b - - 0 1');
    expect(inCheck(p)).toBe(true);
    expect(attackersOf(p.cells, sq('e8'), 'w').map((a) => a.piece.type).sort()).toEqual(['b', 'r']);
    expect(gameStatus(p)).toEqual({ kind: 'playing', check: true });
    expect(new Set(legalMoves(p).map((m) => m.piece))).toEqual(new Set(['k']));
  });

  it('calls it a stalemate when the side to move has no move and is not in check', () => {
    expect(gameStatus(Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).kind).toBe('stalemate');
    expect(gameStatus(Position.fromFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1')).kind).toBe('playing');
  });

  it('draws when there is not enough material to mate', () => {
    expect(insufficientMaterial(Position.fromFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(Position.fromFen('8/8/4k3/8/8/3KB3/8/8 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(Position.fromFen('8/8/4k3/8/8/3KN3/8/8 w - - 0 1'))).toBe(true);
    // Bishops on the same colour cannot mate; on different colours they can.
    expect(insufficientMaterial(Position.fromFen('8/8/4kb2/8/8/3KB3/8/8 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(Position.fromFen('8/8/3bk3/8/8/3K1B2/8/8 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(Position.fromFen('8/8/4k3/8/8/3KP3/8/8 w - - 0 1'))).toBe(false);
    expect(insufficientMaterial(Position.fromFen('8/8/4k3/8/8/2NKN3/8/8 w - - 0 1'))).toBe(false);
    expect(gameStatus(Position.fromFen('8/8/4k3/8/8/3KB3/8/8 w - - 0 1'))).toEqual({ kind: 'draw', reason: 'insufficient' });
  });

  it('draws by the fifty-move rule and by threefold repetition', () => {
    expect(gameStatus(Position.fromFen('8/8/4k3/8/8/3K4/8/R7 w - - 100 80'))).toEqual({ kind: 'draw', reason: 'fifty' });
    expect(gameStatus(Position.fromFen('8/8/4k3/8/8/3K4/8/R7 w - - 99 80')).kind).toBe('playing');

    const p = Position.standard();
    const seen = [p.key()];
    for (let i = 0; i < 2; i++) {
      for (const [from, to] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']] as const) {
        makeMove(p, findMove(p, sq(from), sq(to)) as Move);
        seen.push(p.key());
      }
    }
    expect(gameStatus(p, seen)).toEqual({ kind: 'draw', reason: 'repetition' });
    expect(gameStatus(p, seen.slice(0, 5)).kind).toBe('playing');
  });
});

describe('attacks', () => {
  it('sees through the board the way pieces do', () => {
    const p = Position.fromFen('3r2k1/8/8/8/8/2n5/8/R2QK3 w - - 0 1');
    expect(isAttacked(p.cells, sq('d1'), 'b')).toBe(true); // the rook down the open d file
    expect(isAttacked(p.cells, sq('d5'), 'b')).toBe(true);
    expect(isAttacked(p.cells, sq('e2'), 'b')).toBe(true); // the knight on c3
    expect(isAttacked(p.cells, sq('e3'), 'b')).toBe(false);
    expect(isAttacked(p.cells, sq('a1'), 'b')).toBe(false); // a knight does not attack along a line
    expect(isAttacked(p.cells, sq('e2'), 'w')).toBe(true); // the queen and the king
    expect(isAttacked(p.cells, sq('a2'), 'w')).toBe(true); // the rook, one step up the a file
  });
});

describe('Position', () => {
  it('round-trips a FEN with its state', () => {
    for (const fen of [STANDARD_FEN, 'r3k2r/8/8/8/8/8/8/R3K2R b Kq e3 12 40', '8/8/4k3/8/8/3K4/8/R7 w - - 99 80']) {
      expect(Position.fromFen(fen).toFen()).toBe(fen);
    }
  });

  it('infers castling rights from a bare placement', () => {
    expect(Position.fromPlacement('r3k2r/8/8/8/8/8/8/R3K2R').castling).toBe(15);
    expect(Position.fromPlacement('8/8/8/8/8/8/8/4K3').castling).toBe(0);
  });
});
