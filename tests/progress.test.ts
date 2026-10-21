import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Progress } from '../src/state/progress';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('Progress', () => {
  const globals = globalThis as unknown as { localStorage?: unknown };
  let original: unknown;

  beforeEach(() => {
    original = globals.localStorage;
    globals.localStorage = new MemoryStorage();
  });
  afterEach(() => {
    globals.localStorage = original;
  });

  it('reports whether an unlock or an egg is new', () => {
    const p = new Progress('en');
    expect(p.unlock('n')).toBe(true);
    expect(p.unlock('n')).toBe(false);
    expect(p.findEgg('gg')).toBe(true);
    expect(p.findEgg('gg')).toBe(false);
    expect(p.unlockedCount).toBe(1);
    expect(p.eggCount).toBe(1);
  });

  it('survives a reload', () => {
    const first = new Progress('en');
    first.unlock('q');
    first.findEgg('konami');
    first.setLang('zh-TW');
    first.setSound(true);

    const second = new Progress('en');
    expect(second.isUnlocked('q')).toBe(true);
    expect(second.hasEgg('konami')).toBe(true);
    expect(second.lang).toBe('zh-TW');
    expect(second.sound).toBe(true);
  });

  it('keeps language and sound when progress is reset', () => {
    const p = new Progress('en');
    p.unlock('p');
    p.findEgg('xyzzy');
    p.setLang('zh-TW');
    p.reset();
    expect(p.unlockedCount).toBe(0);
    expect(p.eggCount).toBe(0);
    expect(p.lang).toBe('zh-TW');
    expect(new Progress('en').unlockedCount).toBe(0);
  });

  it('notifies listeners on every change', () => {
    const p = new Progress('en');
    let changes = 0;
    p.on('change', () => changes++);
    p.unlock('b');
    p.unlock('b');
    p.findEgg('gg');
    p.setSound(true);
    expect(changes).toBe(3);
  });

  it('still works when storage is unavailable or holds junk', () => {
    globals.localStorage = {
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const p = new Progress('zh-TW');
    expect(p.lang).toBe('zh-TW');
    expect(() => p.unlock('r')).not.toThrow();
    expect(p.isUnlocked('r')).toBe(true);
  });
});
