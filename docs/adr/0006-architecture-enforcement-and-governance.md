# ADR-0006: Architecture Enforcement and Governance

- **Status:** Proposed
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture
- **Tags:** governance, ci, boundaries, outbox, events, modular-monolith, documentation
- **Remediates:** Architecture hardening [P-01](../reviews/architecture-hardening-review.md), [P-03](../reviews/architecture-hardening-review.md), [P-09](../reviews/architecture-hardening-review.md)
- **Depends on:** [ADR-0001](0001-platform-technology-foundation.md), [ADR-0002](0002-domain-map.md), [ADR-0003](0003-event-contracts-and-outbox.md), [ADR-0004](0004-event-retention-replay-rebuild.md), [ADR-0005](0005-financial-truth-and-projection-ownership.md)
- **Companions:** [module-standard.md](../architecture/module-standard.md), [event-contracts.md](../architecture/event-contracts.md), [event catalog](../reference/event-catalog.md)

---

## Context

NBCP is a **modular monolith** ([ADR-0001](0001-platform-technology-foundation.md)) with a **layered domain map** — Product → Shared → Core ([ADR-0002](0002-domain-map.md)) — and **event-driven integration** through producer-owned contracts and a **transactional outbox** ([ADR-0003](0003-event-contracts-and-outbox.md)).

Policy for retention/replay ([ADR-0004](0004-event-retention-replay-rebuild.md)), financial truth ([ADR-0005](0005-financial-truth-and-projection-ownership.md)), and the [event catalog](../reference/event-catalog.md) is now written. Those documents do **not** by themselves stop drift once multiple teams implement and evolve modules in the monorepo.

**Risks without automated governance**

| Risk | Example failure mode |
| --- | --- |
| Boundary erosion | Shared imports Product; Payments writes `ledger_*`; Identity imports Audit |
| Silent reliability loss | SECURITY/FINANCIAL mutations published without same-transaction outbox |
| Event sprawl | New `type` strings in code with no catalog row, owner, or classification |
| Doc / code divergence | Module deps change without ADR or design updates |
| Review fatigue | Humans cannot reliably enforce DAG + outbox + catalog on every PR |

Architecture hardening named these as remaining platform blockers: **P-01** (outbox enforcement), **P-03** (boundary enforcement), **P-09** (CI governance). This ADR defines **mandatory controls** — what must be true and gated — without prescribing a specific linter, test runner, or CI vendor.

---

## Decision

Adopt the following **platform-wide enforcement and governance** rules. They are normative for reviews, scaffolding, and continuous integration. Concrete automation may use any tools that satisfy the gates; absence of tooling is **not** an excuse to waive the rules in code review.

---

### Boundary Enforcement

#### Allowed dependency directions

| From → To | Allowed? |
| --- | --- |
| Product → Shared | Yes |
| Product → Core | Yes (via Shared when Shared owns the facade; direct Core deps only when domain map permits) |
| Shared → Core | Yes |
| Core → Core (per kernel DAG) | Yes only as in [ADR-0002](0002-domain-map.md) / tenant access matrix (e.g. Tenancy → Identity; RBAC → Identity/Tenancy; Audit → Identity/Tenancy) |
| Apps / workers / API hosts → Modules | Yes (composition roots) |
| Modules → technical packages (`packages/*` infra, contracts DTOs) | Yes when packages have **no** reverse domain deps |

**Kernel DAG invariants (non-negotiable)**

* Identity has **zero** module dependencies.
* Identity / Tenancy / RBAC **must not** depend on Audit.
* **Payments must not** write Ledger tables or import Ledger persistence; Ledger consumes payment events ([ADR-0005](0005-financial-truth-and-projection-ownership.md)).
* Shared must **not** depend on Product.
* Core must **not** depend on Shared or Product.

#### Forbidden dependencies

| Forbidden | Reason |
| --- | --- |
| Shared → Product | Layer inversion |
| Core → Shared / Product | Kernel contamination |
| Identity → Tenancy / RBAC / Audit / any Shared/Product | Identity independence |
| Tenancy / RBAC → Audit | Kernel cycle / Audit projection pattern |
| Payments → Ledger (write/persistence) | Financial SoR boundary |
| Module A → Module B `infrastructure/`, `api/`, deep paths | Bypass public facade ([module-standard.md](../architecture/module-standard.md)) |
| Domain layer → Nest/Prisma/HTTP/other modules’ infra | Purity |
| Sync dual-write across module SoRs without saga/outbox design | Reliability / ownership |

