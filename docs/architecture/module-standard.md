# NBCP Module Standard

**Status:** Normative  
**Applies to:** Every domain module under `modules/` (Core Platform, Shared Business, and Product-Specific)  
**Stack target:** NestJS (composition / transport) + Prisma (persistence adapter) per [ADR-0001](../adr/0001-platform-technology-foundation.md)  
**Domain placement:** [domain-map.md](domain-map.md) / [ADR-0002](../adr/0002-domain-map.md)  
**Canonical template:** [`modules/_templates/domain-module/`](../../modules/_templates/domain-module/)

This standard defines the mandatory internal structure, boundaries, and prohibited patterns for NBCP modules. Generators, reviews, and CI gates ([ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)) must enforce it. Deviation requires an ADR (or a time-boxed exception per ADR-0006).

---

## 1. What a module is

A **module** is one bounded context with:

- A single primary responsibility aligned to the [domain map](domain-map.md)
- Its own domain model and use cases
- A narrow **public facade** (`src/index.ts`) for other modules
- Optional HTTP/API surface for apps to mount
- Owned database tables (prefix or ownership metadata)
- Owned domain events (published and optionally consumed)

Modules live at `modules/<name>/` (never invent alternate skeletons). Copy from `modules/_templates/domain-module/` or use the generator when available.

---

## 2. Mandatory directory structure

```text
modules/<name>/
├── package.json                 # @nbcp/<name>
├── README.md                    # purpose, layer, facade, deps, non-goals
├── tsconfig.json
├── src/
│   ├── index.ts                 # PUBLIC FACADE — only export surface for other modules
│   ├── <name>.module.ts         # NestJS module wiring (infrastructure + api)
│   ├── domain/                  # Pure domain — NO NestJS, NO Prisma
│   │   ├── entities/            # Aggregates / entities
│   │   ├── value-objects/
│   │   ├── events/              # Domain event types (facts that occurred)
│   │   ├── repositories/        # Repository PORT interfaces (no Prisma types)
│   │   └── errors/              # Domain errors
│   ├── application/             # Use cases / commands / queries / ports
│   │   ├── use-cases/
│   │   ├── dto/                 # Application DTOs (not HTTP-specific if avoidable)
│   │   └── ports/               # Extra ports (clock, id generator, event publisher…)
│   ├── infrastructure/          # Adapters — Prisma, queues, external SDKs
│   │   ├── persistence/         # Prisma repositories, mappers
│   │   ├── prisma/              # Module-owned schema fragments / comments (as adopted)
│   │   └── messaging/           # Outbox writer, bus adapters
│   ├── api/                     # Transport — NestJS controllers, HTTP DTOs, guards wiring
│   │   ├── controllers/
│   │   └── http/                # Request/response DTOs, pipes
│   └── events/                  # Publish helpers + consumer handlers for THIS module
│       ├── publishers/
│       └── handlers/            # Consume other modules’ events (idempotent)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── ...
└── openapi/                     # Optional OpenAPI fragments for this module’s HTTP API
```

Notes:

- `src/events/` holds **wiring** for publish/consume. Event **payload types** that are part of the ubiquitous language belong under `domain/events/` and may be re-exported from the facade when other modules must reference them.
- Product-specific modules follow the same shape; they still must not be imported by Core or Shared Business modules.

---

## 3. Layer responsibilities

### 3.1 Domain layer (`src/domain`)

| Concern | Rule |
| --- | --- |
| Responsibility | Enforce invariants; express aggregates, value objects, domain events, domain errors |
| Allowed imports | Pure TypeScript; other files inside this module’s `domain/` only |
| Forbidden imports | NestJS, Prisma, Express, BullMQ, HTTP types, other modules’ infrastructure |
| Persistence | Define repository **interfaces** (ports) only — no SQL/Prisma |

### 3.2 Application layer (`src/application`)

| Concern | Rule |
| --- | --- |
| Responsibility | Orchestrate use cases (commands/queries); transaction boundaries at this layer; authorize via RBAC port; publish domain events after success |
| Allowed imports | This module’s `domain/`; application ports; shared technical packages (`errors`, `logger` contracts) |
| Forbidden imports | Prisma clients, NestJS controllers, other modules’ repositories |
| Controllers | Must not live here — keep use cases invokable from HTTP, workers, and CLIs |

### 3.3 Infrastructure layer (`src/infrastructure`)

| Concern | Rule |
| --- | --- |
| Responsibility | Implement ports with Prisma, Redis, email, PSP SDKs, outbox, etc. |
| Allowed imports | Domain ports/entities for mapping; Prisma; NestJS providers as needed |
| Forbidden | Business invariants that belong in domain; calling other modules’ Prisma models |
| Mapping | Map persistence records ↔ domain explicitly |

### 3.4 API layer (`src/api`)

| Concern | Rule |
| --- | --- |
| Responsibility | HTTP (or RPC) adapters: validate transport DTOs, map to use-case input, map results/errors to HTTP |
| Allowed imports | Application use cases; NestJS; HTTP DTOs |
| Forbidden | Direct Prisma access; domain invariant logic beyond mapping |
| Thinness | Controllers stay thin — no multi-step orchestration beyond one use case call |

### 3.5 Events packaging (`src/events`)

| Concern | Rule |
| --- | --- |
| Publish | Application records domain events; infrastructure persists outbox / dispatches |
| Consume | Handlers invoke **this** module’s use cases; handlers must be **idempotent** |
| Forbidden | Handlers that write another module’s tables; dual-write “convenience” across modules |

