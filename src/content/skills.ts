import { h } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';

// Placeholder skills and timeline. The skill names below are the ones this very site is built with;
// replace everything with your own.
const copy = {
  'zh-TW': {
    skillsTitle: '技能',
    groups: [
      { name: '前端', items: ['TypeScript', 'JavaScript', 'CSS', 'Vite'] },
      { name: '3D 與圖形', items: ['Three.js', 'WebGL', 'Shader'] },
      { name: '其他', items: ['Git', 'Testing', 'Design'] },
    ],
    timelineTitle: '經歷',
    timeline: [
      { when: '2024 — 現在', what: '職稱 · 公司或學校', detail: '一句話說明你做了什麼。' },
      { when: '2022 — 2024', what: '職稱 · 公司或學校', detail: '可以放成果或學到的東西。' },
      { when: '2018 — 2022', what: '學歷或第一份工作', detail: '起點也很重要。' },
    ],
    note: '範例內容:請編輯 src/content/skills.ts',
  },
  en: {
    skillsTitle: 'Skills',
    groups: [
      { name: 'Frontend', items: ['TypeScript', 'JavaScript', 'CSS', 'Vite'] },
      { name: '3D & graphics', items: ['Three.js', 'WebGL', 'Shaders'] },
      { name: 'Other', items: ['Git', 'Testing', 'Design'] },
    ],
    timelineTitle: 'Experience',
    timeline: [
      { when: '2024 — now', what: 'Role · Company or school', detail: 'One line on what you did.' },
      { when: '2022 — 2024', what: 'Role · Company or school', detail: 'Results, or what you learned.' },
      { when: '2018 — 2022', what: 'Degree or first job', detail: 'Where it started matters too.' },
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
