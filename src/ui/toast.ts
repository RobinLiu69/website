import { type IconName, h, icon } from './dom';

export type ToastKind = 'info' | 'unlock' | 'egg' | 'warn';

const KIND_ICON: Record<ToastKind, IconName> = {
  info: 'check',
  unlock: 'unlock',
  egg: 'egg',
  warn: 'lock',
};

/** Small messages that stack in a corner and fade away on their own. */
export class Toasts {
  constructor(private readonly root: HTMLElement) {}

  show(message: string, kind: ToastKind = 'info', ms = 4200): void {
    const el = h(
      'div',
      { class: `toast toast-${kind}` },
      h('span', { class: 'toast-icon' }, icon(KIND_ICON[kind], 16)),
      h('span', { class: 'toast-text', text: message }),
    );
    this.root.append(el);
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    window.setTimeout(() => {
      el.classList.remove('in');
      window.setTimeout(() => el.remove(), 450);
    }, ms);
  }
}

/** A big, short-lived line across the middle of the screen ("Checkmate!"). */
export class Banner {
  private timer = 0;

  constructor(private readonly root: HTMLElement) {}

  show(text: string, sub?: string, ms = 2000): void {
    window.clearTimeout(this.timer);
    const lines = [h('div', { class: 'banner-main', text })];
    if (sub) lines.push(h('div', { class: 'banner-sub', text: sub }));
    this.root.replaceChildren(...lines);
    this.root.classList.remove('show');
    // Restart the animation.
    void this.root.offsetWidth;
    this.root.classList.add('show');
    this.timer = window.setTimeout(() => this.root.classList.remove('show'), ms);
  }
}
