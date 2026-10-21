import { h, icon } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';
import { profile } from './profile';

// Placeholder links. Replace with your own in src/content/profile.ts.
const copy = {
  'zh-TW': {
    intro: '想聊聊合作、工作機會,或只是想討論一盤棋?寄信給我就好。',
    email: '電子郵件',
    github: 'GitHub',
    copy: '複製',
    copied: '已複製',
    note: '範例內容:請編輯 src/content/profile.ts',
  },
  en: {
    intro: 'Want to talk about a project, a job, or just a game of chess? Drop me a line.',
    email: 'Email',
    github: 'GitHub',
    copy: 'Copy',
    copied: 'Copied',
    note: 'Placeholder content: edit src/content/profile.ts',
  },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const contact: SectionModule = {
  render({ lang }: SectionContext) {
    const c = copy[lang];
    const { email, github } = profile.links;

    const label = h('span', { text: c.copy });
    const button = h(
      'button',
      {
        class: 'mini-btn',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            if (!(await copyText(email))) return;
            label.textContent = c.copied;
            button.classList.add('done');
            window.setTimeout(() => {
              label.textContent = c.copy;
              button.classList.remove('done');
            }, 1600);
          },
        },
      },
      icon('copy', 15),
      label,
    );

    return h(
      'div',
      { class: 'prose' },
      h('p', { text: c.intro }),
      h(
        'ul',
        { class: 'links' },
        h(
          'li',
          {},
          h('span', { class: 'link-label', text: c.email }),
          h('a', { class: 'link-value', attrs: { href: `mailto:${email}` }, text: email }),
          button,
        ),
        h(
          'li',
          {},
          h('span', { class: 'link-label', text: c.github }),
          h('a', {
            class: 'link-value',
            attrs: { href: github, target: '_blank', rel: 'noopener noreferrer' },
            text: github.replace('https://', ''),
          }),
        ),
      ),
      h('p', { class: 'placeholder-note', text: c.note }),
    );
  },
  plain({ lang }: SectionContext) {
    const c = copy[lang];
    return [c.intro, '', `${c.email}: ${profile.links.email}`, `${c.github}: ${profile.links.github}`].join('\n');
  },
};

export default contact;
