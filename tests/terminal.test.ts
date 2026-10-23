import { describe, expect, it } from 'vitest';
import { parseSquare } from '../src/chess/types';
import type { SectionContext } from '../src/content/loaders';
import type { SectionId } from '../src/content/sections';
import { type TerminalContext, createInterpreter } from '../src/game/terminalCommands';
import type { Lang } from '../src/i18n';
import { getLang, t } from '../src/i18n';

function makeContext(unlocked: SectionId[] = []) {
  const calls: string[] = [];
  const ctx: TerminalContext = {
    isUnlocked: (id) => unlocked.includes(id),
    openSection: (id) => void calls.push(`open:${id}`),
    sectionContext: (): SectionContext => ({
      lang: getLang(),
      unlockedCount: unlocked.length,
      eggs: { found: 0, total: 18, has: () => false },
    }),
    move: async (from, to) => {
      calls.push(`move:${from}-${to}`);
      return true;
    },
    hasPiece: (square) => square === parseSquare('e2'),
    resetBoard: () => void calls.push('resetBoard'),
    resetProgress: () => void calls.push('resetProgress'),
    setLang: (lang: Lang) => void calls.push(`lang:${lang}`),
    setSound: (on) => void calls.push(`sound:${on}`),
    eggs: () => ({ found: 3, total: 18 }),
  };
  return { ctx, calls, run: createInterpreter(ctx) };
}

describe('terminal commands', () => {
  it('lists locked files as locked and unlocked ones plainly', async () => {
    const { run } = makeContext(['about']);
    const { out } = await run('ls');
    expect(out).toContain('fragments.txt');
    expect(out).not.toMatch(/fragments\.txt\s+\[locked\]/);
    expect(out).toMatch(/objects\.txt\s+\[locked\]/);
    expect(out).toContain('.???');
  });

  it('refuses to cat a locked file and prints an unlocked one', async () => {
    const locked = await makeContext([]).run('cat fragments.txt');
    expect(locked.out).toBe(t('terminal.locked', { file: 'fragments.txt' }));

    // The old section names still work as aliases.
    const alias = await makeContext([]).run('cat about');
    expect(alias.out).toBe(t('terminal.locked', { file: 'about' }));

    const open = await makeContext(['about']).run('cat fragments.txt');
    expect(open.out).toContain('暗處');
  });

  it('opens a section only when it is unlocked, then closes itself', async () => {
    const closed = makeContext([]);
    await closed.run('open projects');
    expect(closed.calls).toEqual([]);

    const open = makeContext(['projects']);
    const result = await open.run('open projects');
    expect(open.calls).toEqual(['open:projects']);
    expect(result.action).toBe('exit');
  });

  it('moves pieces by coordinates in several spellings', async () => {
    for (const line of ['move e2 e4', 'move e2e4', 'e2e4', 'e2-e4', 'MOVE E2 E4']) {
      const { run, calls } = makeContext();
      await run(line);
      expect(calls, line).toEqual([`move:${parseSquare('e2')}-${parseSquare('e4')}`]);
    }
  });

  it('explains bad moves instead of throwing', async () => {
    const { run, calls } = makeContext();
    expect((await run('move e5 e6')).out).toBe(t('terminal.noPiece', { square: 'e5' }));
    expect((await run('move nonsense')).out).toBe(t('terminal.moveUsage'));
    expect(calls).toEqual([]);
  });

  it('says so when the game refuses a move', async () => {
    const { ctx } = makeContext();
    const refusing = createInterpreter({ ...ctx, move: async () => false });
    expect((await refusing('move e2 e5')).out).toBe(t('terminal.illegal'));
  });

  it('does not say who is asking', async () => {
    const { run } = makeContext();
    expect((await run('whoami')).out).toBe(t('terminal.whoami'));
  });

  it('asks twice before wiping progress', async () => {
    const { run, calls } = makeContext();
    expect((await run('reset progress')).out).toBe(t('terminal.resetProgressConfirm'));
    expect(calls).toEqual([]);
    expect((await run('reset progress')).out).toBe(t('terminal.resetProgressDone'));
    expect(calls).toEqual(['resetProgress']);

    // Any other command in between cancels the confirmation.
    const again = makeContext();
    await again.run('reset progress');
    await again.run('eggs');
    expect((await again.run('reset progress')).out).toBe(t('terminal.resetProgressConfirm'));
  });

  it('handles language, sound, clear, exit and unknown commands', async () => {
    const { run, calls } = makeContext();
    await run('lang en');
    await run('lang zh');
    await run('sound on');
    await run('sound off');
    expect(calls).toEqual(['lang:en', 'lang:zh-TW', 'sound:true', 'sound:false']);
    expect((await run('lang fr')).out).toBe(t('terminal.langUsage'));
    expect((await run('clear')).action).toBe('clear');
    expect((await run('exit')).action).toBe('exit');
    expect((await run('frobnicate')).out).toBe(t('terminal.unknown', { cmd: 'frobnicate' }));
  });
});
