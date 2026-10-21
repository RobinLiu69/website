import { COMMANDS, type TerminalResult } from '../game/terminalCommands';
import { t } from '../i18n';
import { h, icon } from './dom';

export interface TerminalHooks {
  onOpen(): void;
  onClose(): void;
}

/** The terminal overlay: a log, a prompt and command history. Commands are run elsewhere. */
export class TerminalView {
  readonly el: HTMLElement;
  private readonly log = h('div', { class: 'term-log', attrs: { 'aria-live': 'polite' } });
  private readonly input = h('input', {
    class: 'term-input',
    attrs: {
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-label': 'terminal',
    },
  });
  private readonly prompt = h('span', { class: 'term-prompt' });
  private readonly title = h('span', { class: 'term-title' });
  private readonly history: string[] = [];
  private cursor = 0;
  /** Commands run one after another, so typing ahead while a move animates is safe. */
  private queue: Promise<void> = Promise.resolve();
  private opener: Element | null = null;

  constructor(
    root: HTMLElement,
    private readonly run: (line: string) => Promise<TerminalResult>,
    private readonly hooks: TerminalHooks,
  ) {
    const closeBtn = h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': 'close' } }, icon('close', 16));
    closeBtn.addEventListener('click', () => this.close());
    const form = h('form', { class: 'term-line' }, this.prompt, this.input);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));

    this.el = h(
      'section',
      { class: 'terminal', attrs: { role: 'dialog', 'aria-label': 'Terminal', 'aria-hidden': 'true' } },
      h('div', { class: 'term-bar' }, h('span', { class: 'dots' }), this.title, closeBtn),
      this.log,
      form,
    );
    this.el.inert = true;
    this.el.addEventListener('click', () => {
      if (!window.getSelection()?.toString()) this.input.focus();
    });
    root.append(this.el);
    this.refreshText();
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  open(): void {
    if (this.isOpen) return;
    this.opener = document.activeElement;
    this.el.inert = false;
    this.el.setAttribute('aria-hidden', 'false');
    this.el.classList.add('open');
    if (this.log.childElementCount === 0) this.print(t('terminal.welcome'));
    this.input.focus({ preventScroll: true });
    this.hooks.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.classList.remove('open');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.inert = true;
    const opener = this.opener;
    this.opener = null;
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    this.hooks.onClose();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  refreshText(): void {
    this.prompt.textContent = t('terminal.prompt');
    this.title.textContent = 'guest@chess';
  }

  private print(text: string, className = ''): void {
    this.log.append(h('pre', { class: `term-out ${className}`.trim(), text }));
    this.log.scrollTop = this.log.scrollHeight;
  }

  private submit(): void {
    const line = this.input.value;
    this.input.value = '';
    this.print(`${t('terminal.prompt')} ${line}`, 'echo');
    if (!line.trim()) return;
    this.history.push(line);
    this.cursor = this.history.length;

    this.queue = this.queue.then(async () => {
      try {
        const result = await this.run(line);
        if (result.action === 'clear') this.log.replaceChildren();
        if (result.out) this.print(result.out);
        if (result.action === 'exit') this.close();
      } catch {
        this.print(t('panel.error'));
      }
      this.log.scrollTop = this.log.scrollHeight;
    });
  }

  private onKey(e: KeyboardEvent): void {
    // Nothing typed here should reach the page-wide shortcuts.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.cursor = Math.max(0, this.cursor - 1);
      this.input.value = this.history[this.cursor] ?? '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.cursor = Math.min(this.history.length, this.cursor + 1);
      this.input.value = this.history[this.cursor] ?? '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const word = this.input.value.trim().toLowerCase();
      const match = word ? COMMANDS.find((c) => c.startsWith(word)) : undefined;
      if (match) this.input.value = `${match} `;
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      this.log.replaceChildren();
    }
  }
}
