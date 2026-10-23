import { EGGS } from '../game/eggDefs';
import { t } from '../i18n';
import { h, icon } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';
import { profile } from './profile';

const REPO = 'https://github.com/RobinLiu69/website';

const copy = {
  'zh-TW': {
    wall: '你找到的',
    found: '{found} / {total}',
    tip: '有些藏在鍵盤上,有些在棋盤上,有些只是在黑暗裡。',
    siteTitle: '這個地方',
    siteParagraphs: [
      '一盤棋,照真正的規則下,你執白。黑方有個看不見的對手,它不說話,只是回應。',
      '棋盤與棋子是用程式生成的切面模型,再被即時重畫成黑底上的粉筆素描。輪廓、排線、周圍的線,都不是貼圖。沒有載入任何模型檔或圖片。',
      '頁面的內容在被打開之前不會下載。這只是個純前端的小遊戲,不是安全機制,但希望它夠有趣。',
    ],
    source: '看原始碼',
    doorTitle: '如果你走到了這裡',
    door: '那你大概也值得一封信。',
    email: '電子郵件',
    github: 'GitHub',
    copy: '複製',
    copied: '已複製',
  },
  en: {
    wall: 'What you found',
    found: '{found} of {total}',
    tip: 'Some hide on the keyboard, some on the board, some only in the dark.',
    siteTitle: 'This place',
    siteParagraphs: [
      'A game of chess, played by the real rules, with you on White. The black side has an opponent you cannot see. It says nothing; it only answers.',
      'The board and the pieces are faceted models generated in code, redrawn in real time as a chalk drawing on black. The outlines, the hatching and the lines around them are not textures. No model files or images are loaded.',
      'The pages are not downloaded until they have been opened. This is a small front-end game, not a security measure, but I hope it is fun.',
    ],
    source: 'View the source',
    doorTitle: 'If you came this far',
    door: 'then you are probably worth a letter.',
    email: 'Email',
    github: 'GitHub',
    copy: 'Copy',
    copied: 'Copied',
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

const secret: SectionModule = {
  render({ lang, eggs }: SectionContext) {
    const c = copy[lang];
    const percent = Math.round((eggs.found / eggs.total) * 100);
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
      h('h4', { class: 'sub', text: c.wall }),
      h('p', { class: 'wall-count', text: c.found.replace('{found}', String(eggs.found)).replace('{total}', String(eggs.total)) }),
      h('div', { class: 'meter', attrs: { role: 'img', 'aria-label': `${percent}%` } }, h('span', { attrs: { style: `width:${percent}%` } })),
      h(
        'ul',
        { class: 'wall' },
        ...EGGS.map((egg) => {
          const found = eggs.has(egg.id);
          return h(
            'li',
            { class: found ? 'egg is-found' : 'egg' },
            h('span', { class: 'egg-icon' }, icon(found ? 'star' : 'egg', 18)),
            h('span', { class: 'egg-name', text: found ? t(`egg.${egg.id}.name`) : '???' }),
            h('span', {
              class: 'egg-desc',
              text: found ? t(`egg.${egg.id}.desc`) : t(`category.${egg.category}`),
            }),
          );
        }),
      ),
      h('p', { class: 'muted', text: c.tip }),
      h('h4', { class: 'sub', text: c.siteTitle }),
      ...c.siteParagraphs.map((text) => h('p', { text })),
      h('a', { class: 'pill-link', attrs: { href: REPO, target: '_blank', rel: 'noopener noreferrer' } }, c.source, icon('external', 15)),
      h('h4', { class: 'sub', text: c.doorTitle }),
      h('p', { class: 'fragment', text: c.door }),
      h(
        'ul',
        { class: 'links' },
        h('li', {}, h('span', { class: 'link-label', text: c.email }), h('a', { class: 'link-value', attrs: { href: `mailto:${email}` }, text: email }), button),
        h(
          'li',
          {},
          h('span', { class: 'link-label', text: c.github }),
          h('a', { class: 'link-value', attrs: { href: github, target: '_blank', rel: 'noopener noreferrer' }, text: github.replace('https://', '') }),
        ),
      ),
    );
  },
  plain({ lang, eggs }: SectionContext) {
    const c = copy[lang];
    return [
      `${c.wall}: ${c.found.replace('{found}', String(eggs.found)).replace('{total}', String(eggs.total))}`,
      '',
      ...EGGS.map((egg) => (eggs.has(egg.id) ? `[x] ${t(`egg.${egg.id}.name`)}` : '[ ] ???')),
      '',
      c.siteTitle,
      ...c.siteParagraphs,
      REPO,
      '',
      `${c.doorTitle} — ${c.door}`,
      `${c.email}: ${profile.links.email}`,
      `${c.github}: ${profile.links.github}`,
    ].join('\n');
  },
};

export default secret;