#### Cross-module communication rules

1. **Preferred:** Depend on producer **public facade** only (`src/index.ts` / documented exports).  
2. **Side effects:** Prefer **domain events** (outbox → consumers) over cross-module DB writes.  
3. **Queries across SoR:** Call owning module query APIs; do not JOIN foreign tables from another module’s schema in application SQL.  
4. **Host composers** (apps/workers) may orchestrate multiple facades; they must not become a second SoR or invent parallel money math ([ADR-0005](0005-financial-truth-and-projection-ownership.md)).  
5. Event **type** imports follow the same legal dependency direction as the producing module (or pure DTO package with no `modules/*` imports) ([ADR-0003](0003-event-contracts-and-outbox.md)).

#### Shared-domain usage rules

1. New Shared/Core modules require a **domain-map** / ADR-0002 update (or explicit ADR) before scaffolding outside the map.  
2. Shared modules expose reusable capabilities; Product modules compose them and own vertical ARs.  
3. Product events use **product prefixes**; they must not collide with Shared/Core prefixes in the [event catalog](../reference/event-catalog.md).  
4. Table ownership follows module prefixes; no Shared table reused as Product write store.

---

### Outbox Enforcement

Aligns with [ADR-0003](0003-event-contracts-and-outbox.md) and [event-contracts.md](../architecture/event-contracts.md); strengthens **verification** (P-01).

#### Which events require outbox publication

**Mandatory transactional outbox** (same DB transaction as the aggregate mutation) for:

1. All **SECURITY**-classified catalog types (Identity, Tenancy, RBAC, and security-adjacent Parties links, etc.).  
2. All **FINANCIAL**-classified catalog types (Payments success/failure money path, Ledger post/reverse, and other catalog FINANCIAL rows).  
3. Any event marked in module design / catalog as **Audit-mandatory** or **outbox required**.  
4. Material **BUSINESS** lifecycle events that other modules rely on for correctness (at minimum: `orders.order.committed` / `cancelled`, material Inventory stock movements) — treat as mandatory unless an approved exception says otherwise.

**Strongly recommended** for other BUSINESS/OPERATIONAL types that drive cross-module workflows. Best-effort in-process-only publish is **forbidden** for the mandatory classes above.

#### Prohibited direct publication patterns

| Pattern | Status |
| --- | --- |
| Publish to bus/queue **after** commit without an outbox row that was written in the mutation TX | Prohibited for mandatory classes |
| Fire-and-forget in-process handlers as the **only** durability for SECURITY/FINANCIAL | Prohibited |
| Writing consumer SoR (e.g. Audit) **inside** producer modules to “skip” outbox | Prohibited (breaks DAG) |
| Emitting events with incomplete envelopes (`eventId`, `type`, `version`, `occurredAt`, `producer`, `organizationId` where required, `payload`) | Prohibited ([ADR-0003](0003-event-contracts-and-outbox.md)) |
| Publishing a `type` not registered in the event catalog | Prohibited (see Event Governance) |

#### Reliability expectations

1. Mutation + outbox insert are **atomic**: rollback removes both.  
2. Relay publishes **at-least-once**; consumers are **idempotent** on `eventId` (and Ledger additionally on business `externalRef` where applicable).  
3. Unpublished outbox rows are retained and retried per ops policy; poison messages escalate (do not silently drop SECURITY/FINANCIAL).  
4. Retention/archive of published events follows [ADR-0004](0004-event-retention-replay-rebuild.md).

#### Failure handling expectations

1. Relay failure must not corrupt SoR; rows remain pending.  
2. Consumer failure retries with backoff; no at-most-once assumption for money/security.  
3. Architecture tests (when packages exist) must assert: for tagged SECURITY/FINANCIAL use cases, **outbox row present in the same unit of work** as the state change.  
4. Prod incidents involving missing outbox for mandatory classes are **severity-elevated** defects, not UX bugs.

---

### Event Governance

References: [event catalog](../reference/event-catalog.md), [ADR-0004](0004-event-retention-replay-rebuild.md), [ADR-0005](0005-financial-truth-and-projection-ownership.md), [ADR-0003](0003-event-contracts-and-outbox.md).

#### Event registration requirements

