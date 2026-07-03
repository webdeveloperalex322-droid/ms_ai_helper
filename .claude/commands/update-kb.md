# Update Knowledge Base

Review recent git changes and update `docs/knowledge/` to reflect them.

## Steps

1. Run `git log --oneline -20` to see recent commits
2. Run `git diff HEAD~5..HEAD --name-only` to see changed files
3. Read all four KB files: `docs/knowledge/architecture.md`, `modules.md`, `decisions.md`, `glossary.md`
4. For each changed `src/` file, check if it affects:
   - **architecture.md** — request pipeline steps, service call order, fallback branches
   - **modules.md** — module responsibilities, entry points, key exports
   - **decisions.md** — add ADR if a non-obvious design choice was made (newest at top)
   - **glossary.md** — new domain terms introduced
5. Update only what actually changed. Add `STALE:` marker inline for anything you notice is stale but out of scope.
6. Keep KB files short — use `path:line` anchors, never paste code blocks.

## Rules

- KB is a **map**, not a mirror. Point into source; don't duplicate it.
- Only add an ADR if a future reader would otherwise have to reverse-engineer the *why* from code.
- Don't touch files that aren't affected by recent changes.
- Source of truth for API shapes: DTOs/controllers, not README.
