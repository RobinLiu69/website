import type * as THREE from 'three';
import type { MatingPiece } from '../chess/puzzles';
import { sectionForPiece } from '../content/sections';
import { t } from '../i18n';
import { STAGE_ORDER } from '../three/layout';
import type { Plinths } from '../three/plinthView';
import { glyph, h, icon } from './dom';

export interface LabelHost {
  plinthClick(piece: MatingPiece): void;
  plinthHover(piece: MatingPiece | null): void;
}

interface Item {
  el: HTMLButtonElement;
  title: HTMLElement;
  hint: HTMLElement;
  state: HTMLElement;
}

/** HTML labels that hang above each plinth, following it as the camera moves. */
export class PlinthLabels {
  private readonly items = new Map<MatingPiece, Item>();
  private readonly last = new Map<MatingPiece, string>();
  private readonly widths = new Map<MatingPiece, number>();
  private active: MatingPiece | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: LabelHost,
  ) {
    for (const piece of STAGE_ORDER) {
      const title = h('span', { class: 'pl-title' });
      const hint = h('span', { class: 'pl-hint' });
      const state = h('span', { class: 'pl-state' });
      const el = h(
        'button',
        {
          class: 'plinth-label',
          attrs: { type: 'button' },
          dataset: { piece },
          on: {
            click: () => this.host.plinthClick(piece),
            pointerenter: () => this.host.plinthHover(piece),
            pointerleave: () => this.host.plinthHover(null),
            focus: () => this.host.plinthHover(piece),
            blur: () => this.host.plinthHover(null),
          },
        },
        h('span', { class: 'pl-glyph', text: glyph(piece), attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'pl-text' }, title, hint),
        state,
      );
      this.root.append(el);
      this.items.set(piece, { el, title, hint, state });
    }
  }

  /** Rewrites every label's text and lock state. Call after a language or unlock change. */
  refresh(isUnlocked: (piece: MatingPiece) => boolean): void {
    for (const [piece, item] of this.items) {
      const section = sectionForPiece(piece).id;
      const unlocked = isUnlocked(piece);
      const secret = section === 'secret';
      const title = secret && unlocked ? t('section.secretOpen') : t(`section.${section}`);
      const hint = secret ? '' : t('plinth.hint', { piece: t(`piece.${piece}`) });

      item.title.textContent = title;
      item.hint.textContent = hint;
      item.el.classList.toggle('is-locked', !unlocked);
      item.el.classList.toggle('is-open', unlocked);
      item.state.replaceChildren(icon(unlocked ? 'unlock' : 'lock', 15));
      this.measureAgain();
      item.el.setAttribute(
        'aria-label',
        unlocked
          ? t('plinth.ariaOpen', { section: title })
          : t('plinth.ariaLocked', { section: title, hint: hint || t('plinth.hintSecret') }),
      );
    }
  }

  setActive(piece: MatingPiece | null): void {
    this.active = piece;
    for (const [p, item] of this.items) item.el.classList.toggle('is-active', p === piece);
    this.measureAgain();
  }

  setHover(piece: MatingPiece | null): void {
    for (const [p, item] of this.items) item.el.classList.toggle('is-hover', p === piece);
    this.measureAgain();
  }

  /** While a panel is open only the label of the open section stays on screen. */
  setDimmed(dimmed: boolean): void {
    this.root.classList.toggle('is-dimmed', dimmed);
  }

  /** Forget cached widths: labels change size when their text or state changes. */
  private measureAgain(): void {
    this.widths.clear();
    this.last.clear();
  }

  update(camera: THREE.Camera, plinths: Plinths, width: number, height: number): void {
    for (const [piece, item] of this.items) {
      const view = plinths.views.get(piece);
      if (!view) continue;
      const p = view.labelAnchor.project(camera);
      const hidden = p.z > 1 || p.z < -1;
      let w = this.widths.get(piece);
      if (w === undefined) {
        w = item.el.offsetWidth;
        this.widths.set(piece, w);
      }
      const margin = w / 2 + 8;
      const x = Math.round(Math.min(Math.max((p.x * 0.5 + 0.5) * width, margin), Math.max(width - margin, margin)));
      const y = Math.round((-p.y * 0.5 + 0.5) * height);
      const key = hidden ? 'hidden' : `${x},${y}`;
      if (this.last.get(piece) === key) continue;
      this.last.set(piece, key);
      item.el.style.visibility = hidden ? 'hidden' : 'visible';
      item.el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    }
  }

  get activePiece(): MatingPiece | null {
    return this.active;
  }
}