### 3.6 Public API boundary (`src/index.ts`)

The facade is the **only** legal import path for other modules:

```ts
// Allowed
import { ExampleFacade, ExampleCreatedEvent } from '@nbcp/example';

// Forbidden
import { PrismaExampleRepository } from '@nbcp/example/src/infrastructure/...';
```

Export only:

- Facade service / application API types needed by peers
- Domain event types peers may subscribe to
- Stable error types peers may catch
- NestJS `DynamicModule` registration helper for the host app (optional)

Do **not** export Prisma models, repository implementations, or controllers for peer use.

---

## 4. Event publishing

1. Aggregates / use cases create **domain events** (past-tense names: `ExampleCreated`).
2. Use case collects events and passes them to an `EventPublisher` / outbox port **in the same transaction** as the state write when reliability is required ([eventing.md](eventing.md)).
3. Payload versions are additive; breaking changes require a new event name or version field.
4. Events that other modules consume are part of the module’s public language — document them in the module README.

## 5. Event consumption

1. Consumers live in the **consuming** module under `src/events/handlers/`.
2. Map foreign events → local use cases; never reach into the publisher’s database.
3. Handlers must tolerate at-least-once delivery (idempotency keys / natural keys).
4. Failures retry via worker/outbox policies — do not block the publisher’s request thread for heavy work when async is required.

---

## 6. Database ownership

| Rule | Detail |
| --- | --- |
| Ownership | Each table belongs to exactly one module |
| Naming | Prefer module prefix (`identity_`, `tenancy_`, `orders_`, …) |
| Writes | Only the owning module’s repositories may INSERT/UPDATE/DELETE that table |
| Reads across modules | Prefer public facade queries or published read models / events — not ad-hoc joins into foreign tables |
| Foreign keys across modules | Discouraged; require ADR if used; prefer store opaque IDs |
| Migrations | Coordinated pipeline allowed; ownership metadata must remain clear |
| Multi-tenancy | Tenant-owned tables include `organization_id` (and location when required); filters applied in repositories / policies ([tenancy-model.md](tenancy-model.md)) |

**Prisma:** One logical database; module fragments or clearly owned models. A module’s Prisma repository may only touch **its** models.

---

## 7. Testing strategy

Align with [testing standards](../standards/testing.md):

| Layer | What to test | Tooling (planned) |
| --- | --- | --- |
| Unit — domain | Invariants, calculations, event emission on aggregate | Vitest — no Nest/Prisma |
| Unit — application | Use-case orchestration with mocked ports | Vitest |
| Integration | Prisma repositories, tenant isolation, outbox write | Vitest + Testcontainers |
| API | Controller mapping / validation (lightweight) | Vitest / Nest testing |
| Contract | Public facade + OpenAPI stability | Later |

**Mandatory for tenant-owned modules:** at least one integration test proving organization A cannot read organization B’s rows.

Money modules (`orders`, `payments`, `ledger`) require invariant-focused tests beyond CRUD smoke.

---

## 8. NestJS + Prisma conventions

1. Domain and application remain Nest-agnostic where practical; wire with Nest providers in `<name>.module.ts`.
2. Bind port → adapter with constructor injection (`ExampleRepository` interface → `PrismaExampleRepository`).
3. Controllers depend on use cases (or a narrow application service), not repositories.
4. Prisma client is infrastructure; inject via a module-local or shared database package — never into domain classes.
5. Guards/interceptors for authz may wrap API routes; **authorization decisions** for mutations still belong in application services using an RBAC port.

---

## 9. Prohibited patterns

| Pattern | Why banned |
| --- | --- |
| **Cross-module repository access** | Importing or injecting another module’s repository / Prisma model breaks ownership and extractability |
| **Deep imports** | `import … from '@nbcp/x/src/infrastructure/...'` bypasses the facade and couples to internals |
| **Shared database writes** | Module A updating Module B’s tables (including “helpful” triggers in A’s migration) |
| **Circular dependencies** | A→B and B→A at module package level — split with events or a smaller shared kernel package only via ADR |
| **Framework types in domain** | Nest decorators / Prisma types on aggregates |
| **Fat controllers** | Business workflows implemented in controllers |
| **Product concepts in Core/Shared** | Violates ADR-0002 anti-leak rules |
| **Sync dual-write across modules** | Two modules written in one request without explicit saga/outbox design |

Reviews and boundary lint (when enabled) treat these as defects.

---

## 10. Module README checklist

Every module README must include:

1. Domain map layer (Core / Shared / Product-Specific)
2. Responsibility (one paragraph)
3. Public facade exports
4. Allowed dependencies (module names)
5. Tables owned
6. Events published / consumed
7. Explicit non-goals
8. Owners (CODEOWNERS path)

---

## 11. Canonical example

See the placeholder template (not a real business module):

[`modules/_templates/domain-module/`](../../modules/_templates/domain-module/)

It demonstrates:

- Aggregate + domain event
- Repository port
- Use case
- Prisma-shaped infrastructure stub
- NestJS controller
- Event publisher/handler stubs
- Public `index.ts` facade

Copy this tree when creating `modules/<name>/`. Replace `example` names; do not ship restaurant/hotel concepts inside Core or Shared modules.

---

## 12. Related documents

- [modular-monolith.md](modular-monolith.md)
- [domain-map.md](domain-map.md)
- [eventing.md](eventing.md)
- [data-architecture.md](data-architecture.md)
- [tenancy-model.md](tenancy-model.md)
- [coding-typescript.md](../standards/coding-typescript.md)
- [testing.md](../standards/testing.md)