1. Every platform `type` emitted in code **must** have a catalog row (Event, Owner, Classification, Consumers, Replayable, Version, Status).  
2. Same-PR or catalog-first: adding a publisher without a catalog update is a **gate failure**.  
3. Classification must be consistent with ADR-0004 retention/replay; FINANCIAL vs Reporting usage must respect ADR-0005 (Reporting is derived; Ledger is books).  
4. Product-prefixed events live in product annexes/catalogs but follow the same naming and ownership rules.

#### Ownership requirements

1. Only the **owner module** publishes its prefix.  
2. Consumers listed in the catalog are the planned set; new permanent consumers should update the catalog.  
3. FINANCIAL projectors to journals are **Ledger-owned** ([ADR-0005](0005-financial-truth-and-projection-ownership.md)); Reporting must not claim book authority.

#### Versioning obligations

1. Additive optional fields within a version; breaking changes require `.vN` or new `type` per catalog Versioning Rules.  
2. Deprecation: Status → Deprecated → Retired with dual-publish window for widely consumed types.  
3. Envelope `version` field remains required at publish time.

---

### Documentation Governance

| Change | Required documentation |
| --- | --- |
| New or materially changed module | `docs/modules/<name>/design.md` (+ README in module package) aligned with [module-standard.md](../architecture/module-standard.md) |
| Layer / DAG / SoR / recognition / outbox policy change | ADR update or new ADR; do not silently edit Accepted ADRs — supersede or amend via new ADR |
| New/changed platform event `type` | [Event catalog](../reference/event-catalog.md) (+ design Event section) |
| User-visible or operator-visible platform behavior | [CHANGELOG](../../CHANGELOG.md) entry under Unreleased |
| New forbidden/allowed dependency | This ADR and/or ADR-0002 + kernel matrix docs |
| Rebuild/replay procedure change | ADR-0004 and/or runbooks |

**Review bar:** PRs that change module dependency edges, outbox behavior, or event types without the matching docs are incomplete — CI should fail when automation exists; until then, CODEOWNERS / architecture review **must** reject.

---

### CI Governance

CI **must** eventually enforce the following **architecture gates**. Tooling is intentionally unspecified; each gate is a pass/fail criterion.

| Gate | What it proves | Relates to |
| --- | --- | --- |
| **Dependency / boundary validation** | Import graph respects allowed directions and forbidden edges; no deep imports across modules | P-03 |
| **Facade-only imports** | Cross-module references resolve only through public exports | P-03 |
| **Kernel invariant checks** | Identity isolation; Identity/Tenancy/RBAC ↛ Audit; Payments ↛ Ledger writes | P-03, ADR-0005 |
| **Outbox compliance tests** | Tagged SECURITY/FINANCIAL (and mandatory BUSINESS) mutations create outbox rows in the same unit of work | P-01 |
| **Envelope validation** | Publisher rejects incomplete envelopes | P-01 / P-02 |
| **Event catalog validation** | Emitted or declared `type`s ⊆ catalog; new types in PR update catalog; no orphan deprecated refs after grace | P-09, Event Governance |
| **ADR / doc presence** | Required foundation ADRs and catalog file exist; module scaffold checklist references domain map | P-09 |
| **Documentation completeness (progressive)** | New `modules/<name>` without design doc fails; dependency PRs link ADR when policy changes | P-09 |
| **Idempotency contract tests** | Consumer re-delivery of same `eventId` does not double-apply side effects (Audit, Ledger externalRef) | ADR-0003 / 0004 |

**Repository foundation era:** File-presence and doc checks are the minimum until packages exist. **As soon as domain packages and an app host exist**, boundary + outbox gates become **blocking** on the default branch — not optional warnings.

**Non-goals for this ADR:** Choosing a specific monorepo lint package, cloud CI product, or language parser. Those are implementation follow-ups.

---

### Exceptions Process

Architectural rules may be waived **temporarily**, never silently.

| Element | Requirement |
| --- | --- |
| **Request** | Written exception in the PR (and optionally `docs/adr/exceptions/` or issue) stating rule, scope (packages/paths), reason, alternative considered |
| **Approval** | Platform architect (or delegated CODEOWNERS architecture owners) **and** owning module maintainers for affected boundaries |
| **Duration** | Explicit **expiration date** (≤ 90 days default; FINANCIAL/SECURITY exceptions ≤ 30 days unless board-level risk acceptance) |
| **Tracking** | Listed in a living exceptions register or labeled issues; expired exceptions fail CI once automation can read them |
| **Renewal** | Requires re-approval; third renewal should convert to ADR change or remove the need |
| **Forbidden to except** | Identity independence; Payments writing `ledger_*`; wiping posted Ledger via Reporting rebuild; publishing SECURITY without durable outbox in production |

