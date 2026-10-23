import { h, icon } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';
import { profile } from './profile';

interface Road {
  label: string;
  /** Leave as '#' for a road that goes nowhere yet. */
  href: string;
}

// Placeholder roads: other places where something lives. The labels say what, never who. Replace them with your own.
const copy = {
  'zh-TW': {
    intro: '別的地方,也放著一些東西。',
    roads: [
      { label: '程式', href: profile.links.github },
      { label: '文字', href: '#' },
      { label: '照片', href: '#' },
    ] satisfies Road[],
    last: '最後一顆,看得見前面四顆。',
    note: '範例內容:請編輯 src/content/contact.ts',
  },
  en: {
    intro: 'Other places hold a few things too.',
    roads: [
      { label: 'Code', href: profile.links.github },
      { label: 'Writing', href: '#' },
      { label: 'Photographs', href: '#' },
    ] satisfies Road[],
    last: 'The last one can see the four before it.',
    note: 'Placeholder content: edit src/content/contact.ts',
  },
};

const contact: SectionModule = {
  render({ lang }: SectionContext) {
    const c = copy[lang];
    return h(
      'div',
      { class: 'prose' },
      h('p', { text: c.intro }),
      h(
        'ul',
        { class: 'links' },
        ...c.roads.map((road: Road) =>
          h(
            'li',
            {},
            h('span', { class: 'link-label', text: road.label }),
            road.href === '#'
              ? h('span', { class: 'link-value muted', text: '·  ·  ·' })
              : h('a', {
                  class: 'link-value',
                  attrs: { href: road.href, target: '_blank', rel: 'noopener noreferrer' },
                  text: road.href.replace('https://', ''),
                }),
            road.href === '#' ? null : icon('external', 15),
          ),
        ),
      ),
      h('p', { class: 'fragment closing', text: c.last }),
      h('p', { class: 'placeholder-note', text: c.note }),
    );
  },
  plain({ lang }: SectionContext) {
    const c = copy[lang];
    return [c.intro, '', ...c.roads.map((road: Road) => `${road.label}: ${road.href === '#' ? '-' : road.href}`), '', c.last].join('\n');
  },
};

export default contact;
