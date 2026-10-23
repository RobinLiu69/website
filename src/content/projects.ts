import { h, icon } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';

interface Project {
  title: string;
  blurb: string;
  tags: string[];
  /** Leave empty for a card without a link. */
  href?: string;
}

// Placeholder objects: things left on the table, untitled and unsigned. Replace them with your own work.
const copy = {
  'zh-TW': {
    intro: '一些放在桌上的東西。',
    projects: [
      { title: '無題 · 燈', blurb: '一件做到一半的東西。在這裡寫它是什麼、為什麼存在。', tags: ['TypeScript', 'WebGL'], href: '#' },
      { title: '無題 · 粉筆', blurb: '另一件。一兩句話就夠了。', tags: ['Three.js', 'Shader'], href: '#' },
      { title: '無題 · 棋', blurb: '沒有連結的東西,只留一段說明。', tags: ['Games'] },
    ] satisfies Project[],
    note: '範例內容:請編輯 src/content/projects.ts',
  },
  en: {
    intro: 'A few things left on the table.',
    projects: [
      { title: 'Untitled · Lamp', blurb: 'Something half finished. Say here what it is and why it exists.', tags: ['TypeScript', 'WebGL'], href: '#' },
      { title: 'Untitled · Chalk', blurb: 'Another one. A sentence or two is plenty.', tags: ['Three.js', 'Shaders'], href: '#' },
      { title: 'Untitled · Chess', blurb: 'Something without a link just gets a few words.', tags: ['Games'] },
    ] satisfies Project[],
    note: 'Placeholder content: edit src/content/projects.ts',
  },
};

const projects: SectionModule = {
  render({ lang }: SectionContext) {
    const c = copy[lang];
    return h(
      'div',
      { class: 'prose' },
      h('p', { text: c.intro }),
      h(
        'div',
        { class: 'cards' },
        ...c.projects.map((p: Project) => {
          const body = [
            h('div', { class: 'card-head' }, h('h4', { text: p.title }), p.href ? icon('external', 16) : null),
            h('p', { text: p.blurb }),
            h('ul', { class: 'tags' }, ...p.tags.map((tag) => h('li', { text: tag }))),
          ];
          return p.href
            ? h('a', { class: 'card', attrs: { href: p.href, target: '_blank', rel: 'noopener noreferrer' } }, ...body)
            : h('div', { class: 'card' }, ...body);
        }),
      ),
      h('p', { class: 'placeholder-note', text: c.note }),
    );
  },
  plain({ lang }: SectionContext) {
    const c = copy[lang];
    return [
      c.intro,
      '',
      ...c.projects.map((p: Project) => `- ${p.title}: ${p.blurb} [${p.tags.join(', ')}]${p.href ? ` ${p.href}` : ''}`),
    ].join('\n');
  },
};

export default projects;
