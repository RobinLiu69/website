import { h } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';

// Placeholder fragments: lines left lying around, not an introduction. Replace them with your own.
const copy = {
  'zh-TW': {
    lines: [
      '有些東西,要在暗處才看得見。',
      '它們一直站在那裡。只是你沒有帶光。',
      '先看,再走。',
      '這裡沒有名字。名字,是最後才需要的東西。',
      '每一顆子,都有一個只屬於它的格子。',
    ],
    note: '範例內容:請編輯 src/content/about.ts',
  },
  en: {
    lines: [
      'Some things can only be seen in the dark.',
      'They have always stood there. You just did not bring a light.',
      'Look first. Then move.',
      'There is no name here. A name is the last thing anyone needs.',
      'Every piece has one square that is only its own.',
    ],
    note: 'Placeholder content: edit src/content/about.ts',
  },
} as const;

const about: SectionModule = {
  render({ lang }: SectionContext) {
    const c = copy[lang];
    return h(
      'div',
      { class: 'prose fragments' },
      ...c.lines.map((text, i) => h('p', { class: 'fragment', text, attrs: { style: `--i:${i}` } })),
      h('p', { class: 'placeholder-note', text: c.note }),
    );
  },
  plain({ lang }: SectionContext) {
    return copy[lang].lines.join('\n\n');
  },
};

export default about;
