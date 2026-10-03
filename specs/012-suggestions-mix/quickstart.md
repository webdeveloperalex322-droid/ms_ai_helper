# Quickstart: проверка набора подсказок

**Feature**: 012-suggestions-mix | Сценарии приёмки. Подробности формул — в [contracts/selection-algorithm.md](./contracts/selection-algorithm.md), состав каталога — в [data-model.md](./data-model.md).

## Предварительные условия

1. Postgres с pgvector поднят, каталог Тюмени импортирован, `pnpm rag:index-all` выполнен.
2. База знаний города загружена фичей 011 (`pnpm site:import` по снимку из `data/`) — иначе сервисные подсказки будут корректно скрыты и сценарий 3 проверить не получится.
3. Миграция и сид:

```bash
pnpm db:migrate     # добавляет assistant_suggestions.screen_contexts
pnpm db:seed        # 49 подсказок, идемпотентно по (rn, code)
pnpm start:dev      # http://localhost:3000/v1
```

Переменные окружения (все со значениями по умолчанию, править не обязательно):

```text
MAX_SUGGESTIONS_ON_SCREEN=6          # лимит набора
SUGGESTIONS_SERVICE_QUOTA_MIN=1      # сервисных мест в catalog, минимум
SUGGESTIONS_SERVICE_QUOTA_MAX=2      # максимум
SUGGESTIONS_STATS_WINDOW_DAYS=30
SUGGESTIONS_STATS_MIN_IMPRESSIONS=50
SUGGESTIONS_CTR_WEIGHT=2.0
SUGGESTIONS_EXPLORATION_BONUS=0.15
SUGGESTIONS_DAYPART_BOOST=1.5
SUGGESTIONS_CONTEXT_BOOST=2.0
SUGGESTIONS_TIMEZONE=Asia/Yekaterinburg
SUGGESTIONS_DAYPART_WINDOWS={"lunch":[11,16],"evening":[17,23],"night":[23,5]}
```

Ниже `$RN` — сеть, `$BR` — город Тюмень.

## Сценарий 1 — лимит и смешивание типов (US1, FR-008, FR-010)

```bash
curl "http://localhost:3000/v1/assistant/suggestions?rn=$RN&br=$BR&target=WEB&screen_context=catalog&session_id=visit-1" | jq
```

Ожидается: ровно 6 элементов; среди них 1–2 с `kind: "service"`, остальные `kind: "product"`; повторов `id` нет.

## Сценарий 2 — стабильность и ротация (US1, FR-012)

```bash
# один и тот же visit → один и тот же набор
for i in 1 2; do curl -s "...&session_id=visit-1" | jq -c '[.suggestions[].code]'; done
# другой visit → другой набор
curl -s "...&session_id=visit-2" | jq -c '[.suggestions[].code]'
```

Ожидается: два запроса с `visit-1` дают идентичные списки кодов в идентичном порядке; `visit-2` отличается минимум одним кодом.

Покрытие каталога: прогнать 30 разных `session_id` и собрать объединение кодов — должно набраться не менее 70% включённых подсказок города (SC-005).

## Сценарий 3 — сервисная подсказка отвечает из базы знаний (US2, FR-002)

```bash
SID=$(curl -s "...&session_id=visit-1" | jq -r '.suggestions[] | select(.code=="delivery_cost") | .id')
curl -s -X POST http://localhost:3000/v1/assistant/product-answer \
  -H 'Content-Type: application/json' \
  -d "{\"rn\":\"$RN\",\"br\":\"$BR\",\"target\":\"WEB\",\"suggestion_id\":\"$SID\"}" | jq
```

Ожидается: текстовый ответ о стоимости доставки, действие со ссылкой на страницу-источник, массив карточек пустой.

Если `delivery_cost` в наборе не оказалось — взять его `id` из `GET /v1/internal/assistant/suggestions`.

## Сценарий 4 — город без базы знаний (US2, FR-016)

Запросить список для города, по которому `site:import` не выполнялся.

Ожидается: ни одного элемента с `kind: "service"`; набор целиком товарный, по-прежнему до 6 элементов.

## Сценарий 5 — контексты экрана (US4, FR-018–FR-020)

```bash
curl -s "...&screen_context=cart&session_id=visit-1"     | jq -c '[.suggestions[].code]'
curl -s "...&screen_context=checkout&session_id=visit-1" | jq -c '[.suggestions[].code]'
curl -s "...&screen_context=unknown&session_id=visit-1"  | jq -c '[.suggestions[].code]'
```

Ожидается: в `cart` не менее 4 из 6 мест занимают `drinks`, `dessert`, `sauces_addons`, `hot_food`; в `checkout` не менее 4 из 6 — сервисные; `unknown` даёт тот же набор, что `catalog`.

## Сценарий 6 — время суток (US4, FR-021)

Прогнать запрос каталога дважды, подменив пояс так, чтобы попасть в обеденное и в вечернее окно:

```bash
SUGGESTIONS_TIMEZONE=Asia/Yekaterinburg pnpm start:dev   # и сравнить наборы в разные часы
```

Ожидается: в обеденное окно `lunch`, `office_lunch`, `quick_snack` стоят выше; в вечернее — `evening`, `for_series`, `perfect_dinner`. Подсказки без сценария своё положение из-за времени не меняют.

## Сценарий 7 — диета и исключения (US3, FR-003)

```bash
SID=$(... code=="no_fish" ...)
curl -s -X POST .../product-answer -d "{... \"suggestion_id\":\"$SID\"}" | jq '.cards[].name'
```

Ожидается: ни в одной карточке нет рыбных ингредиентов. Аналогично для `no_cucumber`, `no_cream_cheese`, `veggie_only`, `no_spicy_at_all`.

