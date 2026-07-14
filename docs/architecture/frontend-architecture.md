# Frontend Architecture

## Intent

NBCP web experiences are built with **Next.js (App Router)** and a shared design system package.

## Principles

1. Shared UI primitives and tokens live in a future `packages/ui` package.
2. Product apps compose features; they do not fork the design system.
3. Business invariants are enforced on the server; the UI never sole-enforcers security.
4. Prefer accessible primitives (WCAG 2.2 AA target for product UIs).
5. Feature folders map to modules/products — avoid unowned dumping-ground component trees.
6. Use Server Components where they reduce data waterfalls; client components for interactivity.

## Planned apps (future)

| App | Role |
| --- | --- |
| `web-admin` | Platform / operations console |
| `web-portal` | Tenant-facing product shell |
| Product UIs | Vertical compositions under `products/` or dedicated apps |

## Status

No Next.js applications are scaffolded in Phase 0.1.
