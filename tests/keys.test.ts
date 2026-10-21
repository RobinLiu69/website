import { describe, expect, it } from 'vitest';
import { KONAMI, watchKeys } from '../src/game/keys';

function press(target: EventTarget, key: string, extra: Record<string, unknown> = {}): void {
  const event = Object.assign(new Event('keydown'), { key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });
  target.dispatchEvent(event);
}

describe('watchKeys', () => {
  it('fires a binding when its sequence is typed, ignoring earlier keys', () => {
    const target = new EventTarget();
    const hits: string[] = [];
    watchKeys(target as unknown as Window, [
      { keys: KONAMI, run: () => hits.push('konami') },
      { keys: ['g', 'g'], run: () => hits.push('gg') },
    ]);
    for (const key of ['q', 'ArrowUp', ...KONAMI]) press(target, key);
    press(target, 'G');
    press(target, 'g');
    expect(hits).toEqual(['konami', 'gg']);
  });

  it('ignores key repeat, modifier combos and muted periods', () => {
    const target = new EventTarget();
    let muted = false;
    const hits: string[] = [];
    watchKeys(target as unknown as Window, [{ keys: ['g', 'g'], run: () => hits.push('gg') }], () => muted);
    press(target, 'g');
    press(target, 'g', { repeat: true });
    expect(hits).toEqual([]);
    press(target, 'g', { ctrlKey: true });
    expect(hits).toEqual([]);
    muted = true;
    press(target, 'g');
    press(target, 'g');
    expect(hits).toEqual([]);
  });
});
