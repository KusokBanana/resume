# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Язык: вся документация в этом репозитории ведётся на русском; на английском — только сообщения коммитов.

## Что это

«Резюме как код»: единый структурированный двуязычный (ru/en) источник истины в YAML, из которого собирается множество вариантов резюме под разные системы (hh, LinkedIn, Habr Career), форматы (HTML, PDF, Markdown, JSON Resume, plain-text для textarea) и аудитории (HR-человек vs ATS/автоотбор). Статический сайт на GitHub Pages. Стек: Astro + TypeScript, Zod, Playwright.

## Команды

```bash
npm run dev          # dev-сервер Astro (лендинг + все варианты, ru/en)
npm test             # юнит-тесты чистой логики (node:test через tsx): compose/isRelevant, даты+плюрализация, inline, withBase, golden-рендер
npm run check        # astro check — типизация .astro + TS (сборка на esbuild её НЕ делает)
npm run lint         # eslint (flat config) по src/scripts/test; инлайн-<script> в .astro на ES5-стиле сознательно смягчены
npm run format       # prettier --write по src/scripts/test (content/targets/cli/CLAUDE.md не трогает); format:check — только проверка
npm run validate     # загрузка+валидация всего content и targets через Zod, сборка каждого варианта
npm run build        # astro build → dist/ (только HTML). ВНИМАНИЕ: чистит dist/, включая dist/generated/
npm run build:md     # рендер Markdown → dist/generated/
npm run build:json   # рендер JSON Resume → dist/generated/
npm run build:txt    # plain-text для textarea hh/LinkedIn → dist/generated/*.txt — ОСНОВНОЙ артефакт для hh
npm run build:pdf    # Playwright печатает собранный HTML → dist/generated/*.pdf
npm run build:og     # OG-картинка → dist/og.png (нужен Chromium)
npm run build:favicons  # растровые фавиконки из public/favicon.svg (вручную, в build:all НЕ входит)
npm run build:all    # build + md + json + txt + pdf + og (правильный порядок)
npm run preview      # отдаёт dist/ в корне (http://localhost:4321/)
npm run tailor -- --job <файл|текст> --lang ru --system general --slug acme   # подбор под вакансию (LLM/эвристика)
npm run cover-letter -- --job <файл|текст> --lang ru --slug acme --company Acme  # письмо (нужен OPENAI_API_KEY) → out/cover-letters/
npm run find-jobs -- --source hh --lang ru --top 10 --out hh-lead             # поиск вакансий hh.ru + сопоставление → out/jobs/
npm run find-jobs -- --source file --file ./vacancies.yaml --lang ru --out manual  # тот же поиск из ручного файла (любая площадка)
npm run apply -- --from hh-lead --id <vacancyId> --lang ru                    # по вакансии из find-jobs: tailor + письмо
npm run funnel -- add|set|list|stats                                          # учёт откликов → out/funnel.yaml (без LLM)
```

Тесты чистой логики — `npm test` ([test/](test/), `node:test` через `tsx`, без доп. зависимостей): покрыты `compose`/`isRelevant`, реестр навыков ([skill-evidence.test.ts](test/skill-evidence.test.ts): `stackFor`, `globalSkillGroups`, `evidenceForSkill`, `orderedCompanies`, `totalMonths`), даты и русская плюрализация ([labels.ts](src/lib/labels.ts)), inline-markdown, golden-рендеры, `withBase`. `npm run validate` — интеграционный шлюз: загрузка+валидация всего content/targets через Zod и сборка каждого варианта; запускай после любого изменения content или схемы (при ошибке Zod указывает точный файл и поле). Прогоняй оба после изменений в движке. В CI ([deploy.yml](.github/workflows/deploy.yml)) перед сборкой идут `format:check` → `lint` → `test` → `check` (astro) → `validate` — они гейтят деплой.

Важен порядок: `astro build` сначала чистит `dist/`, поэтому артефакты `generated/` (md/json/txt/pdf/og) **должны создаваться после** `build`. Всегда используй `build:all`, либо `build` и затем генераторы — никогда `build` в одиночку, если нужны скачиваемые файлы. Если правил только контент и нужны свежие тексты для hh — хватит `npm run build:txt` (пишет в `dist/generated/` напрямую), но НЕ запускай после него `npm run build`: он вычистит dist. Для `build:pdf` и `build:og` нужен Chromium: `npx playwright install chromium`.

