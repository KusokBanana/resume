/**
 * fetch-job.ts — получение текста вакансии по URL. Пока поддерживается только hh.ru.
 *
 * hh.ru кладёт в HTML страницы вакансии JSON-LD JobPosting (title, hiringOrganization,
 * description) — структурированные данные для поисковиков. Берём их обычным HTTP-запросом:
 * это надёжнее скраппинга вёрстки и не требует OAuth-токена (публичный API поиска hh
 * закрыт с конца 2025, но HTML-страницы вакансий открыты).
 */

export interface FetchedJob {
  title: string;
  company?: string;
  /** Готовый текст вакансии для LLM: заголовок + компания + описание. */
  text: string;
  url: string;
}

/** Аргумент --job выглядит как URL (а не файл/текст)? */
export function isJobUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

const HH_VACANCY_RE = /^https?:\/\/(?:www\.)?hh\.ru\/vacancy\/\d+/i;

/** Грубое HTML→текст: переводы строк по блочным тегам, маркеры списков, базовые сущности. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Достаёт вакансию по URL. Бросает с понятным сообщением, если не смог. */
export async function fetchJobByUrl(url: string): Promise<FetchedJob> {
  if (!HH_VACANCY_RE.test(url.trim())) {
    throw new Error(
      'По URL пока поддерживается только hh.ru (https://hh.ru/vacancy/<id>). ' +
        'Для других площадок передай текст вакансии файлом или строкой.',
    );
  }
  const res = await fetch(url, {
    headers: {
      // Без браузерного UA hh может отдать капчу вместо страницы.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`hh.ru вернул ${res.status} на ${url} — вакансия могла быть скрыта или в архиве.`);
  }
  const html = await res.text();

  const blocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? [];
  for (const block of blocks) {
    const jsonText = block.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch {
      continue; // битый блок — пробуем следующий
    }
    const d = data as {
      '@type'?: string;
      title?: unknown;
      description?: unknown;
      hiringOrganization?: { name?: unknown };
    };
    if (d['@type'] !== 'JobPosting') continue;

    const title = String(d.title ?? '').trim();
    const company = d.hiringOrganization?.name ? String(d.hiringOrganization.name).trim() : undefined;
    const description = htmlToText(String(d.description ?? ''));
    if (!title || !description) break;

    return {
      title,
      company,
      url,
      text: [`Вакансия: ${title}`, company ? `Компания: ${company}` : '', '', description]
        .filter(Boolean)
        .join('\n'),
    };
  }
  throw new Error(
    'Не нашёл JobPosting-разметку на странице hh — возможно, отдана капча или вакансия закрыта. ' +
      'Скопируй текст вакансии вручную.',
  );
}
