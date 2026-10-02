# Contract: `pnpm site:crawl`

Рендерит информационные страницы сайта города в headless-браузере и пишет снимок JSON (форма — [data-model.md](../data-model.md#снимок-сбора)).

```
pnpm site:crawl --url <site-url> --rn <uuid> --br <uuid> --out <file.json>
                [--pages <path,path,...>] [--no-promotion-details]
                [--browser <executable>] [--page-timeout <ms>] [--concurrency <n>]
                [--help]
```

| Параметр | По умолчанию | Смысл |
|----------|--------------|-------|
| `--url` | обязателен | базовый адрес сайта города, напр. `https://tyumen.sushi-master.ru` |
| `--rn`, `--br` | обязательны | идентификаторы сети и города, попадут в снимок |
| `--out` | обязателен | путь к файлу снимка; существующий перезаписывается |
| `--pages` | `DEFAULT_INFO_PAGES` | список путей через запятую; заменяет список по умолчанию |
| `--no-promotion-details` | выключено | не ходить по ссылкам отдельных акций со страницы `/promotions` |
| `--browser` | `BROWSER_EXECUTABLE_PATH` → автопоиск | путь к Chromium-совместимому браузеру |
| `--page-timeout` | `180000` | таймаут одной страницы, мс |
| `--concurrency` | `2` | число одновременно открытых вкладок |

`DEFAULT_INFO_PAGES` = `/about`, `/delivery`, `/bonus`, `/promotions`, `/our-restourants`, `/llm-info`, `/public-oferta`, `/privacy`, `/personal-data-processing`, `/personal-data-transfer`.

Со страницы `/promotions` дополнительно собираются ссылки `a[href^="/promotions/"]` (глубина 1), если не указан `--no-promotion-details`.

**Поведение**

- Страница считается успешной, если извлечённый текст ≥ 200 символов; иначе `status: failed`, `error: "empty content"` (или текст ошибки браузера/таймаута).
- Неудача одной страницы не останавливает сбор.
- Браузер не найден → выход с кодом 2 и подсказкой про `--browser` / `BROWSER_EXECUTABLE_PATH`.
- По завершении печатается таблица: path, status, chars, время; итог `ok=N failed=M`.

**Коды возврата**: `0` — все страницы ok; `3` — часть страниц failed (снимок записан); `1` — ошибка запуска (аргументы, запись файла); `2` — браузер не найден.

**Модули**: argv → `parseCrawlArgs()` ([cli-options.ts](../../../src/modules/site-knowledge/cli-options.ts)), рендер → `HeadlessBrowserFetcher`, HTML → текст → `HtmlTextExtractor`, оркестрация → `SiteCrawlerService.crawl()`.