## Архитектура

Три слоя, данные полностью отделены от представления:

1. **`content/`** — источник истины (двуязычный YAML). По файлу на сущность: `profile`, `summary` (варианты с тегами аудитории), `achievements`, `experience/*.yaml` (по файлу на место работы), `skills`, `languages`, `education`, плюс **только для лендинга** `interests`, `stats` (полоса цифр под hero, она же кормит OG-картинку), `theses` и каталог `projects/*.yaml`. Блоки резюме несут `tags` (`audience` / `systems` / `domains`) и обычно `priority`; у interests/stats/theses тегов нет — они намеренно не идут в compose и экспорты (правь их, когда речь про лендинг, и помни, что цифры там могут разойтись с формулировками резюме).
2. **`targets/*.yaml`** — декларативные профили сборки. Обязательные поля: `id`, `label` (Localized), `languages[]`, `system`, `audience`. С дефолтами: `formats[]`, `layout` (`rich`|`ats`), `select`, `sections`. Опциональные: `title` (переопределяет заголовок резюме — используют все hh-варианты), `canonical` (чей PDF отдаёт лендинг). ⚠ `system` — закрытый enum `hh|linkedin|habr|general`: под новую площадку сначала правь схему, иначе Zod уронит загрузку всего. Каждый target даёт по варианту на язык.
3. **`src/`** — движок + сайт Astro. Поток: `load.ts` (чтение+валидация) → `compose.ts` (фильтр/сортировка/i18n → плоский `ResumeDocument`) → рендереры.

### Внутренности движка (прочитай перед изменением логики)

