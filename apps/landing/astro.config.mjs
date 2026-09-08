// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Public site URL — used for canonical/sitemap. Override via SITE env in CI.
const SITE = process.env.SITE_URL || 'https://www.magic-resume.cn';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  integrations: [react()],
  i18n: {
    locales: ['en', 'zh'],
    defaultLocale: 'en',
    routing: {
      // Both /en and /zh are explicit; root is redirected below.
      prefixDefaultLocale: true,
    },
  },
  // The root redirect lives in vercel.json so production can negotiate the
  // visitor's Accept-Language header. A second redirect here would defeat it.
  vite: {
    plugins: [tailwindcss()],
  },
});
