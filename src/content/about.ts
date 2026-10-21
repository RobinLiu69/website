import { h } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';
import { profile } from './profile';

// Placeholder copy. Replace the text below with your own.
const copy = {
  'zh-TW': {
    heading: `嗨,我是 ${profile.name}`,
    paragraphs: [
      '這裡是你的自我介紹:你是誰、正在做什麼,以及為什麼喜歡做這件事。',
      '可以寫兩三段就好,讓第一次來的人在一分鐘內認識你。',
    ],
    factsTitle: '快速認識',
    facts: [
      ['所在地', '你的城市'],
      ['目前', '你正在做的事'],
      ['喜歡', '西洋棋、3D、把東西做得好玩'],
    ],
    note: '範例內容:請編輯 src/content/about.ts',
  },
  en: {
    heading: `Hi, I'm ${profile.name}`,
    paragraphs: [
      'This is your introduction: who you are, what you are working on, and why you like doing it.',
      'Two or three short paragraphs are plenty, so a first-time visitor gets to know you in a minute.',
    ],
    factsTitle: 'At a glance',
    facts: [
      ['Based in', 'Your city'],
      ['Right now', 'What you are working on'],
      ['Into', 'Chess, 3D, making things playful'],
    ],
    note: 'Placeholder content: edit src/content/about.ts',
  },
} as const;

const about: SectionModule = {
  render({ lang }: SectionContext) {
    const c = copy[lang];
    return h(
      'div',
      { class: 'prose' },
      h('h3', { class: 'lead', text: c.heading }),
      ...c.paragraphs.map((text) => h('p', { text })),
      h('h4', { class: 'sub', text: c.factsTitle }),
      h(
        'dl',
        { class: 'facts' },
        ...c.facts.flatMap(([term, detail]) => [h('dt', { text: term }), h('dd', { text: detail })]),
      ),
      h('p', { class: 'placeholder-note', text: c.note }),
    );
  },
  plain({ lang }: SectionContext) {
    const c = copy[lang];
    return [c.heading, '', ...c.paragraphs, '', ...c.facts.map(([k, v]) => `${k}: ${v}`)].join('\n');
  },
};

export default about;
