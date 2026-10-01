# Contract: CategoryResolverService

**Module**: `CatalogModule` | **File**: `src/modules/catalog/services/category-resolver.service.ts`

Внутренний контракт (сервис не публикуется наружу по HTTP). Публичный HTTP-контракт `/v1/assistant/product-answer` и `/v1/assistant/suggestions` не меняется — меняется только наполнение ответов.

## API

```ts
interface CategoryOption {
  slug: string;
  name: string;
}

interface ResolvedCategory {
  categoryIds: string[];
  labels: string[];
  matched: boolean;
}

class CategoryResolverService {
  /** Разрешает произвольное название категории в идентификаторы каталога. */
  resolve(rn: string, target: string, value: string | null | undefined): Promise<ResolvedCategory>;

  /** Список категорий каталога для передачи распознавателю намерений. */
  listOptions(rn: string, target: string): Promise<CategoryOption[]>;
}
```

## Поведение `resolve`

Вход нормализуется: нижний регистр, обрезка пробелов, схлопывание всех небуквенно-цифровых символов. Та же нормализация применяется к `slug`, `category_id` и `name` каждой активной категории (rn, target).

Набор образцов для поиска = нормализованное входное значение + его синонимы из таблицы (если входное значение — исторический слаг).

Уровни сопоставления, по порядку; берётся первый уровень, давший непустой результат:

| Уровень | Правило |
|---------|---------|
| 1. Точное / словоформенное | нормализованный `slug` / `category_id` / `name` равен образцу, **либо** образец равен отдельному слову `slug`/`name` (так «роллы» находит и «Премиальные роллы») |
| 2. Подстрока | образец входит в `slug`/`name` или наоборот; применяется только при пустом уровне 1, длина образца от 3 символов |

Гарантии:

- `value` пустое/`null` → `{ categoryIds: [], labels: [], matched: false }`.
- Совпало несколько категорий → в `categoryIds` все их `category_id` без дублей (FR-004).
- Ничего не совпало → `matched: false`; вызывающий код обязан не применять фильтр по категории (FR-005).
- Ошибка чтения справочника → `matched: false`, исключение наружу не выбрасывается (FR-008).
- Регистр и обрамляющие пробелы на результат не влияют (FR-002).

## Поведение `listOptions`

- Возвращает активные категории (rn, target) как `{ slug, name }`, не более 40, в порядке справочника.
- Пустой справочник или ошибка чтения → исторический список: `roll, set, drink, sauce, dessert, hot` (имена совпадают со слагами) (FR-008).

## Кэш

- Ключ `"<rn>|<target>"`, TTL 5 минут, хранение в памяти процесса.
- `resolve` и `listOptions` читают один и тот же кэш.
- Сбой чтения не кэшируется.

## Контракты потребителей

| Потребитель | Изменение |
|-------------|-----------|
| `ShortlistBuilderService.build` | принимает `rn`/`target`, вызывает `resolve(slots.category)`, передаёт `categoryIds` в `CatalogFilters`; при `matched: false` поле не заполняется |
| `SuggestionService.checkProductsExist` | то же разрешение перед `findByCity`, иначе пресеты с категорией скрываются при наличии товаров (FR-006) |
| `HybridRetrieverService.computeScore` | бонус +20 начисляется, если `filters.categoryIds` содержит `product.categoryId` |
| `IntentSlotParserService.parse` | принимает `rn`/`target`, подставляет `listOptions` в `knownCategories` (FR-007) |
| `AssistantOrchestratorService` | прокидывает `rn`/`target` в парсер и шортлист; передаёт отображаемое имя категории в fallback (FR-010) |
| `FallbackService.forEmptyResult` | принимает необязательное отображаемое имя категории; при отсутствии — печатает исходное значение слота, как сейчас |

## Обратная совместимость

- Формат ответа API не меняется.
- Данные пресетов (`suggestions.payload.slots.category`) не мигрируются.
- Сид-данные и mock-клиент продолжают работать: там `slug` и `category_id` совпадают со слотом, срабатывает уровень 1.