Production MONEY path (Orders → Payments → Ledger → Reporting) must not ship with open unboundaried exceptions on P-01/P-03 gates.

---

## Consequences

### Benefits

* Prevents modular-monolith decay as multi-team delivery scales.  
* Makes outbox and DAG rules **verifiable**, not aspirational.  
* Keeps event catalog, ADR-0004/0005, and runtime behavior aligned.  
* Gives reviewers an objective reject rationale and CI a durable gate set.  
* Clarifies that governance is part of “done,” not a post-MVP nice-to-have.

### Costs

* Upfront investment to automate gates and maintain catalog/ADR discipline.  
* Occasional slower PRs when docs must ship with code.  
* False positives possible until allow-lists mature — mitigated by the exceptions process.  
* Scaffolding friction for spike branches (use short-lived exceptions, not permanent bypass).

### Operational impact

* CI becomes a **policy enforcement plane**; ops still own relay health and dual-control FINANCIAL replay ([ADR-0004](0004-event-retention-replay-rebuild.md)).  
* On-call: missing outbox / catalog mismatch are architecture incidents when they affect SECURITY/FINANCIAL.  
* CODEOWNERS paths for `docs/adr/`, `docs/reference/event-catalog.md`, and boundary config must stay staffed.  
* Release managers verify no expired exceptions on shipping money-path features.

---

## Follow-up Actions

### Documentation

1. Optional living guide `docs/architecture/architecture-enforcement.md` that points to this ADR and lists current gate status (Pending / Enabled).  
2. Kernel dependency matrix doc (promotion of tenant-access / domain-map DAG) for implementers.  
3. Update hardening review: P-01 / P-03 / P-09 **docs-remediated** pending automation.  
4. Exception register format (short) when first exception is granted.

### Automation (when coding begins — no specific vendor)

1. **Boundary checker** in CI on `modules/*` and `packages/*` import graphs.  
2. **Architecture test suite** (`@architecture` or equivalent tag): outbox same-TX; Identity isolation; Payments ↛ Ledger; invite/bootstrap invariants as designed.  
3. **Catalog linter:** parse catalog + scan for `type` string literals / consts; fail on unregistered publish.  
4. **Envelope schema** validation at publisher port.  
5. **Doc gates:** new module path ⇒ design.md; event PR ⇒ catalog diff; ADR path presence for 0001–0006.  
6. **Exception expiry** job or CI check against the register.  
7. Progressive enforcement: warn → fail on default branch once baseline clean.

### Explicitly out of scope for this ADR

* Permission catalog (separate artifact).  
* Commerce fulfillment timing (suggested ADR-0007).  
* Choosing Postgres vs Redis for outbox relay locking.  
* Implementing any of the above tools in this change set.

---

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Docs-only forever** | Hardening explicitly requires P-01/P-03/P-09; review-only enforcement fails under load |
| **Trust CODEOWNERS alone** | Necessary but insufficient; humans miss deep imports and missing outbox rows |
| **Mandate one named lint ecosystem in the ADR** | Couples policy to tooling fashion; violates implementation-agnostic constraint |
| **Allow best-effort publish until scale** | Re-opens K-01; unacceptable for SECURITY/FINANCIAL |
| **Grandfather all existing violations indefinitely** | No packages yet; start clean; exceptions must expire |

---

## References

- [ADR-0001](0001-platform-technology-foundation.md) — modular monolith & CI discipline  
- [ADR-0002](0002-domain-map.md) — layering  
- [ADR-0003](0003-event-contracts-and-outbox.md) / [event-contracts.md](../architecture/event-contracts.md)  
- [ADR-0004](0004-event-retention-replay-rebuild.md)  
- [ADR-0005](0005-financial-truth-and-projection-ownership.md)  
- [Event catalog](../reference/event-catalog.md)  
- [module-standard.md](../architecture/module-standard.md)  
- [architecture-hardening-review.md](../reviews/architecture-hardening-review.md) §4  
