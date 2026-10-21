import type { Lang } from '../i18n';
import type { SectionId } from './sections';

export interface SectionContext {
  lang: Lang;
  unlockedCount: number;
  eggs: { found: number; total: number; has: (id: string) => boolean };
}

export interface SectionModule {
  /** The panel body. */
  render(ctx: SectionContext): HTMLElement;
  /** The same content as plain text, for the terminal's `cat`. */
  plain(ctx: SectionContext): string;
}

/**
 * Each section is its own chunk, fetched the first time it is opened, so a
 * locked section's content is not part of the initial download.
 */
const loaders: Record<SectionId, () => Promise<{ default: SectionModule }>> = {
  about: () => import('./about'),
  projects: () => import('./projects'),
  skills: () => import('./skills'),
  contact: () => import('./contact'),
  secret: () => import('./secret'),
};

export async function loadSection(id: SectionId): Promise<SectionModule> {
  return (await loaders[id]()).default;
}
