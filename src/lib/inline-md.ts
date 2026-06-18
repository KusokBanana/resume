/**
 * Минимальный inline-markdown для лендинга: экранирует HTML и
 * превращает **жирный** в <strong>. Достаточно для пунктов опыта и результатов.
 */
export function renderBold(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
