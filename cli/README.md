# CLI: AI-инструменты поиска работы

Локальные команды, которые помогают откликаться на вакансии: подбирают резюме,
пишут сопроводительное письмо и ищут/оценивают вакансии. Они **отдельны от сборки
сайта** (та живёт в `scripts/` и не зависит от OpenAI), но переиспользуют движок
резюме из [../src](../src) (`loadContent`, схемы) — единый источник истины.

> Все артефакты пишутся **приватно**: `out/` и `targets/tailored-*.yaml` в
> `.gitignore`. Репозиторий публичный — намерения по поиску работы наружу не утекают.

## Команды

| Команда | Что делает | Куда пишет | Нужен ключ? |
|---|---|---|---|
| `tailor` | Отбирает/ранжирует блоки резюме под вакансию | `targets/tailored-<slug>.yaml` | нет (есть фолбэк-эвристика) |
| `cover-letter` | Пишет сопроводительное письмо по фактам резюме | `out/cover-letters/<slug>-<lang>.md` | **да** |
| `find-jobs` | Собирает вакансии и оценивает соответствие резюме | `out/jobs/<slug>.{json,md}` | нет (без ключа — только эвристика) |
| `apply` | По выбранной вакансии запускает `tailor` + `cover-letter` | оба пути выше | частично (письмо — да) |

## Настройка ключа (один раз)

Команды используют **OpenAI API** (`platform.openai.com`) — это НЕ подписка ChatGPT,
а отдельный продукт с оплатой по токенам. Один прогон стоит доли цента.

```bash
cp .env.example .env        # из корня проекта
# впиши: OPENAI_API_KEY=sk-...
```

`.env` уже в `.gitignore`; ключ подхватывается автоматически (`process.loadEnvFile()`).
Модель по умолчанию — `DEFAULT_MODEL` в [lib/llm.ts](lib/llm.ts); переопределяется
без правки кода через `OPENAI_MODEL` в `.env` (нужна поддержка Structured Outputs:
GPT-4o и новее). Без ключа `tailor` и `find-jobs` работают по эвристике ключевых слов,
а `cover-letter` завершится с понятной ошибкой.

## tailor — подбор резюме под вакансию

```bash
npm run tailor -- --job ./vacancy.txt --lang ru --system general --slug acme
npm run tailor -- --job "текст вакансии прямо в аргументе" --lang en --slug acme
```

| Флаг | По умолчанию | Описание |
|---|---|---|
| `--job` | — (обязателен) | путь к файлу или текст вакансии |
| `--lang` | `ru` | `ru` \| `en` |
| `--system` | `general` | `hh` \| `linkedin` \| `habr` \| `general` |
| `--slug` | `tailored` | имя варианта → `targets/tailored-<slug>.yaml` |

Результат — ревьюируемый target. LLM также предлагает переформулировку summary и
обоснование (комментариями в шапке YAML — `content/` не подменяется). Дальше:
проверь файл и собери (`npm run build && npm run build:all`).

## cover-letter — сопроводительное письмо

```bash
npm run cover-letter -- --job ./vacancy.txt --lang ru --slug acme --company "Acme"
npm run cover-letter -- --job ./vacancy.txt --lang ru --slug acme --length medium --tone warm
```

| Флаг | По умолчанию | Описание |
|---|---|---|
| `--job` | — (обязателен) | путь к файлу или текст вакансии |
| `--lang` | `ru` | язык письма |
| `--slug` | `cover` | имя файла → `out/cover-letters/<slug>-<lang>.md` |
| `--company` | — | название компании для приветствия/заголовка |
| `--tone` | `formal` | `formal` \| `warm` |
| `--length` | `short` | `short` (отклик на hh, 1–2 абзаца) \| `medium` (2 абзаца) \| `long` (email/LinkedIn, 3–4 абзаца) |