## Сценарий 8 — «похож на X» (US3, FR-005)

Выбрать `like_california`. Ожидается: в карточках есть похожие роллы, самой «Калифорнии» среди них нет.

## Сценарий 9 — влияние статистики (US5, FR-024–FR-028)

```bash
# набить показы и клики по одной подсказке выше порога достоверности
for i in $(seq 1 60); do
  curl -s -X POST http://localhost:3000/v1/assistant/events \
    -H 'Content-Type: application/json' \
    -d "{\"rn\":\"$RN\",\"br\":\"$BR\",\"target\":\"WEB\",\"event_type\":\"suggestion_shown\",\"suggestion_id\":\"$SID\",\"session_id\":\"visit-$i\"}" > /dev/null
done
# половину показов подтвердить кликом, подождать истечения кеша статистики (60 с)
```

Ожидается: после истечения кеша подсказка с высокой долей выборов попадает в наборы заметно чаще при прогоне 50 разных `session_id`, чем до набивки. При полностью пустой таблице событий порядок совпадает с `sort_order`.

## Сценарий 10 — деградации (FR-014, FR-017, FR-029)

| Что сломать | Как | Ожидается |
|-------------|-----|-----------|
| Статистика | переименовать период в заведомо пустой (`SUGGESTIONS_STATS_WINDOW_DAYS=0`) | ответ `200`, порядок по `sort_order` |
| Проверка товаров | `HIDE_EMPTY_SUGGESTIONS=false` | показываются все пригодные по остальным фильтрам, ответ `200` |
| Пустой каталог подсказок | отключить все подсказки через админское API | `{"suggestions": []}`, статус `200` |

## Автотесты

```bash
pnpm vitest run src/modules/suggestions           # отбор, веса, часть суток, квота, детерминизм
pnpm vitest run test/integration/suggestions-selection.test.ts
pnpm test                                         # полный прогон перед PR
```

---

## Итоги прогона (2026-10-02, локальный стенд)

Стенд: Postgres 18 локально, боевой каталог сети (264 товара, Тюмень — 183 позиции), база знаний Тюмени — 98 фрагментов `ready`, `EMBEDDING_PROVIDER=mock`, `LLM_PROVIDER=openai`, `MAX_SUGGESTIONS_ON_SCREEN=8` (значение из локального `.env`, не 6).

| Сценарий | Результат |
|----------|-----------|
| 1. Лимит и смешивание | ✅ 8 подсказок (по локальной настройке), из них 1–2 сервисных |
| 2. Стабильность и ротация | ✅ `visit-1` дважды — идентичный состав; `visit-2` — другой |
| 3. Сервисная подсказка | ✅ `delivery_time` → текст «Сроки доставки составляют 90-120 минут…», источник `https://tyumen.sushi-master.ru/delivery`, карточек 0 |
| 4. Город без базы знаний | ✅ Анапа: 0 сервисных в каталоге; контекст `empty` → пустой список со статусом 200 |
| 5. Контексты экрана | ✅ `cart` → только дополнения (2 из 4 доступны в городе), `checkout`/`empty` → только сервисные, `nonsense` ≡ `catalog` |
| 6. Время суток | ⏳ частично: юнит-тесты закрывают окна и пояса; сравнение наборов в обед против вечера на стенде не делалось |
| 7. Диета и исключения | ✅ после перехода на сопоставление по подстроке (ADR-016): `no_fish` без креветок, `veggie_only` без моллюсков, `light_calories` — 53 пригодных товара в Тюмени |
| 8. «Похож на X» | ✅ `like_california` → 4 крабовых ролла, самой «Калифорнии» нет |
| 9. Влияние статистики | ⏳ закрыто тестами (юнит + интеграционный); на стенде событий показов нет — ждёт доработки клиента |
| 10. Деградации | ✅ пустой набор отдаётся как `200` с пустым списком (проверено на контексте `empty` в Анапе) |

### Латентность (T053)

200 запросов списка с разными `session_id` после прогрева кешей, каталог 49 подсказок:

```
ok=200 fail=0 mean=7.5ms p50=7.1ms p95=10ms max=24.7ms
```

SC-006 (p95 ≤ 300 мс) выполнен с большим запасом. Замер делался с поднятыми лимитами троттлинга (`THROTTLE_STANDARD_LIMIT`), иначе 60 запросов в минуту отсекаются.

### Порог калорийности (T033)

`products.calories`: 264 значения, min 0, max 1200, p25 = 189 — значение похоже на ккал. При `calories_max = 200` в Тюмени пригодны 53 позиции, подсказка `light_calories` отвечает карточками. Порог оставлен в подсказке (не в коде) и может быть уточнён администратором.

### Не закрыто на стенде

- **T054** (базовая линия SC-003/SC-004 по `ai_logs` и `assistant_suggestion_events`) — локально в `ai_logs` только записи этого прогона; нужен замер на проде до и после раскатки.
- **Качество выдачи новых пресетов на реальных векторах**: локально `EMBEDDING_PROVIDER=mock`, поэтому векторная половина гибридного поиска бессмысленна. Так, `sauces_addons` при 17 пригодных товарах получил шортлист из 1 позиции и вернул 0 карточек. Проверять на проде с `EMBEDDING_PROVIDER=openai`.
- **Пробел в данных каталога**: подсказки `drinks` и `dessert` скрыты в Тюмени, потому что справочник называет категорию «Десерты и напитки», а товары несут `category_name = "Десерты"` — фильтр по имени не совпадает (тот же класс расхождения, что в ADR-012). Пресет `sauces_addons` обойдён через категорию «Дополнительно».
