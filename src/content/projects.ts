import { h, icon } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';

interface Project {
  title: string;
  blurb: string;
  tags: string[];
  /** Leave empty for a card without a link. */
  href?: string;
}

// Placeholder projects. Replace with your own work.
const copy = {
  'zh-TW': {
    intro: '一些我做過的東西。點開卡片看更多。',
    projects: [
      { title: '專案名稱 A', blurb: '一兩句話說明這個專案解決了什麼問題、你負責什麼。', tags: ['TypeScript', 'WebGL'], href: '#' },
      { title: '專案名稱 B', blurb: '可以放成果、數字、或是你最得意的細節。', tags: ['React', 'Design'], href: '#' },
      { title: '專案名稱 C', blurb: '沒有連結的專案也可以只放一段說明。', tags: ['Node.js'] },
      { title: '專案名稱 D', blurb: '個人實驗、遊戲、工具,什麼都可以。', tags: ['Three.js', 'Games'], href: '#' },
    ] satisfies Project[],
    note: '範例內容:請編輯 src/content/projects.ts',
  },
  en: {
    intro: 'A few things I have built. Open a card for more.',
    projects: [
      { title: 'Project A', blurb: 'One or two sentences on the problem it solves and what you did.', tags: ['TypeScript', 'WebGL'], href: '#' },
      { title: 'Project B', blurb: 'Results, numbers, or the detail you are proudest of.', tags: ['React', 'Design'], href: '#' },
      { title: 'Project C', blurb: 'A project without a link can just have a description.', tags: ['Node.js'] },
      { title: 'Project D', blurb: 'Side experiments, games, tools: anything goes.', tags: ['Three.js', 'Games'], href: '#' },
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
