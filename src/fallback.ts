import { profile } from './content/profile';
import { detectLang, getLang, setLang, t } from './i18n';
import { h } from './ui/dom';

/** Shown instead of the board when the browser cannot run WebGL: a name and a way to get in touch. */
export function renderFallback(root: HTMLElement): void {
  setLang(detectLang());
  const { email, github } = profile.links;
  root.replaceChildren(
    h(
      'main',
      { class: 'fallback' },
      h('h1', { text: profile.name }),
      h('p', { class: 'tagline', text: profile.tagline[getLang()] }),
      h('h2', { text: t('fallback.title') }),
      h('p', { text: t('fallback.body') }),
      h(
        'ul',
        {},
        h('li', {}, h('a', { attrs: { href: `mailto:${email}` }, text: email })),
        h('li', {}, h('a', { attrs: { href: github, rel: 'noopener noreferrer' }, text: github.replace('https://', '') })),
      ),
    ),
  );
}
