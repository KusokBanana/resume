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
scripts/   — генерация MD/JSON/PDF + LLM-подбор под вакансию (tailor)
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

## Идеальное резюме под вакансию (LLM)

```bash
npm run tailor -- --job ./vacancy.txt --lang ru --system general --slug acme
```

Сейчас [scripts/tailor.ts](scripts/tailor.ts) работает по эвристике (пересечение
ключевых слов) и пишет предложенный `targets/tailored-<slug>.yaml`, который ты
ревьюишь перед сборкой (human-in-the-loop). В файле есть спроектированный промпт и
референс-реализация вызова Claude (`claude-opus-4-8`) — чтобы включить смысловой
подбор, поставь `@anthropic-ai/sdk`, добавь `ANTHROPIC_API_KEY` в `.env`
(см. [.env.example](.env.example)) и подключи `tailorWithClaude`.

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
