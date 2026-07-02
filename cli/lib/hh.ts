/**
 * Минимальный клиент hh.ru API для поиска вакансий.
 *
 * Поиск вакансий публичен и не требует авторизации, но hh ОБЯЗАТЕЛЬНО требует
 * заголовок User-Agent в формате `AppName/Version (contact-email)`, иначе вернёт 403.
 * Док: https://github.com/hhru/api/blob/master/docs/vacancies.md, https://dev.hh.ru/
 */

const API = 'https://api.hh.ru';

/** Краткая карточка вакансии из поисковой выдачи (без полного описания). */
export interface VacancyBrief {
  id: string;
  title: string;
  company: string;
  url: string; // ссылка на вакансию для человека (alternate_url)
  area?: string;
  salary?: string;
  /** Текст для дешёвого предфильтра: name + snippet (requirement/responsibility). */
  snippet: string;
}

/** Полная вакансия с описанием (для LLM-ранжирования top-N). */
export interface VacancyFull extends VacancyBrief {
  description: string; // очищенный от HTML текст
}

export interface SearchParams {
  text: string;
  area?: string; // id региона: 1 = Москва, 2 = СПб
  perPage?: number; // ≤ 100
  orderBy?: 'relevance' | 'publication_time' | 'salary_desc' | 'salary_asc';
}

function userAgent(contactEmail?: string): string {
  return `resume-as-code/1.0 (${contactEmail ?? 'noreply@example.com'})`;
}

/** Маркерный класс, чтобы вызывающий код мог отличить ошибку hh от прочих. */
export class HhError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HhError';
  }
}

async function get(path: string, contactEmail?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    'User-Agent': userAgent(contactEmail),
    Accept: 'application/json',
  };
  // Необязательный OAuth-токен (см. https://dev.hh.ru/). С 2024 г. публичный поиск
  // /vacancies для части клиентов закрыт и без токена отвечает 403 forbidden.
  const token = process.env.HH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HhError(
      res.status,
      `hh.ru API ${res.status} ${res.statusText} на ${path}${body ? ` — ${body.slice(0, 300)}` : ''}`,
    );
  }
  return res.json();
}

function fmtSalary(s: { from?: number; to?: number; currency?: string } | null): string | undefined {
  if (!s) return undefined;
  const cur = s.currency ?? '';
  if (s.from && s.to) return `${s.from}–${s.to} ${cur}`;
  if (s.from) return `от ${s.from} ${cur}`;
  if (s.to) return `до ${s.to} ${cur}`;
  return undefined;
}

/** Поиск вакансий. Возвращает краткие карточки (без полного описания). */
export async function searchVacancies(
  params: SearchParams,
  contactEmail?: string,
): Promise<VacancyBrief[]> {
  const q = new URLSearchParams({
    text: params.text,
    per_page: String(params.perPage ?? 50),
    order_by: params.orderBy ?? 'relevance',
  });
  if (params.area) q.set('area', params.area);

  const data = (await get(`/vacancies?${q.toString()}`, contactEmail)) as {
    items?: Array<{
      id: string;
      name: string;
      alternate_url: string;
      employer?: { name?: string };
      area?: { name?: string };
      salary?: { from?: number; to?: number; currency?: string } | null;
      snippet?: { requirement?: string | null; responsibility?: string | null };
    }>;
  };

  return (data.items ?? []).map((v) => ({
    id: v.id,
    title: v.name,
    company: v.employer?.name ?? '—',
    url: v.alternate_url,
    area: v.area?.name,
    salary: fmtSalary(v.salary ?? null),
    snippet: [v.name, v.snippet?.requirement ?? '', v.snippet?.responsibility ?? '']
      .filter(Boolean)
      .join('. '),
  }));
}

/** Грубое снятие HTML-тегов и декодирование частых сущностей. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|li|div|br|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Полная вакансия с очищенным описанием (тянем только для отобранных top-N). */
export async function fetchVacancy(brief: VacancyBrief, contactEmail?: string): Promise<VacancyFull> {
  const data = (await get(`/vacancies/${brief.id}`, contactEmail)) as { description?: string };
  return { ...brief, description: stripHtml(data.description ?? brief.snippet) };
}
