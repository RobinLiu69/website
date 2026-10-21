import type { Lang } from '../i18n';

/**
 * The bits of you that are always visible: the header and the no-WebGL fallback.
 * Everything else lives in the section files next to this one (about.ts, projects.ts, ...).
 * All of it is placeholder text: replace it with your own.
 */
export const profile = {
  name: 'Robin Liu',
  tagline: {
    'zh-TW': '開發者 · 西洋棋愛好者',
    en: 'Developer · chess enthusiast',
  } satisfies Record<Lang, string>,
  links: {
    github: 'https://github.com/RobinLiu69',
    email: 'hello@example.com',
  },
};
