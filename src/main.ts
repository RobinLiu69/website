import './styles.css';
import { App } from './app';
import { renderFallback } from './fallback';
import { WebGLUnavailableError } from './three/stage';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app is missing from index.html');

async function main(host: HTMLElement): Promise<void> {
  try {
    const app = new App(host);
    // A handle for tests and the browser console; only present in dev and QA builds.
    if (import.meta.env.DEV || import.meta.env['VITE_QA'] === '1') Object.assign(window, { __app: app.debug });
    await app.start();
  } catch (error) {
    host.replaceChildren();
    document.querySelector('#boot')?.classList.add('done');
    if (error instanceof WebGLUnavailableError) {
      renderFallback(host);
      return;
    }
    throw error;
  }
}

void main(root);
