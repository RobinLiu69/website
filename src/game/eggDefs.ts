export type EggCategory = 'capture' | 'board' | 'keyboard' | 'site';

export interface EggDef {
  id: string;
  category: EggCategory;
}

/**
 * Every easter egg on the site. Names, toasts and descriptions live in the
 * i18n dictionaries as `egg.<id>.name|toast|desc`; the achievements wall on the
 * hidden page is built from this list.
 */
export const EGGS = [
  { id: 'capture-black-queen', category: 'capture' },
  { id: 'capture-white-queen', category: 'capture' },
  { id: 'pawn-storm', category: 'capture' },
  { id: 'en-passant', category: 'capture' },
  { id: 'promotion', category: 'board' },
  { id: 'castle', category: 'board' },
  { id: 'stalemate', category: 'board' },
  { id: 'draw', category: 'board' },
  { id: 'scholars-mate', category: 'board' },
  { id: 'fools-mate', category: 'board' },
  { id: 'mate', category: 'board' },
  { id: 'mated', category: 'board' },
  { id: 'konami', category: 'keyboard' },
  { id: 'terminal', category: 'keyboard' },
  { id: 'xyzzy', category: 'keyboard' },
  { id: 'gg', category: 'keyboard' },
  { id: 'first-ghost', category: 'site' },
  { id: 'idle', category: 'site' },
  { id: 'all-unlocked', category: 'site' },
] as const satisfies readonly EggDef[];

export type EggId = (typeof EGGS)[number]['id'];

export const EGG_COUNT = EGGS.length;
