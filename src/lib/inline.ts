/**
 * Минимальный inline-markdown для HTML: экранирование спецсимволов + **жирный**.
 * Контент доверенный, но экранирование — гигиена. В Markdown-выводе `**...**`
 * работает нативно, поэтому конвертер нужен только там, где мы вставляем HTML
 * (лендинг, HTML-резюме, OG-карточка).
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Экранирует HTML и превращает `**жирный**` в `<strong>`. */
export function renderInline(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
