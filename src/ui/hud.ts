import { SECTIONS, type SectionId } from '../content/sections';
import type { MatingPiece } from '../chess/types';
import { type Lang, t } from '../i18n';
import { glyph, h, icon } from './dom';

export interface HudHost {
  reset(): void;
  toggleLang(): void;
  toggleSound(): void;
  sigilClick(piece: MatingPiece): void;
}

export interface HudState {
  lang: Lang;
  sound: boolean;
  /** Pieces whose pages have been opened. */
  unlocked: readonly MatingPiece[];
  /** The piece whose page is open in the panel. */
  open: MatingPiece | null;
  sectionTitle(id: SectionId): string;
}

/**
 * The few marks that are not the board: small round buttons, and, once something has been opened, a row of
 * sigils to open it again. There is no name and no text; the page says nothing about itself.
 */
export class Hud {
  private readonly sigils = h('nav', { class: 'sigils', attrs: { hidden: '' } });
  private readonly langBtn = h('button', { class: 'orb orb-text', attrs: { type: 'button' } });
  private readonly soundBtn = h('button', { class: 'orb', attrs: { type: 'button' } });
  private readonly resetBtn = h('button', { class: 'orb', attrs: { type: 'button' } });
  private known = new Set<MatingPiece>();

  constructor(
    root: HTMLElement,
    private readonly host: HudHost,
  ) {
    this.langBtn.addEventListener('click', () => this.host.toggleLang());
    this.soundBtn.addEventListener('click', () => this.host.toggleSound());
    this.resetBtn.addEventListener('click', () => this.host.reset());

    root.append(
      h('header', { class: 'hud-top' }, this.sigils, h('div', { class: 'hud-actions' }, this.langBtn, this.soundBtn)),
      h('div', { class: 'hud-bottom' }, h('div', { class: 'hud-left' }, this.resetBtn)),
    );
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

    this.renderSigils(state);
  }

  private renderSigils(state: HudState): void {
    const fresh = state.unlocked.filter((piece) => !this.known.has(piece));
    this.known = new Set(state.unlocked);
    this.sigils.hidden = state.unlocked.length === 0;
    this.sigils.setAttribute('aria-label', t('hud.sigils'));
    this.sigils.replaceChildren(
      ...SECTIONS.filter((section) => state.unlocked.includes(section.piece)).map((section) => {
        const title = state.sectionTitle(section.id);
        return h(
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
      }),
    );
  }
}
