import type { Square } from '../chess/types';
import { parseSquare } from '../chess/types';
import { profile } from '../content/profile';
import { type SectionContext, loadSection } from '../content/loaders';
import { type SectionId, sectionById } from '../content/sections';
import { type Lang, getLang, t } from '../i18n';

export interface TerminalContext {
  isUnlocked(id: SectionId): boolean;
  openSection(id: SectionId): void;
  sectionContext(): SectionContext;
  /** Resolves false when there was nothing to move. */
  move(from: Square, to: Square): Promise<boolean>;
  hasPiece(square: Square): boolean;
  resetBoard(): void;
  resetProgress(): void;
  setLang(lang: Lang): void;
  setSound(on: boolean): void;
  eggs(): { found: number; total: number };
}

export interface TerminalResult {
  out?: string;
  action?: 'clear' | 'exit';
}

/** What the terminal calls each section. */
const FILES: ReadonlyArray<{ name: string; id: SectionId }> = [
  { name: 'about.txt', id: 'about' },
  { name: 'projects.txt', id: 'projects' },
  { name: 'skills.md', id: 'skills' },
  { name: 'contact.txt', id: 'contact' },
  { name: '.secret', id: 'secret' },
];

export const COMMANDS = [
  'help',
  'whoami',
  'ls',
  'cat',
  'open',
  'move',
  'reset',
  'lang',
  'sound',
  'eggs',
  'fortune',
  'clear',
  'exit',
] as const;

const findSection = (word: string): SectionId | null => {
  const w = word.toLowerCase();
  const byFile = FILES.find((f) => f.name === w || f.name.replace(/\.\w+$/, '') === w);
  if (byFile) return byFile.id;
  return FILES.find((f) => f.id === w)?.id ?? null;
};

/** The little command language behind the terminal easter egg. */
export function createInterpreter(ctx: TerminalContext): (line: string) => Promise<TerminalResult> {
  let confirmingReset = false;

  const say = (key: Parameters<typeof t>[0], params?: Record<string, string | number>): TerminalResult => ({
    out: t(key, params),
  });

  const move = async (text: string): Promise<TerminalResult> => {
    const match = /([a-h][1-8])\D*([a-h][1-8])/i.exec(text);
    if (!match) return say('terminal.moveUsage');
    const from = parseSquare(match[1] as string);
    const to = parseSquare(match[2] as string);
    if (from === null) return say('terminal.badSquare', { square: match[1] as string });
    if (to === null) return say('terminal.badSquare', { square: match[2] as string });
    if (!ctx.hasPiece(from)) return say('terminal.noPiece', { square: (match[1] as string).toLowerCase() });
    const moved = await ctx.move(from, to);
    return moved
      ? say('terminal.moved', { from: (match[1] as string).toLowerCase(), to: (match[2] as string).toLowerCase() })
      : say('terminal.moveUsage');
  };

  return async (line) => {
    const trimmed = line.trim();
    const [rawCmd = '', ...args] = trimmed.split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    if (cmd !== 'reset') confirmingReset = false;

    // "e2e4" and "e2-e4" are moves too.
    if (/^[a-h][1-8][-\s]?[a-h][1-8]$/i.test(trimmed)) return move(trimmed);

    switch (cmd) {
      case 'help':
      case '?':
        return say('terminal.help');
      case 'whoami':
        return { out: `${profile.name}\n${profile.tagline[getLang()]}` };
      case 'ls':
        return {
          out: FILES.map((f) => {
            const open = ctx.isUnlocked(f.id);
            const name = f.id === 'secret' && !open ? '.???' : f.name;
            return open ? name : `${name.padEnd(14)} [locked]`;
          }).join('\n'),
        };
      case 'cat': {
        if (!args[0]) return say('terminal.noFile', { file: '' });
        const id = findSection(args[0]);
        if (!id) return say('terminal.noFile', { file: args[0] });
        if (!ctx.isUnlocked(id)) return say('terminal.locked', { file: args[0] });
        const module = await loadSection(id);
        return { out: module.plain(ctx.sectionContext()) };
      }
      case 'open': {
        if (!args[0]) return say('terminal.noFile', { file: '' });
        const id = findSection(args[0]);
        if (!id) return say('terminal.noFile', { file: args[0] });
        if (!ctx.isUnlocked(id)) return say('terminal.locked', { file: args[0] });
        ctx.openSection(id);
        const name = id === 'secret' ? t('section.secretOpen') : t(`section.${sectionById(id).id}`);
        return { out: t('terminal.opened', { section: name }), action: 'exit' };
      }
      case 'move':
        return move(args.join(' '));
      case 'reset':
        if (args[0]?.toLowerCase() === 'progress') {
          if (!confirmingReset) {
            confirmingReset = true;
            return say('terminal.resetProgressConfirm');
          }
          confirmingReset = false;
          ctx.resetProgress();
          return say('terminal.resetProgressDone');
        }
        ctx.resetBoard();
        return say('terminal.resetDone');
      case 'lang': {
        const target = args[0]?.toLowerCase();
        if (target === 'zh' || target === 'zh-tw') ctx.setLang('zh-TW');
        else if (target === 'en') ctx.setLang('en');
        else return say('terminal.langUsage');
        return say('terminal.langDone');
      }
      case 'sound': {
        const target = args[0]?.toLowerCase();
        if (target === 'on') {
          ctx.setSound(true);
          return say('terminal.soundOn');
        }
        if (target === 'off') {
          ctx.setSound(false);
          return say('terminal.soundOff');
        }
        return say('terminal.soundUsage');
      }
      case 'eggs':
        return say('terminal.eggs', ctx.eggs());
      case 'fortune': {
        const lines = t('terminal.fortunes').split('\n');
        return { out: lines[Math.floor(Math.random() * lines.length)] };
      }
      case 'hello':
      case 'hi':
        return say('terminal.hello');
      case 'sudo':
        return say('terminal.sudo');
      case 'rm':
        return say('terminal.rm');
      case 'clear':
      case 'cls':
        return { action: 'clear' };
      case 'exit':
      case 'quit':
      case 'q':
        return { action: 'exit' };
      default:
        return say('terminal.unknown', { cmd: rawCmd });
    }
  };
}
