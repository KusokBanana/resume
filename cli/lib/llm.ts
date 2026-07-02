/**
 * Общий слой работы с OpenAI для CLI-скриптов (tailor / cover-letter / find-jobs).
 * Responses API + Structured Outputs по zod-схеме. Ключ берётся из .env (OPENAI_API_KEY).
 *
 * ВАЖНО: это ключ OpenAI API (platform.openai.com), а НЕ подписка ChatGPT — раздельные
 * продукты. Тарификация по токенам. Для обычной сборки сайта ключ не нужен.
 */
import type { z } from 'zod';

// Грузим .env, если он есть (Node ≥20.12 — нативно, без зависимостей).
try {
  process.loadEnvFile();
} catch {
  /* .env отсутствует — это норма для обычной сборки */
}

/**
 * Модель OpenAI по умолчанию. Названия моделей быстро меняются — переопредели
 * через OPENAI_MODEL в .env, не трогая код. Нужна модель с поддержкой
 * Structured Outputs (GPT-4o и новее; для новых проектов — серия GPT-5).
 */
export const DEFAULT_MODEL = 'gpt-5.5';

/** Имя активной модели (env OPENAI_MODEL переопределяет дефолт). */
export function modelName(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
}

/** Задан ли ключ OpenAI API. */
export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Вызов модели со строгим JSON-выводом по zod-схеме. Возвращает провалидированный объект.
 * Бросает при refusal/пустом ответе. Динамический import, чтобы скрипты без LLM-шага
 * работали даже без установленного пакета `openai`.
 */
export async function callStructured<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  name: string,
): Promise<T> {
  const { default: OpenAI } = await import('openai');
  const { zodTextFormat } = await import('openai/helpers/zod');
  const client = new OpenAI();
  const model = modelName();

  const response = await client.responses.parse({
    model,
    instructions: system,
    input: user,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    text: { format: zodTextFormat(schema as any, name) },
  });

  const parsed = response.output_parsed as T | null;
  if (!parsed) throw new Error(`Пустой ответ модели (${model}); возможен refusal.`);
  return parsed;
}
