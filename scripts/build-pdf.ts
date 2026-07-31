import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve as resolvePath, sep } from 'node:path';
import { chromium } from 'playwright';
import { loadTargets, ROOT } from '../src/lib/load';
import { variantSlug } from '../src/lib/slug';
import { MIME } from './lib/mime';

const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'generated');
const BASE = process.env.BASE ?? '/';
const PORT = 4399;

/** Минимальный статик-сервер dist с учётом base-префикса (для корректных ссылок на CSS). */
function startServer(): Promise<ReturnType<typeof createServer>> {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (BASE !== '/' && p.startsWith(BASE)) p = p.slice(BASE.length);
      if (p === '' || p.endsWith('/')) p += 'index.html';
      const file = join(DIST, p);
      // Обход каталога: `new URL()` нормализует только незакодированные `..`, а `%2f`
      // разделителем пути не считается — `/..%2f.env` декодируется уже ПОСЛЕ нормализации
      // и уводит за пределы dist. Сверяем итоговый путь после resolve.
      const root = resolvePath(DIST);
      if (!resolvePath(file).startsWith(root + sep)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      if (!existsSync(file)) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      const body = await readFile(file);
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end('error');
    }
  });
  // Только петля: сервер живёт секунды, но в чужой сети (кафе/офис) открытый порт
  // на всех интерфейсах = анонимный доступ к файлам проекта.
  return new Promise((resolve) =>
    server.listen(PORT, '127.0.0.1', () => resolve(server)),
  );
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('✗ Сначала выполни `npm run build` — нет dist/index.html');
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });

  const targets = loadTargets();
  const jobs = targets
    .filter((t) => t.formats.includes('pdf'))
    .flatMap((t) => t.languages.map((lang) => ({ t, lang })));

  if (jobs.length === 0) {
    console.log('Нет вариантов с форматом pdf.');
    return;
  }

  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const baseUrl = `http://localhost:${PORT}${BASE === '/' ? '' : BASE}`;

  let n = 0;
  for (const { t, lang } of jobs) {
    const slug = variantSlug(t.id, lang);
    // ?nostats=1 — глушим Яндекс.Метрику, чтобы печать PDF не создавала фейковых заходов.
    await page.goto(`${baseUrl}/exports/${t.id}/${lang}/?nostats=1`, {
      waitUntil: 'networkidle',
    });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: join(OUT, `${slug}.pdf`),
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    n++;
    console.log(`✓ ${slug}.pdf`);
  }

  await browser.close();
  server.close();
  console.log(`\nСгенерировано PDF: ${n}`);
}

main();
