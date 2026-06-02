import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://jointime.alex.gitlab.io',
  base: '/wedding',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [tailwind()],
});
