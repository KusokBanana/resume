/**
 * Отслеживание целей: любой клик по элементу с data-goal шлёт цель в
 * Яндекс.Метрику и событие в GA4. Оба аналитика-объекта необязательны (могут не
 * загрузиться из-за ?nostats=1 / блокировщиков). Бандлится Astro; YM_ID берём
 * импортом из общего модуля, поэтому define:vars и инлайн больше не нужны.
 */
import { YANDEX_COUNTER_ID } from '../lib/analytics';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    ym?: (id: number, action: string, goal: string) => void;
  }
}

document.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement | null;
  const el = target?.closest?.('[data-goal]');
  const goal = el?.getAttribute('data-goal');
  if (!goal) return;
  try {
    window.gtag?.('event', goal);
  } catch {
    /* аналитика необязательна */
  }
  try {
    window.ym?.(YANDEX_COUNTER_ID, 'reachGoal', goal);
  } catch {
    /* аналитика необязательна */
  }
});
