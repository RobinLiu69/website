import type { MatingPiece } from '../chess/puzzles';
import { EGGS } from '../game/eggDefs';
import { Emitter } from '../game/events';
import type { Lang } from '../i18n';

const STORAGE_KEY = 'rl-chess-portfolio:v1';

interface Saved {
  unlocked?: MatingPiece[];
  eggs?: string[];
  lang?: Lang;
  sound?: boolean;
}

function read(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

/** Everything that survives a reload. Storage may be blocked, so every access is guarded. */
export class Progress extends Emitter<{ change: undefined }> {
  private readonly unlocked: Set<MatingPiece>;
  private readonly eggs: Set<string>;
  lang: Lang;
  sound: boolean;

  constructor(defaultLang: Lang) {
    super();
    const saved = read();
    this.unlocked = new Set(saved.unlocked ?? []);
    // An egg that has since been renamed or removed must not count towards the total.
    const known = new Set<string>(EGGS.map((egg) => egg.id));
    this.eggs = new Set((saved.eggs ?? []).filter((id) => known.has(id)));
    this.lang = saved.lang === 'en' || saved.lang === 'zh-TW' ? saved.lang : defaultLang;
    this.sound = saved.sound === true;
  }

  isUnlocked(piece: MatingPiece): boolean {
    return this.unlocked.has(piece);
  }

  get unlockedCount(): number {
    return this.unlocked.size;
  }

  /** Returns true when this is a new unlock. */
  unlock(piece: MatingPiece): boolean {
    if (this.unlocked.has(piece)) return false;
    this.unlocked.add(piece);
    this.changed();
    return true;
  }

  hasEgg(id: string): boolean {
    return this.eggs.has(id);
  }

  get eggCount(): number {
    return this.eggs.size;
  }

  /** Returns true when this egg had not been found before. */
  findEgg(id: string): boolean {
    if (this.eggs.has(id)) return false;
    this.eggs.add(id);
    this.changed();
    return true;
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.changed();
  }

  setSound(on: boolean): void {
    this.sound = on;
    this.changed();
  }

  /** Forget unlocks and eggs; language and sound preferences stay. */
  reset(): void {
    this.unlocked.clear();
    this.eggs.clear();
    this.changed();
  }

  private changed(): void {
    try {
      const data: Saved = {
        unlocked: [...this.unlocked],
        eggs: [...this.eggs],
        lang: this.lang,
        sound: this.sound,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* private mode or blocked storage: progress just lasts for this visit */
    }
    this.emit('change', undefined);
  }
}
