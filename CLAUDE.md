# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Язык: вся документация в этом репозитории ведётся на русском; на английском — только сообщения коммитов.

## Что это

«Резюме как код»: единый структурированный двуязычный (ru/en) источник истины в YAML, из которого собирается множество вариантов резюме под разные системы (hh, LinkedIn, Habr Career), форматы (HTML, PDF, Markdown, JSON Resume) и аудитории (HR-человек vs ATS/автоотбор). Статический сайт на GitHub Pages. Стек: Astro + TypeScript, Zod, Playwright.

## Команды

```bash
npm run dev          # dev-сервер Astro (лендинг + все варианты, ru/en)
npm run validate     # загрузка+валидация всего content и targets через Zod, сборка каждого варианта — ближайший аналог тестов
npm run build        # astro build → dist/ (только HTML). ВНИМАНИЕ: чистит dist/, включая dist/generated/
npm run build:md     # рендер Markdown → dist/generated/
npm run build:json   # рендер JSON Resume → dist/generated/
npm run build:pdf    # Playwright печатает собранный HTML → dist/generated/*.pdf
npm run build:all    # build + md + json + pdf (правильный порядок)
npm run preview      # отдаёт dist/ с base /resume (http://localhost:4321/resume/)
npm run tailor -- --job <файл|текст> --lang ru --system general --slug acme   # подбор под вакансию (LLM/эвристика)
```

Фреймворка юнит-тестов **нет**. `npm run validate` — это шлюз проверки: запускай после любого изменения content или схемы; при ошибке Zod указывает точный файл и поле.

Важен порядок: `astro build` сначала чистит `dist/`, поэтому артефакты `generated/` (md/json/pdf) **должны создаваться после** `build`. Всегда используй `build:all`, либо `build` и затем генераторы — никогда `build` в одиночку, если нужны скачиваемые файлы. Для `build:pdf` нужен Chromium: `npx playwright install chromium`.

## Архитектура

Три слоя, данные полностью отделены от представления:

1. **`content/`** — источник истины (двуязычный YAML). По файлу на сущность: `profile`, `summary` (варианты с тегами аудитории), `achievements`, `experience/*.yaml` (по файлу на место работы), `skills`, `languages`, `education`. Каждый блок несёт `tags` (`audience` / `systems` / `domains`), большинство — `priority`.
2. **`targets/*.yaml`** — декларативные профили сборки: `languages[]`, `system`, `audience`, `formats[]`, `layout` (`rich`|`ats`) и `select` (включение/исключение по тегам или id). Каждый target даёт по варианту на язык.
3. **`src/`** — движок + сайт Astro. Поток: `load.ts` (чтение+валидация) → `compose.ts` (фильтр/сортировка/i18n → плоский `ResumeDocument`) → рендереры.

### Внутренности движка (прочитай перед изменением логики)

- **[src/schema/index.ts](src/schema/index.ts)** — Zod-схемы + интерфейс `ResumeDocument` (единая форма, которую потребляют все рендереры). `Localized = {ru, en}`. Элементы навыков и пункты опыта полиморфны/сгруппированы — см. `SkillItem`, `HighlightGroup`.
- **[src/lib/compose.ts](src/lib/compose.ts)** — логика отбора. Блок включается, если: его `systems` пуст или содержит систему target'а; его `audience` пуст или содержит аудиторию target'а; и он проходит `select.includeTags/excludeTags/includeIds/excludeIds`. **Пункты (highlights) фильтруются попунктно** по тому же правилу `isRelevant` — так один блок опыта даёт полный список для HR и сжатый для ATS. **Опыт сортируется по дате начала по убыванию** (`byStartDesc`); остальные секции — по `priority`.
- Все рендереры принимают `ResumeDocument`: **[Resume.astro](src/components/Resume.astro)** (HTML; `data-layout` переключает rich/ATS), **[render-md.ts](src/lib/render-md.ts)**, **[export-jsonresume.ts](src/lib/export-jsonresume.ts)** (схема jsonresume.org). PDF — это Playwright, печатающий уже собранные HTML-страницы, которые отдаёт крошечный встроенный статик-сервер ([scripts/build-pdf.ts](scripts/build-pdf.ts)).

### Конвенции и подводные камни

- **Импорты только относительные, без алиаса `@/`** — tsx-скрипты не резолвят `paths` из tsconfig, поэтому `@/` сломает CLI-скрипты. Новые импорты держи относительными.
- **Base-путь GitHub Pages**: ссылки строй через `withBase(base, path)` ([src/lib/url.ts](src/lib/url.ts)). Здесь `import.meta.env.BASE_URL` равен `/resume` *без* завершающего слеша, поэтому наивная конкатенация `${base}${path}` даёт `/resumehh/ru`. Никогда не склеивай base вручную.
- **YAML**: любой скаляр с `": "` (двоеточие-пробел) нужно закавычивать, иначе парсер примет его за вложенный mapping. Особенно бьёт по длинным русским текстам пунктов.
- **CI переопределяет base/site**: дефолты в [astro.config.mjs](astro.config.mjs) (`/resume`, `kusokbanana.github.io`) в CI заменяются выводом `actions/configure-pages` через env `SITE`/`BASE` в [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Не хардкодь задеплоенный URL.

## Добавление контента

- **Новое место работы**: создай `content/experience/NN-name.yaml` со *следующим* номером (новейшее = наибольший номер; порядок на странице — по дате, не по имени файла и не по priority). Заполни двуязычные поля, `start`/`end`, `tags`. Запусти `npm run validate`.
- **Новый target/площадка**: добавь `targets/<name>.yaml` (`languages`, `system`, `audience`, `layout`, `formats`, `select`). Он автоматически появится на лендинге и в `getStaticPaths`.

## LLM-подбор под вакансию

[scripts/tailor.ts](scripts/tailor.ts) сейчас использует эвристику по ключевым словам и пишет ревьюируемый `targets/tailored-<slug>.yaml` (human-in-the-loop). Интеграция с Claude спроектирована, но не подключена: она использовала бы `@anthropic-ai/sdk` с моделью `claude-opus-4-8` и `ANTHROPIC_API_KEY` из `.env`. Для обычной сборки ключ не нужен.

## Git

Основная ветка — `main`; коммиты по Conventional Commits (`feat:`, `fix:`) и **на английском**. Репозиторий живёт под `~/private`, где directory-scoped git-конфиг подписывает коммиты персональным SSH-ключом и пушит в `git@github.com:KusokBanana/resume.git` — ключ должен быть загружен в `ssh-agent`, иначе commit/push не пройдут в неинтерактивном режиме.
