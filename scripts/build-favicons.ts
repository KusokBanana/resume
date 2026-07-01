/**
 * Генерация растровых фавиконок из public/favicon.svg.
 *
 * Зачем: поисковые роботы (Яндекс, Google) НЕ грузят SVG-фавиконки — им нужен
 * растр (PNG/ICO). SVG оставляем для современных браузеров, а для роботов и
 * легаси кладём PNG разных размеров + favicon.ico (PNG-in-ICO).
 *
 * Рендерим SVG в Chromium через Playwright (надёжно, без нативных зависимостей),
 * затем собираем .ico вручную из 16/32/48 PNG.
 *
 * Запуск: npx tsx scripts/build-favicons.ts  (нужен `npx playwright install chromium`)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const svg = readFileSync(join(pub, 'favicon.svg'), 'utf8');

// Какие PNG генерируем: размер → имя файла.
const PNGS: Record<number, string> = {
  16: 'favicon-16x16.png',
  32: 'favicon-32x32.png',
  48: 'favicon-48x48.png',
  96: 'favicon-96x96.png',
  180: 'apple-touch-icon.png', // iOS home screen
  192: 'icon-192.png', // web manifest / Android
  512: 'icon-512.png',
};
const ICO_SIZES = [16, 32, 48];

async function renderPng(page: import('playwright').Page, size: number): Promise<Buffer> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0}html,body{background:transparent}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: size, height: size });
  const el = await page.$('svg');
  if (!el) throw new Error('svg element not found');
  return el.screenshot({ omitBackground: true, type: 'png' });
}

/** Собирает .ico (PNG-in-ICO) из готовых PNG-буферов. */
function buildIco(images: { size: number; data: Buffer }[]): Buffer {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const entries: Buffer[] = [];
  let offset = 6 + count * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const rendered = new Map<number, Buffer>();
for (const [sizeStr, name] of Object.entries(PNGS)) {
  const size = Number(sizeStr);
  const data = await renderPng(page, size);
  rendered.set(size, data);
  writeFileSync(join(pub, name), data);
  console.log(`✓ ${name} (${size}×${size}, ${data.length} B)`);
}

// Размеры для ICO, которых нет в PNGS, дорисовываем.
const icoImages: { size: number; data: Buffer }[] = [];
for (const size of ICO_SIZES) {
  const data = rendered.get(size) ?? (await renderPng(page, size));
  icoImages.push({ size, data });
}
const ico = buildIco(icoImages);
writeFileSync(join(pub, 'favicon.ico'), ico);
console.log(`✓ favicon.ico (${ICO_SIZES.join('/')}, ${ico.length} B)`);

await browser.close();
