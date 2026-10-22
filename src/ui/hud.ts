import type { MatingPiece } from '../chess/puzzles';
import { profile } from '../content/profile';
import { SECTIONS, type SectionId } from '../content/sections';
import { type Lang, t } from '../i18n';
import { glyph, h, icon } from './dom';

export interface HudHost {
  reset(): void;
  riddle(): void;
  toggleLang(): void;
  toggleSound(): void;
  puzzleRestart(): void;
  puzzleLeave(): void;
  signatureClick(): void;
  sigilClick(piece: MatingPiece): void;
}

export interface HudState {
  lang: Lang;
  sound: boolean;
  /** Pieces whose sections are unlocked. */
  unlocked: readonly MatingPiece[];
  /** The piece whose section is open in the panel. */
  open: MatingPiece | null;
  puzzle: { piece: MatingPiece; solved: boolean } | null;
  /** Nothing is left to find: the riddle button has done its job. */
  finished: boolean;
  sectionTitle(id: SectionId): string;
}

/**
 * The few marks that are not the board: a signature, small round buttons, a whisper that says what the board
 * will not, and, once something has been opened, a row of sigils to open it again.
 */
export class Hud {
  private readonly signature = h('h1', { class: 'signature', text: profile.name });
  private readonly sigils = h('nav', { class: 'sigils', attrs: { hidden: '' } });
  private readonly langBtn = h('button', { class: 'orb orb-text', attrs: { type: 'button' } });
  private readonly soundBtn = h('button', { class: 'orb', attrs: { type: 'button' } });
  private readonly resetBtn = h('button', { class: 'orb', attrs: { type: 'button' } });
  private readonly riddleBtn = h('button', { class: 'orb orb-text', attrs: { type: 'button' }, text: '?' });
  private readonly whisper = h('div', { class: 'whisper' });
  private readonly riddle = h('div', { class: 'riddle', attrs: { hidden: '' } });
  private hintVisible = true;
  private known = new Set<MatingPiece>();

  constructor(
    root: HTMLElement,
    private readonly host: HudHost,
  ) {
    this.signature.addEventListener('click', () => this.host.signatureClick());
    this.langBtn.addEventListener('click', () => this.host.toggleLang());
    this.soundBtn.addEventListener('click', () => this.host.toggleSound());
    this.resetBtn.addEventListener('click', () => this.host.reset());
    this.riddleBtn.addEventListener('click', () => this.host.riddle());

    root.append(
      h('header', { class: 'hud-top' }, this.signature, this.sigils, h('div', { class: 'hud-actions' }, this.langBtn, this.soundBtn)),
      h(
        'div',
        { class: 'hud-bottom' },
        h('div', { class: 'hud-left' }, this.resetBtn, this.riddleBtn),
        h('div', { class: 'hud-center' }, this.riddle, this.whisper),
      ),
    );
  }

  /** Makes the riddle button breathe for a moment, for a visitor who has not found it yet. */
  nudgeRiddle(): void {
    this.riddleBtn.classList.add('nudge');
    window.setTimeout(() => this.riddleBtn.classList.remove('nudge'), 9000);
  }

  /** The whisper fades out once the visitor has touched anything. */
  showHint(visible: boolean): void {
    this.hintVisible = visible;
    this.whisper.classList.toggle('gone', !visible);
  }

  refresh(state: HudState): void {
    this.langBtn.textContent = t('hud.langLabel');
    this.langBtn.setAttribute('aria-label', t('hud.langSwitch'));
    this.langBtn.setAttribute('lang', state.lang === 'zh-TW' ? 'en' : 'zh-Hant');

    this.soundBtn.replaceChildren(icon(state.sound ? 'soundOn' : 'soundOff', 17));
    this.soundBtn.setAttribute('aria-label', state.sound ? t('hud.soundOff') : t('hud.soundOn'));
    this.soundBtn.setAttribute('aria-pressed', String(state.sound));

    this.resetBtn.replaceChildren(icon('reset', 17));
    this.resetBtn.setAttribute('aria-label', t('hud.reset'));
    this.resetBtn.title = t('hud.reset');

    this.riddleBtn.setAttribute('aria-label', t('hud.riddle'));
    this.riddleBtn.title = t('hud.riddle');
    this.riddleBtn.hidden = state.finished;

    this.whisper.textContent = t('hud.whisper');
    this.whisper.classList.toggle('gone', !this.hintVisible || state.puzzle !== null);

    this.renderSigils(state);
    this.renderRiddle(state.puzzle);
  }

  private renderSigils(state: HudState): void {
    const fresh = state.unlocked.filter((piece) => !this.known.has(piece));
    this.known = new Set(state.unlocked);
    this.sigils.hidden = state.unlocked.length === 0;
    this.sigils.setAttribute('aria-label', t('hud.sigils'));
    this.sigils.replaceChildren(
      ...SECTIONS.filter((section) => state.unlocked.includes(section.piece)).map((section) => {
        const title = state.sectionTitle(section.id);
        const button = h(
          'button',
          {
            class: `sigil${state.open === section.piece ? ' is-open' : ''}${fresh.includes(section.piece) ? ' is-fresh' : ''}`,
            attrs: { type: 'button', 'aria-label': title, 'aria-pressed': String(state.open === section.piece) },
            dataset: { piece: section.piece },
            on: { click: () => this.host.sigilClick(section.piece) },
          },
          h('span', { class: 'sigil-glyph', text: glyph(section.piece), attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'sigil-name', text: title }),
        );
        return button;
      }),
    );
  }

  private renderRiddle(puzzle: HudState['puzzle']): void {
    if (!puzzle) {
      this.riddle.setAttribute('hidden', '');
      this.riddle.replaceChildren();
      return;
    }
    this.riddle.removeAttribute('hidden');
    this.riddle.classList.toggle('solved', puzzle.solved);
    const text = puzzle.solved ? t('riddle.solved') : t(`riddle.${puzzle.piece}`);

    const restart = h(
      'button',
      {
        class: 'mini-orb',
        attrs: { type: 'button', 'aria-label': t('riddle.restart'), title: t('riddle.restart') },
        on: { click: () => this.host.puzzleRestart() },
      },
      icon('reset', 15),
    );
    const leave = h(
      'button',
      {
        class: 'mini-orb',
        attrs: { type: 'button', 'aria-label': t('riddle.leave'), title: t('riddle.leave') },
        on: { click: () => this.host.puzzleLeave() },
      },
      icon('close', 15),
    );
    this.riddle.replaceChildren(
      h('span', { class: 'riddle-text' }, puzzle.solved ? icon('check', 16) : null, h('span', { text })),
      ...(puzzle.solved ? [leave] : [restart, leave]),
    );
  }
}
