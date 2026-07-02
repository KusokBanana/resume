# Резюме как код

[![Открыть резюме](https://img.shields.io/badge/🌐_открыть_резюме-kusokbanana.ru-2da44e?style=for-the-badge)](https://kusokbanana.ru/)

Единый структурированный источник истины для резюме. Из модульного YAML
автоматически собираются цельные резюме под разные **системы** (hh, LinkedIn,
Habr Career), **форматы** (HTML, PDF, Markdown, JSON Resume), **аудитории**
(HR-человек / ATS-автоотбор) и **языки** (ru/en). Хостится на GitHub Pages.

## Зачем

- Один источник правды → нет рассинхрона между копиями резюме на разных площадках.
- Всегда актуальная ссылка (онлайн-HTML) + скачиваемые PDF/MD.
- Легко портировать в любую систему: нужный срез собирается под её формат и аудиторию.

## Как это устроено

```
content/   — ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ (двуязычный YAML):
             profile, summary, achievements (ключевые результаты),
             experience/ (опыт; поддерживает подсекции-группы), skills,
             languages, education. projects/ — опционально.
targets/   — ПРОФИЛИ СБОРКИ (язык(и) + система + аудитория + форматы + правила отбора)
src/       — движок (Zod-схемы, compose, рендереры) + Astro-сайт
scripts/   — сборка сайта: генерация MD/JSON/TXT/PDF, валидация
cli/       — локальные AI-инструменты поиска работы (подбор резюме, письмо,
             поиск/сопоставление вакансий) — см. cli/README.md
```

Опыт может быть плоским (`highlights`) или сгруппированным по подсекциям
(`groups` с локализованными заголовками — напр. «Команды и процессы», «Люди»).
Пункты фильтруются попунктно по аудитории: один блок даёт развёрнутый вид для HR
и сжатый — для ATS.

Поток: `content` (+ `target`) → валидация (Zod) → `compose` собирает
нормализованный `ResumeDocument` (один target × один язык) → рендереры:
HTML (Astro), PDF (Playwright print), Markdown, JSON Resume.

### Отбор блоков под target

Каждый блок несёт `tags` (`audience` / `systems` / `domains`) и `priority`.
`compose` ([src/lib/compose.ts](src/lib/compose.ts)) включает блок, если:

- его `systems` пуст или содержит систему target'а;
- его `audience` пуст или содержит аудиторию target'а;
- проходят `select.includeTags` / `excludeTags` / `includeIds` / `excludeIds` из target'а.

Маркированные пункты (`highlights`) фильтруются попунктно — так под ATS и под HR
показываются разные акценты из одного блока. Сортировка — по `priority`.

## Команды

```bash
npm install
npm run dev          # локальный просмотр сайта (лендинг + все варианты, ru/en)
npm run validate     # проверить весь content и targets, собрать каждый вариант
npm run build        # собрать статический сайт (HTML) в dist/
npm run build:md     # сгенерировать Markdown в dist/generated/
npm run build:json   # сгенерировать JSON Resume в dist/generated/
npm run build:pdf    # сгенерировать PDF (Playwright; нужен chromium, см. ниже)
npm run build:all    # build + md + json + pdf
```

Перед первым `build:pdf`:

```bash
npx playwright install chromium
```

## Как добавить новый блок опыта/проект

1. Создай файл `content/experience/NN-name.yaml` — **следующим номером в конце**
   (новейшая работа = наибольший номер). Номер задаёт только порядок чтения файлов,
   не порядок в резюме.
2. Заполни двуязычные поля (`ru` + `en`), даты (`start`/`end`) и `tags`.
   Порядок отображения опыта — **по дате начала, новое сверху** (автоматически,
   `priority` для опыта не нужен).
3. `npm run validate` — Zod покажет понятную ошибку, если что-то не так.

Схема всех полей — в [src/schema/index.ts](src/schema/index.ts).

## Как добавить новый target (площадку)

Создай `targets/<name>.yaml`. Минимум:

```yaml
id: my-target
label: { ru: "Моя площадка", en: "My target" }
languages: [ru, en]      # движок выдаст по варианту на каждый язык
system: general          # hh | linkedin | habr | general
audience: hr             # hr | ats | technical
layout: rich             # rich | ats
formats: [html, pdf, md] # html | pdf | md | json
select: {}               # правила отбора блоков (по желанию)
```

## AI-инструменты поиска работы (CLI)

Локальные команды на OpenAI, отдельные от сборки сайта:

- **подбор резюме под вакансию** (`tailor`) — отбирает блоки и пишет `targets/tailored-<slug>.yaml`;
- **сопроводительное письмо** (`cover-letter`) — по фактам резюме → `out/cover-letters/`;
- **поиск и сопоставление вакансий** (`find-jobs`) — hh.ru API / ручной файл → `out/jobs/`;
- **связка** (`apply`) — по выбранной вакансии запускает подбор + письмо.

Живут в [cli/](cli/), результаты пишутся приватно (`out/`, в `.gitignore`).
Полное руководство, флаги и настройка ключа — в **[cli/README.md](cli/README.md)**.

## GitHub Pages

Сайт публикуется на кастомном домене **`kusokbanana.ru`** (apex). Старый адрес
`kusokbanana.github.io/resume/` GitHub автоматически 301-редиректит на домен.

1. Домен привязан файлом [public/CNAME](public/CNAME) + **Settings → Pages →
   Custom domain** = `kusokbanana.ru`, **Enforce HTTPS** включён.
   DNS: A-записи apex на `185.199.108.153/.109.153/.110.153/.111.153`.
2. `base` = `/` и `site` = `https://kusokbanana.ru` заданы дефолтами в
   [astro.config.mjs](astro.config.mjs) (на `configure-pages` намеренно не
   полагаемся — для кастомного домена он отдавал `/resume`).
3. В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.
4. Пуш в `main` запускает [.github/workflows/deploy.yml](.github/workflows/deploy.yml):
   валидация → сборка HTML → генерация MD/JSON/PDF → деплой `dist/` на Pages.
```
