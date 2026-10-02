# Project Knowledge Base

Curated, quick-scan knowledge about **this codebase, its architecture, and the decisions behind it**. Read this _before_ deep-diving `src/` — it's the map, the source is the territory.

Scope: AI Product Assistant backend (MVP) — answers Russian product questions for a sushi delivery service and returns ranked product cards. NestJS 10 + Fastify, PostgreSQL 15 + pgvector, Drizzle ORM.

## Contents

| File                               | What it answers                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md) | The core request pipeline (`/v1/assistant/product-answer`) step by step, with file anchors.        |
| [modules.md](modules.md)           | What each module under `src/modules/` (and `common/`, `database/`, `config/`) does + entry points. |
| [decisions.md](decisions.md)       | The _why_ — ADR-style log of non-obvious design choices. Highest-value file.                       |
| [glossary.md](glossary.md)         | Domain terms: rn / br / target, shortlist, rerank, suggestion preset, slot, chunk, fallback.       |

## Related existing material (don't duplicate — link)

- [../technical_design_ai_product_assistant.md](../technical_design_ai_product_assistant.md) — full technical design.
- [../deploy.md](../deploy.md) — deployment.
- `../../specs/00{1,2,3}-*/` — per-feature spec / plan / data-model / research (spec-kit).
- `../../.specify/memory/constitution.md` — project constitution / principles.
- [../../CLAUDE.md](../../CLAUDE.md) — commands, architecture summary, conventions, gotchas.
- `../../.claude/memory/` — local-run notes (user-specific, e.g. Windows native pgvector).

## Maintenance

- When you make a **non-obvious decision**, add an entry to [decisions.md](decisions.md) (the _why_, not just the _what_).
- When a module's responsibility or key entry point changes, update [modules.md](modules.md).
- Keep files short and cross-linked. This KB is a **map** — point into source with `path:line`, don't paste code that will rot.
- Source of truth for API shapes is the **DTOs/controllers**, never the README (its API examples are known stale).
