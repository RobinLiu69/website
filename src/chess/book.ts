import type { Position } from './position';
import { type Move, findMove } from './rules';
import { parseSquare } from './types';

/**
 * What black plays in answer to the first few white moves, so the opening looks like chess rather than like
 * whatever a shallow search happens to prefer. Keys are the moves so far ("e2e4 e7e5 f1c4"); each value is a
 * list to choose from, and a move listed twice is twice as likely.
 *
 * Two of the lines are traps on purpose: a visitor who plays the two classic quick mates against the quiet
 * opponent finds that it walks into them.
 */
const BOOK: Record<string, string[]> = {
  // first moves
  e2e4: ['e7e5', 'e7e5', 'e7e5', 'c7c5', 'e7e6', 'c7c6'],
  d2d4: ['d7d5', 'd7d5', 'g8f6', 'g8f6'],
  g1f3: ['d7d5', 'g8f6', 'g8f6'],
  c2c4: ['e7e5', 'g8f6', 'c7c5', 'e7e6'],
  b1c3: ['d7d5', 'g8f6', 'e7e5'],
  e2e3: ['d7d5', 'e7e5', 'g8f6'],
  d2d3: ['e7e5', 'd7d5', 'g8f6'],
  g2g3: ['d7d5', 'g8f6', 'e7e5'],
  b2b3: ['e7e5', 'd7d5'],
  f2f4: ['d7d5', 'g8f6'],
  a2a3: ['e7e5', 'd7d5', 'g8f6'],
  a2a4: ['e7e5', 'd7d5', 'g8f6'],
  h2h3: ['e7e5', 'd7d5', 'g8f6'],
  h2h4: ['e7e5', 'd7d5', 'g8f6'],
  b2b4: ['e7e5', 'd7d5'],
  // the two quickest ways to lose, offered on purpose
  f2f3: ['e7e5'],
  g2g4: ['e7e5'],

  // 1.e4 e5
  'e2e4 e7e5 g1f3': ['b8c6', 'b8c6', 'b8c6', 'g8f6'],
  'e2e4 e7e5 b1c3': ['g8f6', 'b8c6'],
  'e2e4 e7e5 f2f4': ['e5f4', 'd7d5'],
  'e2e4 e7e5 d2d4': ['e5d4'],
  'e2e4 e7e5 f1c4': ['b8c6'],
  'e2e4 e7e5 d1h5': ['b8c6'],
  'e2e4 e7e5 g1f3 b8c6 f1c4': ['g8f6', 'f8c5'],
  'e2e4 e7e5 g1f3 b8c6 f1b5': ['a7a6', 'g8f6'],
  'e2e4 e7e5 g1f3 b8c6 d2d4': ['e5d4'],
  'e2e4 e7e5 g1f3 b8c6 b1c3': ['g8f6'],
  // Scholar's mate, both move orders: black develops, then overlooks the threat on f7.
  'e2e4 e7e5 f1c4 b8c6 d1h5': ['g8f6'],
  'e2e4 e7e5 d1h5 b8c6 f1c4': ['g8f6'],

  // other answers to 1.e4
  'e2e4 c7c5 g1f3': ['d7d6', 'b8c6', 'e7e6'],
  'e2e4 c7c5 b1c3': ['b8c6'],
  'e2e4 e7e6 d2d4': ['d7d5'],
  'e2e4 c7c6 d2d4': ['d7d5'],

  // 1.d4
  'd2d4 d7d5 c2c4': ['e7e6', 'c7c6'],
  'd2d4 d7d5 g1f3': ['g8f6'],
  'd2d4 d7d5 b1c3': ['g8f6'],
  'd2d4 d7d5 c1f4': ['g8f6', 'c7c6'],
  'd2d4 g8f6 c2c4': ['e7e6', 'g7g6'],
  'd2d4 g8f6 g1f3': ['e7e6', 'd7d5'],
  'd2d4 g8f6 b1c3': ['d7d5'],
  'd2d4 g8f6 c1g5': ['e7e6', 'f6e4'],

  // 1.Nf3 and 1.c4
  'g1f3 d7d5 d2d4': ['g8f6'],
  'g1f3 d7d5 c2c4': ['e7e6', 'd5c4'],
  'g1f3 g8f6 c2c4': ['e7e6', 'g7g6'],
  'c2c4 e7e5 b1c3': ['g8f6', 'b8c6'],
  'c2c4 g8f6 b1c3': ['e7e6', 'e7e5'],
};

/** Black's book reply to the moves played so far (in coordinate notation), if there is one that is legal here. */
export function bookReply(history: readonly string[], position: Position, random: () => number = Math.random): Move | null {
  const options = BOOK[history.join(' ')];
  if (!options || options.length === 0) return null;
  const choice = options[Math.min(options.length - 1, Math.floor(random() * options.length))] as string;
  const from = parseSquare(choice.slice(0, 2));
  const to = parseSquare(choice.slice(2, 4));
  if (from === null || to === null) return null;
  return findMove(position, from, to, 'q');
}

export const BOOK_LINES: Readonly<Record<string, readonly string[]>> = BOOK;
