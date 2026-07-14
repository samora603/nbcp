# React / Next.js Coding Standards

## Baseline

- Next.js App Router for web applications.
- Shared design tokens and primitives from a future `packages/ui`.

## Conventions

1. Colocate feature UI with the feature ownership boundary.
2. Prefer Server Components for data fetching where appropriate; mark client components explicitly.
3. Do not encode security rules only in the UI.
4. Keep components accessible (see [accessibility.md](accessibility.md)).
5. Avoid introducing one-off visual systems outside the design tokens.
6. Prefer predictable folder structure over novel micro-architectures per page.

## State & data

- Server remains source of truth for permissions and tenant scope.
- Client caches must not become a second authorization layer.

## Status

No React applications exist in Phase 0.1. These standards apply when frontend packages are scaffolded.
