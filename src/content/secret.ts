import { EGGS } from '../game/eggDefs';
import { t } from '../i18n';
import { h, icon } from '../ui/dom';
import type { SectionContext, SectionModule } from './loaders';

const REPO = 'https://github.com/RobinLiu69/website';

const copy = {
  'zh-TW': {
    wall: '成就牆',
    found: '已找到 {found} / {total} 個彩蛋',
    tip: '提示:有些彩蛋藏在鍵盤上,有些在棋盤上,有些只是在網站上亂點。',
    siteTitle: '關於這個網站',
    siteParagraphs: [
      '這個網站是用 Vite、TypeScript 和 Three.js 做的。棋盤與棋子是用程式生成的切面模型,再被即時重畫成黑底上的粉筆素描:輪廓線、排線和周圍的輔助線都不是貼圖。沒有載入任何模型檔或圖片。',
      '棋子可以放到任何格子,網站不檢查走法,只看盤面:有沒有一方的王被將軍、而且無路可逃?造成將軍的是哪一種棋子?兵、馬、象、車、后各對應一頁。左下角的「?」會給你一道謎題。',
      '區塊內容在解鎖之後才會載入。這是個純前端的小遊戲,不是安全機制,但希望它夠有趣。',
    ],
    source: '看原始碼',
  },
  en: {
    wall: 'Achievements',
    found: 'Found {found} of {total} easter eggs',
    tip: 'Hint: some eggs hide on the keyboard, some on the board, some just in clicking around the site.',
    siteTitle: 'About this site',
    siteParagraphs: [
      'This site is built with Vite, TypeScript and Three.js. The board and pieces are faceted models generated in code and redrawn in real time as a chalk drawing on black: the outlines, hatching and the construction lines around them are not textures. No model files or images are loaded.',
      'Pieces can go on any square. The site does not check moves, it only looks at the board: is a king in check with nowhere to run, and which piece is giving the check? Pawn, knight, bishop, rook and queen each open one page. The ? in the corner will give you a riddle.',
      'Section content is only fetched once it is unlocked. This is a small front-end game, not a security measure, but I hope it is fun.',
    ],
    source: 'View the source',
  },
};

const secret: SectionModule = {
  render({ lang, eggs }: SectionContext) {
    const c = copy[lang];
    const percent = Math.round((eggs.found / eggs.total) * 100);
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
    ].join('\n');
  },
};

export default secret;
