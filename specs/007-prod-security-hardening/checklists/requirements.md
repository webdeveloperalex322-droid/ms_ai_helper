# Specification Quality Checklist: Production Security Hardening (P0)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Валидация: 2026-07-18 при написании (16/16), повторная 2026-07-18 после `/speckit-clarify` (16/16, без регрессий).

Решено при написании спецификации:

- **Публичный контур — способ авторизации.** Клиентский ключ в HTTP-заголовке, проверка единым декларативным механизмом с постоянным по времени сравнением. FR-001, FR-004, FR-005.
- **Разделение ключей.** Клиентский и служебный контуры используют разные секреты, чтобы компрометация распространяемого с браузерным клиентом ключа не давала прав на запись в каталог. FR-002, FR-003.
- **Хранение счётчиков ограничения частоты.** Память процесса — сервис разворачивается в одном экземпляре. Зафиксировано как допущение с условием пересмотра.

Решено на фазе `/speckit-clarify` (5 вопросов, все отвечены):

- **Пороги ограничения частоты — сознательно не фиксируются.** Подбираются на реальном трафике после выкатки. Спецификация требует конфигурируемости и журналирования срабатываний, чтобы подбор опирался на данные. FR-013, FR-013a.
- **Фазовый ввод проверки ключей.** Режим наблюдения → принудительный режим по флагу конфигурации. Снимает потребность в согласованной по времени выкатке клиента и сервиса. Служебный контур режима наблюдения не имеет. FR-010a — FR-010e.
- **Документация остаётся открытой в продакшене** — она рабочий инструмент сторонних интеграторов. Публикуется только клиентский контур; служебные эндпоинты из документа исключены. FR-032 — FR-036. Заменило исходное намерение «закрыть Swagger в проде» из строки Input.
- **Перечень клиентских ключей с меткой владельца у каждого**, вместо единственного разделяемого ключа. Даёт независимый отзыв, атрибуцию трафика и учёт частоты по потребителю. FR-009 — FR-009e.
- **Минимальная длина секретов:** 32 символа для машинно-генерируемых, 12 для пароля администратора. FR-018.

Следствия, выявленные при сверке и внесённые без отдельного вопроса:

- Браузерная интеграция стороннего потребителя требует внесения его домена в список разрешённых источников — иначе формально верный ключ не даёт работоспособности. FR-031a и соответствующий edge case.
- Ключ, встроенный интегратором в публичный фронтенд, становится общедоступным. Учёт частоты по метке владельца локализует последствия и делает злоупотребление наблюдаемым, но не предотвращает его. Зафиксировано в Edge Cases.

Открытых вопросов, блокирующих планирование, не осталось.
