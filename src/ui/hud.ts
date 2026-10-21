import type { MatingPiece } from '../chess/puzzles';
import { profile } from '../content/profile';
import { type Lang, t } from '../i18n';
import { glyph, h, icon } from './dom';

export interface HudHost {
  reset(): void;
  toggleLang(): void;
  toggleSound(): void;
  puzzleRestart(): void;
  puzzleLeave(): void;
  titleClick(): void;
}

export interface HudState {
  lang: Lang;
  sound: boolean;
  eggs: { found: number; total: number };
  puzzle: { piece: MatingPiece; solved: boolean } | null;
}

const MARK = `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
  <rect width="64" height="64" rx="14" fill="var(--ink)"/>
  <polygon points="32,10 41,15 41,25 32,30 23,25 23,15" fill="var(--accent)"/>
  <polygon points="32,10 41,15 32,19 23,15" fill="#f0987a"/>
  <polygon points="32,19 41,15 41,25 32,30" fill="var(--accent-deep)"/>
  <polygon points="22,31 42,31 39,36 25,36" fill="#f2ede4"/>
  <polygon points="26,36 38,36 40,47 24,47" fill="#e3dccf"/>
  <polygon points="19,47 45,47 48,54 16,54" fill="#f2ede4"/>
</svg>`;

/** Brand, language and sound buttons, reset, the intro hint, the puzzle bar and the egg counter. */
export class Hud {
  private readonly tagline = h('p', { class: 'tagline' });
  private readonly langBtn = h('button', { class: 'pill-btn', attrs: { type: 'button' } });
  private readonly soundBtn = h('button', { class: 'pill-btn icon-only', attrs: { type: 'button' } });
  private readonly resetBtn = h('button', { class: 'pill-btn', attrs: { type: 'button' } });
  private readonly eggChip = h('div', { class: 'egg-chip' });
  private readonly hint = h('div', { class: 'hint' });
  private readonly puzzleBar = h('div', { class: 'puzzle-bar', attrs: { hidden: '' } });
  private hintVisible = true;

  constructor(
    root: HTMLElement,
    private readonly host: HudHost,
  ) {
    const brand = h('div', { class: 'brand' });
    brand.innerHTML = MARK;
    const title = h('h1', { class: 'brand-name', text: profile.name, on: { click: () => this.host.titleClick() } });
    brand.append(h('div', { class: 'brand-text' }, title, this.tagline));

    this.langBtn.addEventListener('click', () => this.host.toggleLang());
    this.soundBtn.addEventListener('click', () => this.host.toggleSound());
    this.resetBtn.addEventListener('click', () => this.host.reset());

    root.append(
      h('header', { class: 'hud-top' }, brand, h('div', { class: 'hud-actions' }, this.langBtn, this.soundBtn)),
      h(
        'div',
        { class: 'hud-bottom' },
        h('div', { class: 'hud-left' }, this.resetBtn),
        h('div', { class: 'hud-center' }, this.puzzleBar, this.hint),
        h('div', { class: 'hud-right' }, this.eggChip),
      ),
    );
  }

  /** The intro hint fades out once the visitor has touched anything. */
  showHint(visible: boolean): void {
    this.hintVisible = visible;
    this.hint.classList.toggle('gone', !visible);
  }

  refresh(state: HudState): void {
    this.tagline.textContent = profile.tagline[state.lang];

    this.langBtn.textContent = t('hud.langLabel');
    this.langBtn.setAttribute('aria-label', t('hud.langSwitch'));
    this.langBtn.setAttribute('lang', state.lang === 'zh-TW' ? 'en' : 'zh-Hant');

    this.soundBtn.replaceChildren(icon(state.sound ? 'soundOn' : 'soundOff', 18));
    this.soundBtn.setAttribute('aria-label', state.sound ? t('hud.soundOff') : t('hud.soundOn'));
    this.soundBtn.setAttribute('aria-pressed', String(state.sound));

    this.resetBtn.replaceChildren(icon('reset', 16), h('span', { text: t('hud.reset') }));

    this.eggChip.replaceChildren(
      icon('egg', 15),
      h('span', { text: t('hud.eggs', { found: state.eggs.found, total: state.eggs.total }) }),
    );
    this.eggChip.title = t('hud.eggsTip');

    this.hint.replaceChildren(h('span', { text: t('hud.hint') }), h('span', { class: 'hint-keys', text: t('hud.hintKeys') }));
    this.hint.classList.toggle('gone', !this.hintVisible || state.puzzle !== null);

    this.renderPuzzle(state.puzzle);
  }

  private renderPuzzle(puzzle: HudState['puzzle']): void {
    if (!puzzle) {
      this.puzzleBar.setAttribute('hidden', '');
      this.puzzleBar.replaceChildren();
      return;
    }
    this.puzzleBar.removeAttribute('hidden');
    this.puzzleBar.classList.toggle('solved', puzzle.solved);
    const secret = puzzle.piece === 'q' && !puzzle.solved;
    const goal = puzzle.solved
      ? [icon('check', 16), h('span', { text: t('puzzle.solved') })]
      : [
          h('span', { class: 'pz-glyph', text: secret ? '?' : glyph(puzzle.piece) }),
          h('span', { text: secret ? t('puzzle.goalSecret') : t('puzzle.goal', { piece: t(`piece.${puzzle.piece}`) }) }),
        ];
    this.puzzleBar.replaceChildren(
      h('span', { class: 'pz-label', text: t('puzzle.label') }),
      h('span', { class: 'pz-goal' }, ...goal),
      h('button', { class: 'mini-btn', attrs: { type: 'button' }, text: t('puzzle.restart'), on: { click: () => this.host.puzzleRestart() } }),
      h('button', { class: 'mini-btn', attrs: { type: 'button' }, text: t('puzzle.leave'), on: { click: () => this.host.puzzleLeave() } }),
    );
  }
}
