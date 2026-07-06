/** Хелперы сборки текстовых документов из массива строк-блоков. */

/** Схлопывает 3+ переводов строки до пустой строки-разделителя. */
const squeeze = (s: string) => s.replace(/\n{3,}/g, '\n\n');

/** Документ целиком: строки → текст, схлопнутые пустые, trim, финальный `\n`. */
export function joinBlocks(lines: string[]): string {
  return squeeze(lines.join('\n')).trim() + '\n';
}

/** Встраиваемый блок: то же, но без завершающего перевода строки. */
export function joinInline(lines: string[]): string {
  return squeeze(lines.join('\n')).trim();
}
