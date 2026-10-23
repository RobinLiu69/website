import type { Position } from '../chess/position';
import { type Color, type Piece, parseSquare } from '../chess/types';
import type { Progress } from '../state/progress';
import { EGGS, type EggId } from './eggDefs';
import { Emitter } from './events';
import type { Game } from './game';

export interface EggFound extends Record<string, unknown> {
  found: { id: EggId; fresh: boolean };
}

const at = (position: Position, name: string): Piece | null => {
  const square = parseSquare(name);
  return square === null ? null : position.get(square);
};

const is = (piece: Piece | null, color: Color, type: Piece['type']): boolean =>
  piece?.color === color && piece.type === type;

/**
 * Turns things that happen on the board into easter eggs. Eggs that come from
 * the keyboard or the page itself call `trigger` directly.
 */
export class EggEngine extends Emitter<EggFound> {
  constructor(
    private readonly progress: Progress,
    game: Game,
  ) {
    super();

    game.on('captured', ({ victim }) => {
      if (victim.type === 'q') this.trigger(victim.color === 'b' ? 'capture-black-queen' : 'capture-white-queen');
      if (victim.color === 'b' && victim.type === 'p') {
        const left = game.position.pieces().some((p) => p.piece.color === 'b' && p.piece.type === 'p');
        if (!left) this.trigger('pawn-storm');
      }
    });
    // Only the player's own deeds count: the opponent castling or promoting is not an achievement.
    game.on('promoted', ({ piece }) => piece.color === game.player && this.trigger('promotion'));
    game.on('castled', ({ color }) => color === game.player && this.trigger('castle'));
    game.on('enPassant', ({ color }) => color === game.player && this.trigger('en-passant'));
    game.on('stalemate', () => this.trigger('stalemate'));
    game.on('draw', () => this.trigger('draw'));
    game.on('checkmate', ({ loser }) => {
      const p = game.position;
      if (loser === 'b') {
        this.trigger('mate');
        if (is(at(p, 'f7'), 'w', 'q') && is(at(p, 'c4'), 'w', 'b') && is(at(p, 'e8'), 'b', 'k')) this.trigger('scholars-mate');
      } else {
        this.trigger('mated');
        if (is(at(p, 'h4'), 'b', 'q') && is(at(p, 'e1'), 'w', 'k') && is(at(p, 'g4'), 'w', 'p')) this.trigger('fools-mate');
      }
    });
  }

  get total(): number {
    return EGGS.length;
  }

  /** Records the egg and announces it. `fresh` is false when it had been found before. */
  trigger(id: EggId): void {
    const fresh = this.progress.findEgg(id);
    this.emit('found', { id, fresh });
  }
}
