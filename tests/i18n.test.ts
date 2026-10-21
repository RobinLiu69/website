import { describe, expect, it } from 'vitest';
import { EGGS } from '../src/game/eggDefs';
import { en } from '../src/i18n/en';
import { zhTW } from '../src/i18n/zh-TW';

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

describe('i18n dictionaries', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhTW).sort());
  });

  it('never leave a string empty', () => {
    for (const [key, value] of [...Object.entries(zhTW), ...Object.entries(en)]) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('use the same {placeholders} in both languages', () => {
    for (const key of Object.keys(zhTW) as Array<keyof typeof zhTW>) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zhTW[key]));
    }
  });

  it('describe every easter egg in both languages', () => {
    for (const egg of EGGS) {
      for (const part of ['name', 'toast', 'desc'] as const) {
        const key = `egg.${egg.id}.${part}` as keyof typeof zhTW;
        expect(zhTW[key], key).toBeTruthy();
        expect(en[key], key).toBeTruthy();
      }
      expect(zhTW[`category.${egg.category}` as keyof typeof zhTW]).toBeTruthy();
    }
  });

  it('has unique egg ids', () => {
    expect(new Set(EGGS.map((e) => e.id)).size).toBe(EGGS.length);
  });
});
