export interface KeyBinding {
  /** Normalised keys: single characters lower-cased, named keys as `KeyboardEvent.key`. */
  keys: readonly string[];
  run: () => void;
}

export const KONAMI: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

const normalise = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

/** True while the user is typing into a form control, where shortcuts must stay quiet. */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Watches the stream of key presses for secret sequences. Returns an unsubscribe
 * function. `suspended` lets the caller mute it (for example while the terminal is open).
 */
export function watchKeys(
  target: Window,
  bindings: readonly KeyBinding[],
  suspended: () => boolean = () => false,
): () => void {
  const longest = Math.max(...bindings.map((b) => b.keys.length));
  let recent: string[] = [];

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || suspended() || isTyping(e.target)) return;
    recent = [...recent, normalise(e.key)].slice(-longest);
    for (const binding of bindings) {
      const n = binding.keys.length;
      if (recent.length >= n && recent.slice(-n).every((k, i) => k === binding.keys[i])) {
        recent = [];
        binding.run();
        return;
      }
    }
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