По умолчанию `short` — короткий отклик под hh.ru (не пересказывает всю карьеру,
подпись без списка контактов, т.к. профиль и так виден). Для развёрнутого письма по
email/LinkedIn ставь `--length long`. Письмо пишется строго по фактам резюме
(анти-галлюцинация: модель возвращает `usedFacts` — какие блоки задействованы). Это
черновик — вычитай перед отправкой.

## find-jobs — поиск и сопоставление вакансий

```bash
# hh.ru API (по умолчанию query берётся из title + keywords профиля)
npm run find-jobs -- --source hh --lang ru --top 10 --out hh-lead
npm run find-jobs -- --source hh --lang ru --query "Head of Frontend" --area 1 --top 15 --out hh-fe

# ручной файл (любая площадка: LinkedIn, getmatch, телеграм-каналы)
npm run find-jobs -- --source file --file ./vacancies.yaml --lang ru --out manual
```

| Флаг | По умолчанию | Описание |
|---|---|---|
| `--source` | `hh` | `hh` (api.hh.ru) \| `file` |
| `--file` | — | путь к YAML/JSON (обязателен при `--source file`) |
| `--lang` | `ru` | язык сопоставления |
| `--query` | title профиля | поисковый запрос для hh |
| `--area` | — | id региона hh: `1` = Москва, `2` = СПб |
| `--top` | `10` | сколько кандидатов после предфильтра уходит в LLM |
| `--out` | `jobs` | имя файлов → `out/jobs/<out>.{json,md}` |

**Два этапа** (экономят токены): дешёвый предфильтр по пересечению слов резюме и
вакансии оставляет top-N → LLM ранжирует только их одним батч-вызовом (для hh
детальные описания тянутся лишь для top-N). Вывод: таблица в терминал +
`out/jobs/<out>.md` (для осмотра) + `out/jobs/<out>.json` (вход для `apply`).

> **hh.ru требует авторизацию.** Публичный поиск `/vacancies` с 2024 г. отвечает
> `403 forbidden` без токена. Чтобы включить `--source hh`: зарегистрируй приложение
> на [dev.hh.ru](https://dev.hh.ru/), получи OAuth-токен и положи его в `.env` как
> `HH_TOKEN=...` (клиент подхватит автоматически). Без токена используй **`--source
> file`** — он не требует сети и работает с любой площадкой.

Формат ручного файла (`--source file`):

```yaml
- title: Head of Frontend
  company: Acme
  url: https://example.com/vacancy/1
  text: |
    Полный текст вакансии: требования, обязанности, стек…
- title: Engineering Manager
  company: Globex
  url: https://example.com/vacancy/2
  text: "…"
```

## apply — отклик по выбранной вакансии

```bash
npm run apply -- --from hh-lead --id <vacancyId> --lang ru
```

| Флаг | По умолчанию | Описание |
|---|---|---|
| `--from` | — (обязателен) | slug результатов find-jobs (`out/jobs/<from>.json`) |
| `--id` | — (обязателен) | id вакансии из таблицы/JSON find-jobs |
| `--lang` | язык из файла матчей | язык артефактов |

Берёт описание вакансии из сохранённых результатов и запускает `tailor` +
`cover-letter`. Оба артефакта — ревьюируемые черновики; проверь перед отправкой.

## Структура

```
cli/
  tailor.ts         — подбор резюме (экспортирует runTailor)
  cover-letter.ts   — письмо (экспортирует runCoverLetter)
  find-jobs.ts      — поиск/сопоставление (экспортирует runFindJobs, loadMatches)
  apply.ts          — связка find-jobs → tailor + cover-letter
  lib/
    llm.ts          — обёртка OpenAI (Responses API + Structured Outputs), .env
    catalog.ts      — каталог блоков резюме + эвристики предфильтра + профиль
    hh.ts           — клиент hh.ru API (поиск + детали, User-Agent, strip HTML)
```

Зависимость от сайта — только чтение движка: `loadContent` и схемы из `../src`.
Запуск через `tsx` (см. npm-скрипты в корневом `package.json`).
