// @ts-check
import { defineConfig } from 'astro/config';

// Для GitHub Pages.
// Если репозиторий называется `resume` и публикуется на <user>.github.io/resume —
// оставь base: '/resume'. Если используешь кастомный домен или репозиторий
// <user>.github.io — поставь base: '/'.
// Замени `sdemochkin` на свой GitHub username, либо задай через env SITE/BASE.
const SITE = process.env.SITE ?? 'https://sdemochkin.github.io';
const BASE = process.env.BASE ?? '/resume';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
});
