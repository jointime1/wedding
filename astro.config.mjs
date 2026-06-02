import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://wedding-a38614.gitlab.io',
  base: '/',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [tailwind()],
});
