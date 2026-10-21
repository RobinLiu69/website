import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The deploy workflow sets these (e.g. BASE_PATH "/website/", SITE_URL "https://you.github.io/website/").
// Locally and on a custom domain's root, BASE_PATH stays "/".
const siteUrl = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/*$/, '/') : '';

/**
 * Link-preview images need an absolute URL, which is only known at deploy time.
 * Without SITE_URL the placeholder in index.html is simply removed.
 */
const socialImage = (): Plugin => ({
  name: 'social-image',
  transformIndexHtml(html) {
    const tags = siteUrl
      ? [
          `<meta property="og:url" content="${siteUrl}" />`,
          `<meta property="og:image" content="${siteUrl}og.png" />`,
          '<meta property="og:image:width" content="1200" />',
          '<meta property="og:image:height" content="630" />',
          '<meta name="twitter:card" content="summary_large_image" />',
          `<meta name="twitter:image" content="${siteUrl}og.png" />`,
        ].join('\n    ')
      : '';
    return html.replace('<!--social-image-->', tags);
  },
});

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [socialImage()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
