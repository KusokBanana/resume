/**
 * Соединяет base (import.meta.env.BASE_URL) с путём, гарантируя ровно один слеш.
 * BASE_URL в Astro может быть как '/resume', так и '/resume/' — этот хелпер
 * нормализует оба случая, чтобы не получалось '/resumehh/ru' или '/resume//hh'.
 */
export function withBase(base: string, path = ''): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.replace(/^\//, '');
  return p ? `${b}/${p}` : `${b}/`;
}
