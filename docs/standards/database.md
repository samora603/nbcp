# Database Standards

## Baseline

- PostgreSQL via Supabase
- Prisma for schema and migrations ([ADR-0001](../adr/0001-platform-technology-foundation.md))

## Rules

1. Every migration is reviewed; never edit applied migrations on shared branches.
2. Tenant-owned tables include organization scope and are filtered by default in repositories.
3. Prefer clear table ownership per module.
4. Use parameterized access only (Prisma / query builders) — no string-concatenated SQL for user input.
5. Indexes are designed intentionally for expected access paths; document unusual ones.
6. Soft delete only with an explicit retention reason.
7. Secrets and connection strings stay outside git.

## Naming

- Prefer `snake_case` for database identifiers.
- Align domain names with the [glossary](../glossary.md).

## Status

No Prisma schema exists in Phase 0.1.
