/**
 * Минимальный inline-markdown → HTML для текстовых пунктов: только **жирный**.
 * Экранирует HTML-спецсимволы (контент доверенный, но экранирование — гигиена).
 * В Markdown-выводе `**...**` и так работает нативно, поэтому конвертер нужен только для HTML.
 */
export function inlineHtml(s: string): string {
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
