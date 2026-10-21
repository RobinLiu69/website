import { type SectionContext, loadSection } from '../content/loaders';
import { SECTIONS, type SectionId, sectionById } from '../content/sections';
import { t } from '../i18n';
import { glyph, h, icon } from './dom';

export interface PanelMetrics {
  mode: 'side' | 'sheet';
  /** Panel width in px (side mode) or the usable width (sheet mode). */
  width: number;
  /** Panel height in px (sheet mode) or the usable height (side mode). */
  height: number;
}

/** Wide screens get a panel on the right; narrow or portrait ones get a bottom sheet. */
export function panelMetrics(viewportW: number, viewportH: number): PanelMetrics {
  if (viewportW < 760 || viewportW / viewportH < 1) {
    return { mode: 'sheet', width: viewportW - 24, height: Math.round(Math.min(viewportH * 0.56, 540)) };
  }
  return { mode: 'side', width: Math.round(Math.min(470, viewportW * 0.4)), height: viewportH - 104 };
}

export interface PanelHost {
  context(): SectionContext;
  isUnlocked(id: SectionId): boolean;
  navigate(id: SectionId): void;
  closed(): void;
}

/** The card that slides in beside the scene with a section's content. */
export class SidePanel {
  readonly el: HTMLElement;
  private readonly chip = h('span', { class: 'panel-chip', attrs: { 'aria-hidden': 'true' } });
  private readonly title = h('h2', { class: 'panel-title', attrs: { id: 'panel-title' } });
  private readonly body = h('div', { class: 'panel-body' });
  private readonly prev = h('button', { class: 'nav-btn', attrs: { type: 'button' } });
  private readonly next = h('button', { class: 'nav-btn', attrs: { type: 'button' } });
  private readonly progress = h('span', { class: 'panel-progress' });
  private readonly closeBtn = h('button', { class: 'icon-btn', attrs: { type: 'button' } }, icon('close', 18));

  private current: SectionId | null = null;
  private token = 0;
  private opener: Element | null = null;

  constructor(
    root: HTMLElement,
    private readonly host: PanelHost,
  ) {
    this.closeBtn.addEventListener('click', () => this.close());
    this.prev.addEventListener('click', () => this.step(-1));
    this.next.addEventListener('click', () => this.step(1));

    this.el = h(
      'aside',
      { class: 'panel', attrs: { role: 'dialog', 'aria-labelledby': 'panel-title', 'aria-hidden': 'true', tabindex: '-1' } },
      h('header', { class: 'panel-head' }, this.chip, this.title, this.closeBtn),
      this.body,
      h('footer', { class: 'panel-foot' }, this.prev, this.progress, this.next),
    );
    this.el.inert = true;
    root.append(this.el);
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  get section(): SectionId | null {
    return this.current;
  }

  async open(id: SectionId): Promise<void> {
    const token = ++this.token;
    if (!this.isOpen) this.opener = document.activeElement;
    this.current = id;
    this.el.inert = false;
    this.el.setAttribute('aria-hidden', 'false');
    this.el.classList.add('open');
    this.renderChrome();
    this.body.replaceChildren(h('p', { class: 'muted', text: t('panel.loading') }));
    this.body.scrollTop = 0;
    this.el.focus({ preventScroll: true });
    await this.fill(id, token);
  }

  /** Re-renders in place, e.g. after a language change or a newly found egg. */
  async refresh(): Promise<void> {
    if (!this.current) return;
    const token = ++this.token;
    const scroll = this.body.scrollTop;
    this.renderChrome();
    await this.fill(this.current, token);
    this.body.scrollTop = scroll;
  }

  close(): void {
    if (!this.isOpen) return;
    this.token++;
    this.current = null;
    this.el.classList.remove('open');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.inert = true;
    const opener = this.opener;
    this.opener = null;
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    this.host.closed();
  }

  private async fill(id: SectionId, token: number): Promise<void> {
    try {
      const module = await loadSection(id);
      if (token !== this.token) return;
      this.body.replaceChildren(module.render(this.host.context()));
    } catch {
      if (token === this.token) this.body.replaceChildren(h('p', { class: 'muted', text: t('panel.error') }));
    }
  }

  private neighbours(): { prev: SectionId | null; next: SectionId | null } {
    const unlocked = SECTIONS.filter((s) => this.host.isUnlocked(s.id));
    const index = unlocked.findIndex((s) => s.id === this.current);
    return {
      prev: index > 0 ? (unlocked[index - 1]?.id ?? null) : null,
      next: index >= 0 && index < unlocked.length - 1 ? (unlocked[index + 1]?.id ?? null) : null,
    };
  }

  private step(direction: -1 | 1): void {
    const { prev, next } = this.neighbours();
    const target = direction < 0 ? prev : next;
    if (target) this.host.navigate(target);
  }

  private renderChrome(): void {
    if (!this.current) return;
    const meta = sectionById(this.current);
    this.chip.textContent = glyph(meta.piece);
    this.title.textContent = meta.id === 'secret' ? t('section.secretOpen') : t(`section.${meta.id}`);
    this.closeBtn.setAttribute('aria-label', t('panel.close'));

    const { prev, next } = this.neighbours();
    this.prev.replaceChildren(icon('prev', 16), h('span', { text: t('panel.prev') }));
    this.next.replaceChildren(h('span', { text: t('panel.next') }), icon('next', 16));
    this.prev.disabled = prev === null;
    this.next.disabled = next === null;
    const unlockedCount = SECTIONS.filter((s) => this.host.isUnlocked(s.id)).length;
    this.progress.textContent = `${unlockedCount} / ${SECTIONS.length}`;
  }
}