- **⚠ Фильтрация действует ТОЛЬКО на target-варианты** (страницы `/exports/*` и файлы `dist/generated/*`). Мимо `compose` идут: **лендинг** — виджеты [src/components/landing/](src/components/landing/) читают `content` напрямую (весь опыт со всеми пунктами, top-6 достижений, `summary-general`), и **канонические выгрузки** `/{lang}/resume.md`, `/{lang}/resume.json`, `llms.txt` — они собираются через `fullDoc()` ([canonical.ts](src/lib/canonical.ts)) с `includeAll=true`, а `isRelevant` в этом режиме сразу возвращает `true`. Практическое правило: **всё, что лежит в `content/`, считай опубликованным**; тег вроде `linkedin-skip`/`management` прячет пункт только от конкретного экспорта, но не с индексируемого лендинга и не из md/json, которые специально скармливаются ИИ-рекрутёрам через `llms.txt`. Если факт нельзя показывать никому — его нельзя класть в `content/`.
- Карта маршрутов: [index.astro](src/pages/index.astro) — лендинг (мимо compose); [exports.astro](src/pages/exports.astro) + [exports/[target]/[lang].astro](src/pages/exports/) — варианты (через compose); `pages/[lang]/resume.{md,json}.ts` и `pages/llms.txt.ts` — канонические выгрузки (через `fullDoc`).
- **[src/schema/index.ts](src/schema/index.ts)** — Zod-схемы + интерфейс `ResumeDocument` (единая форма, которую потребляют все рендереры). `Localized = {ru, en}`. Элементы навыков и пункты опыта полиморфны/сгруппированы — см. `SkillEntry`, `HighlightGroup`.
- **[src/lib/compose.ts](src/lib/compose.ts)** — логика отбора. `isRelevant` проверяет по порядку, с ранними выходами: **1)** `select.excludeIds` — исключает сразу; **2)** `select.includeIds` — включает сразу, **минуя systems/audience/теги** (так ats-summary может протечь в hr-вариант); **3)** `systems` блока (пуст или содержит систему target'а); **4)** `audience`; **5)** `excludeTags`; **6)** `includeTags` (если задан — требуется пересечение). **Пункты (highlights) фильтруются попунктно** по тому же правилу — так один блок опыта даёт полный список для HR и сжатый для ATS. **Опыт сортируется по дате начала по убыванию** (`byStartDesc`); остальные секции — по `priority`. Следствие для CLI: `tailor` пишет target только с `select.includeIds`, а такой select ничего НЕ сужает — блоки без совпадения id всё равно проходят по дефолту.
- **`target.sections` — второй, независимый от тегов гейт**: рендереры идут именно по нему ([Resume.astro](src/components/Resume.astro), [render-md.ts](src/lib/render-md.ts), [render-plain.ts](src/lib/render-plain.ts), build-скрипты). Ни один из текущих targets не включает `projects` в `sections` — добавив проект в контент, не забудь про секцию, иначе он молча не отрендерится. Проекты грузятся из **каталога** `content/projects/*.yaml` (сейчас каталога нет).
- Все рендереры принимают `ResumeDocument`: **[Resume.astro](src/components/Resume.astro)** (HTML; `data-layout` переключает rich/ATS), **[render-md.ts](src/lib/render-md.ts)** (Markdown), **[render-plain.ts](src/lib/render-plain.ts)** (plain-text для textarea hh/LinkedIn; там же лимиты длины), **[export-jsonresume.ts](src/lib/export-jsonresume.ts)** (схема jsonresume.org). PDF — это Playwright, печатающий уже собранные HTML-страницы, которые отдаёт крошечный встроенный статик-сервер ([scripts/build-pdf.ts](scripts/build-pdf.ts)).
- Общие для рендереров/компонентов: строки UI и хелперы дат/периодов/плюрализации — [labels.ts](src/lib/labels.ts) (`UI` типизирован `as const`); сборка текстовых документов — [text.ts](src/lib/text.ts); inline-markdown (`**жирный**`) — [inline.ts](src/lib/inline.ts) (`renderInline`/`escapeHtml`); id счётчиков аналитики — [analytics.ts](src/lib/analytics.ts).
- Сайт-слой: страницы обёрнуты в [BaseLayout.astro](src/layouts/BaseLayout.astro) (общий `<head>`: charset/viewport/фавиконки/аналитика/title + слот `head`). Двуязычие в разметке — компонент [Bilingual.astro](src/components/Bilingual.astro) (`ru`/`en`, пропсы `as`/`class`/`html` + проброс атрибутов; рендерит пару `.lang-ru`/`.lang-en`, которую CSS показывает по `data-lang`). Переключатель языка — [LangToggle.astro](src/components/LangToggle.astro). Поведение лендинга (reveal/count-up/лайтбокс/сворачивание/фильтр навыков/поповеры) — бандл-скрипт [src/scripts/landing.ts](src/scripts/landing.ts); второй бандл — [src/scripts/goals.ts](src/scripts/goals.ts) (отправка целей по клику на `[data-goal]` в Яндекс.Метрику/GA4, единственный потребитель id из [analytics.ts](src/lib/analytics.ts)). Инлайн в `<head>` делает две вещи до отрисовки: ставит язык и класс `js` на `<html>` (от него зависят reveal-анимации и сворачивание опыта — без него всё показывается развёрнутым).
- **Лендинг разбит на самодостаточные виджеты** в [src/components/landing/](src/components/landing/) (SiteNav, Hero, StatsBand, Theses, Results, ExperienceSection, SkillsSection, Beyond, ClosingCta, SiteFooter): каждый сам зовёт `loadContent()` (мемоизирован) и берёт свой срез; [index.astro](src/pages/index.astro) — тонкая оболочка (мета/JSON-LD + композиция + лайтбокс + скрипты). Ссылки на скачиваемый PDF — общий хелпер [downloads.ts](src/lib/downloads.ts). Стили лендинга — партиалы в [src/styles/landing/](src/styles/landing/), собираются `@import`-барелем [landing.css](src/styles/landing.css) (порядок = каскад).

### Реестр навыков и ролевые hh-резюме (механика)

- **[content/skills.yaml](content/skills.yaml) — единый реестр навыков**: у навыка `at` (id мест работы, ≥1),
  `stack` (попадает в строку «Стек» карточек опыта; политика — только ядро+легаси), `global` (чип в витрине
  навыков; требует `group`). Стек компании **выводится** из реестра (`stackFor`), в experience-файлах стека нет.
  Поповер-эвиденс чипов — [skill-evidence.ts](src/lib/skill-evidence.ts).
- **Несколько резюме под одну площадку** — отдельные `targets/hh-*.yaml`. Target может переопределять
  заголовок (`title`, иначе `profile.title`); `canonical: true` помечает вариант, чей PDF отдаёт лендинг
  ([downloads.ts](src/lib/downloads.ts)) — не убирай флаг у hh и не заводи второй.
- **Ролевые summary** в [content/summary.yaml](content/summary.yaml) выбираются по priority среди релевантных.
  ⚠ Грабли: target ролевого summary обязан исключать через `select.excludeIds` ВСЕ ролевые summary
  с priority выше своего, иначе они «протекут» (см. комментарии в targets/hh-head.yaml).
- **Доменные теги-фильтры**: `linkedin-skip` (пункт не идёт в LinkedIn — лимит 2000 симв. на позицию,
  его стережёт `npm run validate`; новые пункты PT по умолчанию помечай им), `management`
  (чисто менеджерские пункты — их скрывает IC-вариант hh-fullstack через `excludeTags`).
- **«Ключевые результаты» ([achievements.yaml](content/achievements.yaml))**: формулировки НЕ должны дословно
  совпадать с пунктами опыта (LLM-скоринг ATS штрафует дубли); ролевой отбор — `excludeIds` в targets
  (управленческие версии скрывают микро-метрики, IC — менеджерские результаты).
- **Plain-text рендер**: кэп стека (`LINKEDIN_MAX_STACK = 12`) применяется ТОЛЬКО к LinkedIn; подзаголовки
  групп выводятся с двоеточием («Продукты:») — иначе ATS-парсеры принимают их за должности. Сам лимит
  длины позиции (LinkedIn — 2000 симв.) задан в [scripts/validate.ts](scripts/validate.ts) (`POSITION_LIMITS`),
  не в рендерере.
- ⚠ **Навыки НЕ фильтруются по target'у**: `globalSkillGroups`/`stackFor` не получают target, у `SkillEntry`
  нет ни `tags`, ни `id`. Витрина навыков и строки «Стек» одинаковы во всех 14 вариантах, спрятать навык
  под конкретное резюме тегом или `excludeIds` **невозможно** — это ограничение движка (задача B1
  в `CLAUDE.local.md`), а не баг. Не удаляй навыки из общего реестра ради одного варианта.

### Конвенции и подводные камни

- **⚠ Схемы НЕ `.strict()`, ссылочная целостность не проверяется.** Незнакомый или опечатанный ключ Zod молча отбрасывает (`excludeId` вместо `excludeIds`, возврат удалённого `stack:` в experience, выдуманное поле у навыка), а id нигде не сверяются: `select.includeIds/excludeIds` с несуществующим id, `skills.group` с несуществующей группой (навык тихо пропадает из витрины), `skills.at` с несуществующим опытом — `npm run validate` останется **зелёным при неработающей правке**. Проверяй результат по факту, а не по зелёному валидатору: смотри строки `✓ <target> [lang] → N опыт …` в выводе validate и/или `npm run build:txt` + diff `dist/generated/<target>-ru.txt`. Если правка не изменила вывод — почти наверняка опечатка в ключе или id. Единственный fail-fast (привязки `at`) живёт в [SkillsSection.astro](src/components/landing/SkillsSection.astro) и срабатывает только на `astro build`/`dev`.
- **Захардкоженные id.** `'summary-general'` зашит в [Hero.astro](src/components/landing/Hero.astro), [index.astro](src/pages/index.astro), `llms.txt.ts` и [canonical.ts](src/lib/canonical.ts) — везде с тихим фолбэком. Переименуешь/удалишь этот id — молча подменится текст на лендинге и в каноническом резюме, без ошибки в validate и тестах. Тот же класс — id достижений (`scale`, `retention`, …), на которые ссылаются `excludeIds` в targets.
- **Git-хуки включены**: `prepare` ставит `core.hooksPath .githooks`. `.githooks/pre-commit` = `format:check` + `lint`; `.githooks/pre-push` = весь CI-гейт (format:check → lint → test → check → validate), это занимает минуты — долгий push не завис. Перед коммитом правок в `src/scripts/test` прогоняй `npm run format`, иначе pre-commit отклонит. `--no-verify` не используй: гейт ловит реальные поломки (например, обязательное поле схемы у виртуального target'а).
- **`ROOT = process.cwd()`** ([load.ts](src/lib/load.ts)) — осознанно (через `import.meta.url` ломается в Astro 7). Все команды запускай **из корня репозитория**, иначе `ENOENT content/profile.yaml` с неочевидной причиной. `loadContent()`/`loadTargets()` кэшируют результат на процесс: скрипт, который правит YAML и перечитывает контент, увидит старые данные; dev-сервер после правки content нужно перезапускать.
- **Импорты только относительные, без алиаса `@/`** — tsx-скрипты не резолвят `paths` из tsconfig, поэтому `@/` сломает CLI-скрипты. Новые импорты держи относительными.
- **Base-путь GitHub Pages**: ссылки строй через `withBase(base, path)` ([src/lib/url.ts](src/lib/url.ts)). Сейчас сайт на кастомном домене и `base` = `/`, но хелпер по-прежнему обязателен: `import.meta.env.BASE_URL` может быть `/` или (при форке) `/<repo>` без завершающего слеша — наивная конкатенация `${base}${path}` даёт `/resumehh/ru`. Никогда не склеивай base вручную.
- **YAML**: любой скаляр с `": "` (двоеточие-пробел) нужно закавычивать, иначе парсер примет его за вложенный mapping. Особенно бьёт по длинным русским текстам пунктов.
- **base/site — дефолты в [astro.config.mjs](astro.config.mjs)** (`site=https://kusokbanana.ru`, `base=/`). Кастомный домен привязан через [public/CNAME](public/CNAME). На `actions/configure-pages` намеренно НЕ полагаемся: для кастомного домена он отдавал `base=/resume` и ломал пути к ассетам ([.github/workflows/deploy.yml](.github/workflows/deploy.yml) собирает на дефолтах). Переопределить можно env `SITE`/`BASE` (для форка на `<user>.github.io/<repo>`).

## Добавление контента

- **Новое место работы**: создай `content/experience/NN-name.yaml` со *следующим* номером (новейшее = наибольший номер; порядок на странице — по дате, не по имени файла и не по priority). Заполни двуязычные поля, `start`/`end`, `tags`. **Стека в experience нет** — добавь новый id в `at` нужных навыков [content/skills.yaml](content/skills.yaml), иначе строка «Стек» карточки будет пустой (молча, `validate` этого не ловит). Затем `npm run validate` и `npm run build` (последний проверит привязки `at`).
- **Новый target/площадка**: добавь `targets/<name>.yaml` (обязательны `id`, `label`, `languages`, `system`, `audience`; см. поля выше). Он появится в `getStaticPaths` и на служебной странице [/exports](src/pages/exports.astro) — **не на лендинге**: лендинг targets не читает вовсе, ссылку на PDF он берёт через [downloads.ts](src/lib/downloads.ts) у варианта с `canonical: true`.

## LLM-команды (OpenAI): подбор, письмо, поиск работы

**Живут в [cli/](cli/) — отдельно от сборки сайта** (`scripts/` + Astro не зависят от `openai`). Полное руководство по флагам и настройке ключа — в [cli/README.md](cli/README.md). CLI переиспользует движок из `src` (`loadContent`, `ROOT`, `TARGETS_DIR`, схемы, а также `stackFor` в [catalog.ts](cli/lib/catalog.ts)), но сайт CLI не импортирует. ⚠ Правка `compose.ts`/`stackFor` молча меняет каталог блоков, который видит LLM. При этом `cli/` **не покрыт** ни `npm run lint`, ни `npm run format`, ни тестами (они ходят по `src scripts test`) — типы там ловит только `npx tsc --noEmit`, остальное всплывает в рантайме.

Общая инфраструктура в [cli/lib/llm.ts](cli/lib/llm.ts) (`callStructured` — Responses API + Structured Outputs по zod-схеме; `hasOpenAIKey`; `modelName`; загрузка `.env` через нативный `process.loadEnvFile()`, без `dotenv`) и [cli/lib/catalog.ts](cli/lib/catalog.ts) (`catalog`, `keywordScore`/`resumeWords` — дешёвый предфильтр, `profileFacts`). Ключ — **OpenAI API** (`platform.openai.com`), НЕ подписка ChatGPT (раздельные продукты, тарификация по токенам). Модель по умолчанию — `DEFAULT_MODEL` в `llm.ts`; переопределяется env `OPENAI_MODEL` (нужна поддержка Structured Outputs: GPT-4o+/серия GPT-5).

Команды поверх общего слоя:

- **[cli/tailor.ts](cli/tailor.ts)** (`runTailor`) — пишет ревьюируемый `targets/tailored-<slug>.yaml`. LLM выбирает/ранжирует блоки и предлагает переформулировку summary (комментарием в шапке YAML, не подменяя `content/`). Без ключа/при ошибке — откат на эвристику по ключевым словам. ⚠ Два подвоха: `--system` берётся строкой без проверки — значение вне enum (`getmatch`) создаст файл, после которого падает **любая** команда с `loadTargets`, а сам файл в `.gitignore` и в `git status` не виден; и сгенерированный `select: {includeIds}` ничего не сужает (см. порядок `isRelevant` выше). Забытые `tailored-*.yaml` добавляют варианты в сборку и PDF.
- **[cli/cover-letter.ts](cli/cover-letter.ts)** (`runCoverLetter`) — письмо строго по фактам резюме → `out/cover-letters/<slug>-<lang>.md`. **Двухэтапно**: этап 1 (Hiring Manager) строит стратегию-план (`LetterPlanSchema` → `<slug>-<lang>.plan.json`), этап 2 пишет письмо, видя только отобранные планом блоки (структурная защита от пересказа/галлюцинаций; id валидируются по каталогу). При сбое этапа 1 — откат на одностадийный `FALLBACK_SYSTEM_PROMPT`. **Без ключа OpenAI не работает** (эвристики-фолбэка нет — письмо без LLM бессмысленно).
- **[cli/find-jobs.ts](cli/find-jobs.ts)** (`runFindJobs`/`loadMatches`) — сбор вакансий (hh.ru API через [cli/lib/hh.ts](cli/lib/hh.ts) или ручной YAML/JSON-файл) → **два этапа**: дешёвый предфильтр по словам резюме (top-N), затем LLM-ранжирование только top-N одним батч-вызовом (для hh детальные описания тянутся лишь для top-N). Выдача → `out/jobs/<slug>.{json,md}` + таблица в терминал. Без ключа — только эвристический скор.
- **[cli/apply.ts](cli/apply.ts)** — связка: по `--from <slug> --id <vacancyId>` из результатов find-jobs запускает `runTailor` + `runCoverLetter`.
- **[cli/funnel.ts](cli/funnel.ts)** — учёт воронки откликов (без LLM): `add`/`set`/`list`/`stats` → приватный `out/funnel.yaml`. `stats` считает конверсии по истории статусов и подсказывает главный разрыв воронки.
- **[cli/lib/fetch-job.ts](cli/lib/fetch-job.ts)** — `--job <URL>` в tailor/cover-letter: для hh.ru тянет название/компанию/описание из JSON-LD страницы вакансии (токен не нужен). Другие площадки не поддержаны — понятная ошибка.
- **cover-letter — правила этапа 2** (выведены из разбора реальных писем, не ослабляй): обязан закрыть все `importance: high` тезисы плана (код проверяет по `paragraphMap` и делает один ретрай); первое предложение — хук про задачу роли, НЕ автобиография; возражения снимать только центральные и только рефреймом в силу (никаких «не обещаю X» про второстепенное); метрики — под уровень роли (Head/EM — бизнес/организация, микро-метрики в минутах — только для IC/тимлид-ролей); имя компании ≤1 раза в теле; closing без имени и «С уважением».

**Приватность**: `out/`, `targets/tailored-*.yaml` и `CLAUDE.local.md` — в `.gitignore` (репо публичный, не светим детали поиска работы). Чтобы опубликовать конкретный подобранный вариант на сайте — `git add -f targets/tailored-<slug>.yaml`. **Приватный контекст для агентов — в `CLAUDE.local.md`** (решения владельца, состояние поиска, бэклог): прочитай его перед работой с контентом резюме. hh.ru API: **публичный поиск `/vacancies` отвечает 403** (проверено 2026-07; шапка [cli/lib/hh.ts](cli/lib/hh.ts) утверждает обратное — она устарела, доверяй этому абзацу). Нужен OAuth-токен `HH_TOKEN` в `.env` (регистрация приложения на dev.hh.ru; код уже умеет `Authorization: Bearer`). HTML-страницы вакансий при этом открыты и отдают JSON-LD — на этом работает `fetch-job.ts`, ему токен не нужен.

## Git

Основная ветка — `main`; коммиты по Conventional Commits (`feat:`, `fix:`) и **на английском**. Репозиторий живёт под `~/private`, где directory-scoped git-конфиг подписывает коммиты персональным SSH-ключом и пушит в `git@github.com:KusokBanana/resume.git` — ключ должен быть загружен в `ssh-agent`, иначе commit/push не пройдут в неинтерактивном режиме.
