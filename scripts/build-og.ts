import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { loadContent, ROOT } from '../src/lib/load';

/**
 * Генерация OG-картинки для соцсетей (1200×630) → dist/og.png.
 * Самодостаточно: Playwright рендерит HTML-строку (данные из content), без dev-сервера.
 * Запускать ПОСЛЕ `npm run build` (пишем в dist/) и с установленным Chromium.
 */

const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'og.png');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Портрет как data-URI (чтобы HTML был самодостаточным). null, если файла нет. */
function photoDataUri(rel?: string): string | null {
  if (!rel) return null;
  const p = join(ROOT, 'public', rel);
  if (!existsSync(p)) return null;
  const mime = MIME[extname(p).toLowerCase()] ?? 'image/jpeg';
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(): string {
  const content = loadContent();
  const { profile } = content;
  const name = profile.name.ru;
  const title = profile.title.ru;
  const stats = [...content.stats.items]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
  const photo = photoDataUri(profile.photo);

  const statCells = stats
    .map(
      (s) => `
        <div class="stat">
          <div class="val">${esc(s.value.ru)}</div>
          <div class="lbl">${esc(s.label.ru)}</div>
        </div>`,
    )
    .join('');

  const portrait = photo
    ? `<div class="portrait"><img src="${photo}" alt="" /></div>`
    : '';

  return `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    display: flex; align-items: center; gap: 56px;
    padding: 72px 80px;
    font-family: -apple-system, 'Segoe UI', Roboto, 'DejaVu Sans', Helvetica, Arial, sans-serif;
    color: #ecedf2;
    background:
      radial-gradient(60% 60% at 15% 0%, rgba(59,130,246,0.28), transparent 70%),
      radial-gradient(60% 60% at 100% 10%, rgba(167,139,250,0.22), transparent 70%),
      linear-gradient(180deg, #0e0e16, #08080c 60%);
  }
  .main { flex: 1; min-width: 0; }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 12px;
    font-size: 22px; font-weight: 600; letter-spacing: 0.04em; color: #6ea8fe;
    margin-bottom: 22px;
  }
  .eyebrow::before {
    content: ''; width: 12px; height: 12px; border-radius: 50%;
    background: #6ea8fe; box-shadow: 0 0 18px #6ea8fe;
  }
  h1 {
    font-size: 68px; line-height: 1.02; letter-spacing: -0.03em; font-weight: 800;
    background: linear-gradient(120deg, #fff 30%, #6ea8fe 78%, #a78bfa);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .title { margin-top: 18px; font-size: 30px; font-weight: 600; color: #ecedf2; }
  .stats { display: flex; gap: 40px; margin-top: 44px; }
  .stat .val {
    font-size: 52px; font-weight: 800; line-height: 1; letter-spacing: -0.02em;
    background: linear-gradient(120deg, #fff 20%, #6ea8fe 70%, #a78bfa);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .stat .lbl { margin-top: 10px; font-size: 19px; color: #9a9bab; max-width: 15ch; }
  .portrait {
    flex: none; width: 300px; height: 300px; border-radius: 32px; padding: 4px;
    background: linear-gradient(135deg, #3b82f6, #a78bfa);
    box-shadow: 0 24px 70px rgba(59,130,246,0.35);
  }
  .portrait img { width: 100%; height: 100%; object-fit: cover; border-radius: 28px; display: block; }
</style>
</head>
<body>
  <div class="main">
    <div class="eyebrow">Открыт к предложениям</div>
    <h1>${esc(name)}</h1>
    <div class="title">${esc(title)}</div>
    <div class="stats">${statCells}</div>
  </div>
  ${portrait}
</body>
</html>`;
}

async function main() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(buildHtml(), { waitUntil: 'networkidle' });
  await page.screenshot({ path: OUT, type: 'png' });
  await browser.close();
  console.log('✓ og.png (1200×630)');
}

main();
