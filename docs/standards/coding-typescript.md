# TypeScript Coding Standards

## Baseline

- Target **TypeScript strict** mode when packages are introduced.
- Prefer explicitness at module public boundaries.
- Ban unconstrained `any` without justification and narrowly scoped suppression.

## Conventions

1. Use descriptive names aligned with the [glossary](../glossary.md).
2. Prefer `unknown` at trust boundaries; narrow before use.
3. Keep domain modules free of NestJS, Prisma, and framework imports.
4. Export only intentional public surfaces from package/module entrypoints.
5. Prefer composition over deep inheritance hierarchies.
6. Avoid default exports in shared libraries unless a framework requires them.
7. Match existing formatting once Prettier/ESLint configs land under `packages/`.

## Errors

- Use typed application/domain errors (future `packages/errors`).
- Never leak internal exception details to public API clients.

## Status

Standards are active as policy. Lint/format tooling packages are not yet scaffolded in Phase 0.1.
