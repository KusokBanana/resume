// @ts-check
import { defineConfig } from 'astro/config';

// Для GitHub Pages на кастомном домене kusokbanana.ru — сайт в корне (base '/').
// Если форкаешь и публикуешь на <user>.github.io/<repo> — задай env BASE='/<repo>'
// и SITE='https://<user>.github.io' (или поставь свой домен ниже).
const SITE = process.env.SITE ?? 'https://kusokbanana.ru';
const BASE = process.env.BASE ?? '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
});
