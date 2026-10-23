import { h } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';

// Placeholder traces: the tools in hand and the road behind, without names. The tools below are the ones this
// very site is built with; replace everything with your own.
const copy = {
  'zh-TW': {
    skillsTitle: '手上的工具',
    groups: [
      { name: '手', items: ['TypeScript', 'JavaScript', 'CSS', 'Vite'] },
      { name: '眼', items: ['Three.js', 'WebGL', 'Shader'] },
      { name: '其他', items: ['Git', 'Testing', 'Design'] },
    ],
    timelineTitle: '走過的路',
    timeline: [
      { when: '現在', what: '正在做的事', detail: '一句話,不必寫名字。' },
      { when: '不久之前', what: '做過的事', detail: '留下一點痕跡就好。' },
      { when: '很久以前', what: '開始的地方', detail: '起點也很重要。' },
    ],
    note: '範例內容:請編輯 src/content/skills.ts',
  },
  en: {
    skillsTitle: 'Tools in hand',
    groups: [
      { name: 'Hands', items: ['TypeScript', 'JavaScript', 'CSS', 'Vite'] },
      { name: 'Eyes', items: ['Three.js', 'WebGL', 'Shaders'] },
      { name: 'Other', items: ['Git', 'Testing', 'Design'] },
    ],
    timelineTitle: 'The road behind',
    timeline: [
      { when: 'Now', what: 'What is being made', detail: 'One line. No need for names.' },
      { when: 'Not long ago', what: 'What was made', detail: 'Leave just a little trace.' },
      { when: 'Long ago', what: 'Where it began', detail: 'Where it started matters too.' },
    ],
    note: 'Placeholder content: edit src/content/skills.ts',
  },
};

const skills: SectionModule = {
  render({ lang }: SectionContext) {
    const c = copy[lang];
    return h(
      'div',
      { class: 'prose' },
      h('h4', { class: 'sub', text: c.skillsTitle }),
      ...c.groups.map((g) =>
        h(
          'div',
          { class: 'skill-group' },
          h('span', { class: 'skill-name', text: g.name }),
          h('ul', { class: 'tags' }, ...g.items.map((item) => h('li', { text: item }))),
        ),
      ),
      h('h4', { class: 'sub', text: c.timelineTitle }),
      h(
        'ol',
        { class: 'timeline' },
        ...c.timeline.map((e) =>
          h(
            'li',
            {},
            h('span', { class: 'when', text: e.when }),
            h('strong', { text: e.what }),
            h('span', { class: 'detail', text: e.detail }),
          ),
        ),
      ),
      h('p', { class: 'placeholder-note', text: c.note }),
    );
  },
  plain({ lang }: SectionContext) {
    const c = copy[lang];
    return [
      c.skillsTitle,
      ...c.groups.map((g) => `- ${g.name}: ${g.items.join(', ')}`),
      '',
      c.timelineTitle,
      ...c.timeline.map((e) => `- ${e.when}  ${e.what}  ${e.detail}`),
    ].join('\n');
  },
};

export default skills;
