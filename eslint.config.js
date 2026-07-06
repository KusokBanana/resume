// Плоский конфиг ESLint (flat config). Линтим только код проекта: src/scripts/test.
// Форматирование остаётся за Prettier — eslint-config-prettier гасит стилевые правила.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.astro/', 'src/env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    // Код собирается/выполняется в Node (сборка, скрипты) и в браузере (клиентские
    // скрипты). Даём оба набора глобалей, чтобы no-undef не шумел.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Клиентский landing.ts — «ванильный» DOM-скрипт.
    files: ['src/scripts/**/*.ts'],
    rules: { 'no-var': 'off', '@typescript-eslint/no-unused-vars': 'off' },
  },
  {
    // Инлайн-<script> в .astro (вендорные сниппеты Метрики/GA, bootstrap языка) —
    // намеренно ES5-стиль (var/arguments/пустой catch/comma-выражения). Гасим
    // стилевые правила для них; фронтматтер это не затрагивает (он на const/let).
    files: ['**/*.astro', '**/*.astro/*.js', '**/*.astro/*.ts'],
    rules: {
      'no-var': 'off',
      'no-empty': 'off',
      'prefer-rest-params': 'off',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  prettier,
);
