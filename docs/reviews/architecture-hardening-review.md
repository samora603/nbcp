# Architecture Hardening Review

| Field | Value |
| --- | --- |
| **Review type** | Architecture governance & operational readiness (pre-implementation) |
| **Inputs** | [Shared Domains Review](shared-domains-review.md) (8/10) · [Platform Architecture Review](platform-architecture-review.md) (8.5/10) · [Kernel Review](kernel-review.md) |
| **Direction status** | **Approved** — this review does not reopen ADR-0001/0002 layering |
| **Evidence** | Full `docs/` corpus (ADRs, architecture, module designs, reviews, standards, runbooks) |
| **Date** | 2026-07-14 |
| **Constraint** | Documentation only — no application code, no framework scaffolding |

**Priority gaps in scope (from prior reviews):** S-01 · S-02 · S-03 · P-01 · P-02 · P-03 · P-04 · P-09

---

## 1. Executive summary

Architecture **direction is sound and approved**. What remains is not “which domain owns Customer,” but whether NBCP can **govern, enforce, and operate** the design under change pressure once code exists.

| Metric | Score |
| --- | --- |
| **Current readiness for implementation** | **6.5 / 10** |
| Design / domain clarity | 8.5 / 10 |
| Event & projection governance | 5.5 / 10 |
| Automated boundary enforcement | 3 / 10 |
| Operational rebuild / retention | 4 / 10 |

### Architecture strengths (cite)

- **Layered platform:** [ADR-0002](../adr/0002-domain-map.md), [domain-map.md](../architecture/domain-map.md), [business-capability-map.md](../architecture/business-capability-map.md) keep Shared industry-neutral.
- **Kernel DAG + remediations:** Identity independence; K-01–K-05 closed in [event-contracts.md](../architecture/event-contracts.md), [ADR-0003](../adr/0003-event-contracts-and-outbox.md), [tenant-access-model.md](../architecture/tenant-access-model.md), [invitation-acceptance-policy.md](../architecture/invitation-acceptance-policy.md).
- **Module discipline:** [module-standard.md](../architecture/module-standard.md) + [`modules/_templates/domain-module/`](../../modules/_templates/domain-module/) define hexagonal shape.
- **Money-path separation:** Payments ↛ Ledger ([payments/design.md](../modules/payments/design.md) §2, §10); Ledger SoR vs Reporting projections ([ledger/design.md](../modules/ledger/design.md) §1–2; [reporting/design.md](../modules/reporting/design.md) §2).

### Highest remaining risks

1. **Projections without retention (S-01)** — Reporting claims rebuildability ([reporting/design.md](../modules/reporting/design.md) §2, §5.3) but no ADR defines event log retention, cold storage, or rebuild RPO/RTO.
2. **Unindexed event surface (S-02 / P-02)** — ~~no event-catalog~~ → **remediated (docs):** [event catalog](../reference/event-catalog.md) (canonical under `docs/reference/`; stub at [architecture/event-catalog.md](../architecture/event-catalog.md)).
3. **Dual financial interpreters (S-03)** — ~~no single mapping-owner document~~ → **remediated:** [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md) (Accepted).
4. **Policy without enforcement (P-01, P-03, P-09)** — CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) only checks file presence; no outbox/boundary/architecture tests exist.
5. **Bootstrap as literature (P-04)** — Org admin sequence is normative in [tenant-access-model.md](../architecture/tenant-access-model.md) §4 but has no mandatory scaffold checklist tied to generators.

### Recommendation

**Conditionally ready** for implementation.

- **Allowed now:** technical workspace scaffolding, module package skeletons from template, database/outbox plumbing, Core Identity/Tenancy **after** hardening ADRs below are accepted.  
- **Not allowed yet:** production money path (Orders → Payments → Ledger → Reporting) or multi-tenant go-live until S-01/S-02/S-03 docs + P-01/P-03 enforcement plans exist.  
- **Not** “Not ready” — domain architecture approval stands; this is a **governance gate**, not a redesign.

---

## 2. Event governance assessment

*References: [ADR-0003](../adr/0003-event-contracts-and-outbox.md); [event-contracts.md](../architecture/event-contracts.md) §§1–6; [eventing.md](../architecture/eventing.md); module `§ Domain events` sections across Core/Shared designs; [audit/design.md](../modules/audit/design.md) §4.1 checklist; [reporting/design.md](../modules/reporting/design.md) §8.*

### 2.1 Event ownership

| Rule (docs) | Status |
| --- | --- |
| Producer module owns contract; export via facade | **Specified** (event-contracts §2.1) |
| No deep imports of infrastructure events | **Specified** (module-standard prohibited patterns) |
| Consumers only take legal DAG edges | **Specified**; Notification/Reporting fan-in still weakly bounded |

**Gap:** Ownership is clear in prose; **no machine-readable ownership table** (S-02).

### 2.2 Event versioning

| Rule | Status |
| --- | --- |
| Envelope `version` field; additive preferred | **Specified** (event-contracts §2.2) |
| Breaking change → version bump or new `type` | **Specified** |
| Compatibility test policy | **Missing** |

**Recommendation:** ADR addendum or § in event-catalog: “consumers must tolerate unknown payload fields; producers must not remove fields within a version.”

### 2.3 Event catalog requirements (S-02 / P-02)

**Current state:** Events are scattered across ~13 design docs. No index answers: *who produces `payments.capture.succeeded`, who must consume it, is Audit mandatory?*

**Required artifact:** `docs/architecture/event-catalog.md` with columns at minimum:

`type | producer | payload schema ref | version | mandatory consumers | audit required | outbox required | retention class`

Populate first from Orders, Payments, Inventory, Ledger, Identity, Tenancy, RBAC checklists.

### 2.4 Replay / rebuild strategy (S-01)

| Claim in docs | Hardening gap |
| --- | --- |
| Reporting rebuild API ([reporting/design.md](../modules/reporting/design.md) §9) | No definition of **event source** for rebuild (outbox archive? dedicated event store?) |
| Ledger balances rebuildable from postings ([ledger/design.md](../modules/ledger/design.md) §5) | Strong for books; **projector** replay still needs upstream events if remapping history |
| Idempotency on `eventId` / `processed_events` | Specified for Reporting; not universal for all projectors |

**Recommendation (concrete):**

1. **ADR-0004 (proposed):** Event retention & rebuild — hot outbox/relay retention (e.g. ≥ 90 days), cold archive (≥ 7 years for financial event classes), rebuild procedure, ownership (platform ops).  
2. Classify events: `SECURITY`, `FINANCIAL`, `OPERATIONAL`, `ANALYTICS` with retention minima.  
3. Runbook: `docs/runbooks/rebuild-projections.md`.

### 2.5 Retention requirements

| Class | Suggested minimum (governance default) | Rationale |
| --- | --- | --- |
| SECURITY (authz changes, password reset, lockout) | Match Audit retention | [audit/design.md](../modules/audit/design.md) §13 |
| FINANCIAL (payments capture/refund, ledger posted, orders committed) | ≥ Audit financial / legal hold | Ledger + Payments designs |
| OPERATIONAL (scheduling cancel, inventory adjust) | ≥ 1–2 years | Dispute windows |
| ANALYTICS-only derived | Rebuildable; raw optional shorter if SoR retained | Reporting |

None of the above is yet an accepted ADR — **blocker for declaring projections production-safe**.

### 2.6 Idempotency expectations

| Mechanism | Where stated | Gap |
| --- | --- | --- |
| `eventId` consumer store | event-contracts §4 | No mandated table name / shared package |
| `(org, source, externalRef)` on Ledger | ledger design §12 | Good; mirror pattern must be catalogued |
| Payments attempt idempotency keys | payments design §5 | Good |
| Inventory `(org, externalRef, type)` | inventory design §13 | Good |

**Recommendation:** Platform standard row: “every projector implements `processed_events(consumer_name, event_id)` OR module-local equivalent documented in event-catalog.”

---

## 3. Ledger vs Reporting assessment (S-03)

*References: [ledger/design.md](../modules/ledger/design.md) §§1–2, §12; [reporting/design.md](../modules/reporting/design.md) §§1–2, §8, §10; [payments/design.md](../modules/payments/design.md) §2; [business-capability-map.md](../architecture/business-capability-map.md) §§6–7, §10; shared-domains-review S-03.*

### 3.1 System of record ownership

| Concern | System of record | Not SoR |
| --- | --- | --- |
| Posted accounting facts | **Ledger** journal entries / postings | Reporting finance dashboards |
| Payment capture/refund attempts | **Payments** | Ledger, Reporting |
| Order commercial commitment | **Orders** | Reporting sales facts |
| Analytical rollups / exports | **Reporting** (as read models only) | — |

**Ambiguity:** Both Ledger and Reporting subscribe to `orders.*` / `payments.*`. Docs say “source wins” for Reporting vs Inventory/Ledger disputes, but do **not** say who owns **revenue recognition mapping** (when to credit Revenue on commit vs capture).

### 3.2 Financial truth boundaries

| Truth | Owner |
| --- | --- |
| “Was money captured?” | Payments |
| “What GL impact was booked?” | Ledger |
| “What does the sales dashboard show?” | Reporting (may lag; non-authoritative) |

**Ambiguity residual:** Inventory valuation COGS posts ([ledger/design.md](../modules/ledger/design.md) §12) marked optional — no flag for when Reporting shows COGS without Ledger posts.

### 3.3 Projection ownership

| Projector | Owner module | Writes |
| --- | --- | --- |
| Payment → journals | Ledger (or apps composer calling Ledger API) | `ledger_*` |
| Order/Payment → sales/collections facts | Reporting | `reporting_*` |
| Order → inventory | Inventory | `inventory_*` |

**Ambiguity:** Whether Ledger handlers live in `@nbcp/ledger` or `apps/worker` is left dual ([ledger/design.md](../modules/ledger/design.md) §11–12). Hardening needs a single default: **prefer Ledger module handlers** for financial posts; apps only for cross-cutting orchestration.

### 3.4 Rebuild responsibilities

| Store | Rebuild from | Owner |
| --- | --- | --- |
| Ledger balances | `ledger_postings` | Ledger |
| Ledger projected posts from payments history | Event archive + Payments/Orders SoR | Ledger ops + retention ADR |
| Reporting facts | Event archive / re-fetch SoR APIs | Reporting ops |

### 3.5 Audit requirements

- Ledger post/reverse: mandatory Audit ([ledger/design.md](../modules/ledger/design.md) §14).  
- Payments capture/refund: mandatory Audit ([payments/design.md](../modules/payments/design.md) §12).  
- Reporting exports: Audit ([reporting/design.md](../modules/reporting/design.md) §13).  

**Ambiguity:** Dashboard-only Reporting projections of revenue are **not** audit substitutes for Ledger.

### 3.6 Concrete recommendation (S-03)

**Delivered:** [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md) (Accepted) · stub [financial-projection-ownership.md](../architecture/financial-projection-ownership.md).

Normative points (see ADR-0005):

1. Default recognition: **Revenue/AR posts on `payments.capture.succeeded`** (and refunds on refund events); Orders commit does **not** post revenue unless a named industry template overrides.  
2. Reporting sales facts may still project `orders.order.committed` for operational sales dashboards — labeled **non-GAAP / non-book**.  
3. Mapping tables (account codes) owned by Ledger chart templates; Reporting must not invent parallel money math.  
4. Dispute procedure: Ledger + Payments win over Reporting.

---

## 4. Platform enforcement assessment

*References: [module-standard.md](../architecture/module-standard.md) §9; [modular-monolith.md](../architecture/modular-monolith.md); [ADR-0003](../adr/0003-event-contracts-and-outbox.md); template README; CI foundation workflow; platform-architecture-review P-09.*

| Enforcement need | Today | Hardening need |
| --- | --- | --- |
| **Dependency rules** | Documented DAG + [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md) (Accepted) | Automate import-graph validation in CI (P-03) |
| **Boundary linting** | Normative in ADR-0006 | Fail CI on deep imports & Shared→Product / Core→Shared |
| **Module templates** | Present (`_templates/domain-module`) | Generator + checklist that new modules must copy template (P-04) |
| **Outbox verification (P-01)** | Normative in ADR-0003 + ADR-0006 | Architecture test: security/financial use cases assert outbox row in same TX; CI job when apps exist |
| **Architecture tests** | File-presence CI only; policy in ADR-0006 | Tests for: Identity ↛ Tenancy reverse; Payments ↛ Ledger; org bootstrap assigns admin; invite email mismatch deny |
| **CI governance (P-09)** | Foundation checks + ADR-0006 gate catalog | Gate: boundary lint + ADR link requirement for module deps changes + event-catalog updated when new `type` added |

**Critical judgment:** Without P-03/P-09, the 8.5/10 platform score will **erode within months of coding**. Governance tooling is not optional polish.

**Outbox enforcement (P-01) specifics:**

1. Shared helper / port: “persist aggregate + outbox in one unit of work.”  
2. Mandatory for event-catalog rows with `outbox required = yes`.  
3. CI contract test suite tagged `@architecture` run on PR.

**Event publication standards (P-02):** Enforce envelope schema validation in publisher port; reject publish missing `eventId`/`type`/`version`/`producer`.

**Bootstrap / scaffolding (P-04):**

1. Document scaffold sequence in `docs/architecture/implementation-bootstrap.md`.  
2. First vertical slice must not skip: outbox table → Identity → Tenancy → RBAC bootstrap composer → Audit consumer.  
3. Generator must refuse modules outside domain-map names without ADR.

---

## 5. Implementation readiness — required artifacts before code generation

Artifacts that **should exist (or be accepted as ADRs/docs) before generating production domain code** beyond empty templates:

| Priority | Artifact | Purpose | Suggested location |
| --- | --- | --- | --- |
| **P0** | Event retention & rebuild ADR | Close S-01 / platform rebuild | `docs/adr/0004-event-retention-and-rebuild.md` |
| **P0** | Event catalog (initial) | Close S-02 / P-02 | `docs/architecture/event-catalog.md` |
| **P0** | Financial projection ownership | Close S-03 | `docs/architecture/financial-projection-ownership.md` **or** `docs/adr/0005-financial-projection-ownership.md` |
| **P0** | Kernel dependency matrix (explicit) | Stop implementer confusion; extend domain-map | `docs/architecture/kernel-dependency-matrix.md` (tenant-access §6 exists—promote/link as standalone index) |
| **P1** | Permission catalog | Unify RBAC seeds (S-04 / prior P-03) | [permission-catalog.md](../reference/permission-catalog.md) |
| **P1** | Implementation bootstrap guide | P-04 scaffolding order | [bootstrap-checklist.md](../implementation/bootstrap-checklist.md) · [core-bootstrap-plan.md](../implementation/core-bootstrap-plan.md) |
| **P1** | Architecture enforcement plan | P-03 / P-09 tooling & CI gates | [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md) · [automation backlog](../implementation/architecture-automation-backlog.md) |
| **P1** | Rebuild projections runbook | Ops for S-01 | [tenant-projection-rebuild.md](../runbooks/tenant-projection-rebuild.md) · [full-reporting-rebuild.md](../runbooks/full-reporting-rebuild.md) · [event-replay.md](../runbooks/event-replay.md) |
| **P1** | Money-path sequence | Orders↔Inventory↔Payments↔Ledger | `docs/architecture/commerce-flow.md` |
| **P2** | Metadata anti-leak standard | S-05 | Section in `module-standard.md` or `docs/standards/metadata.md` |
| **P2** | Audit mandatory events extension | Extend beyond kernel checklist | Section in `event-catalog.md` + audit design |
| **P2** | NFR: async projectors | P-06 prior review | `docs/architecture/nfr-async-projections.md` |
| **P2** | Integrations + Files design stubs | Payments/Notifications/Reporting exports | `docs/modules/integrations/design.md`, `docs/modules/files/design.md` |
| **P3** | Billing/entitlements design | SaaS pack gating | `docs/modules/billing/design.md` |

**Already sufficient (do not block):** domain designs for 13 modules, capability map, module standard, template, tenant access, invitation policy, ADR-0001/0002/0003.

---

## 6. Recommended next ADRs

| ID (suggested) | Title | Closes |
| --- | --- | --- |
| **ADR-0004** | Event retention, archive, and projection rebuild | S-01, related P-01 ops |
| **ADR-0005** | Financial projection ownership (Payments vs Orders recognition; Ledger vs Reporting) | S-03 |
| **ADR-0006** | Architecture enforcement (boundary lint, outbox tests, CI gates) | P-01, P-03, P-09 |
| **ADR-0007** | Commerce fulfillment policy (reserve/issue timing on order commit) | Shared S-06 |
| *(later)* | Auth provider selection | Identity deferred |
| *(later)* | Billing entitlements in authorize path | Platform P-05 |

Event catalog and permission catalog may be **living docs** under architecture/ with ADR-0003/RBAC as authority—ADRs only if contested.

---

## 7. Final verdict

### Readiness score

**6.5 / 10 — Conditionally ready for implementation.**

### Blockers (must close before money-path / multi-tenant production coding goals)

| Blocker | Tied to |
| --- | --- |
| No event retention/rebuild ADR | S-01 |
| No event catalog | S-02 / P-02 |
| No Ledger vs Reporting ownership doc/ADR | S-03 |
| No written enforcement plan for outbox + boundaries + CI | P-01, P-03, P-09 — **remediated:** [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md) (Accepted); automation Pending ([backlog](../implementation/architecture-automation-backlog.md)) |

### Non-blockers (may proceed in parallel with early scaffolds)

| Item | Notes |
| --- | --- |
| Permission catalog | Needed soon; not DAG-breaking |
| Billing/entitlements | Before SaaS packaging, not before Identity skeleton |
| Recurrence / multi-currency / lots | Correctly deferred in designs |
| Cursor rules auto-wire | DX only |
| Full Integrations/Files designs | Before Payments card / export hardening |

### Suggested implementation sequence

```text
1. Accept ADR-0004, ADR-0005, ADR-0006 (or equivalent docs)
2. Publish event-catalog.md + financial-projection-ownership.md
3. Scaffold workspace enforcement (boundary rules + CI hooks) — even before features
4. Outbox + database technical package
5. Identity → Tenancy → RBAC (bootstrap composer) → Audit consumers
6. Parties → Catalog → Orders
7. Payments → Ledger projectors (per ADR-0005)
8. Inventory + Orders policy (ADR-0007)
9. Reporting projectors + rebuild runbook drill
10. Scheduling / Notifications as needed by first vertical
11. First product composition (e.g. restaurant) — thin, id-referencing only
```

**Do not** generate vertical business modules ahead of steps 1–5.

---

## 8. Traceability to prior findings

| Prior ID | Hardening coverage |
| --- | --- |
| S-01 | §2.4–2.5, ADR-0004, runbook, blockers |
| S-02 | §2.3, event-catalog artifact, blockers |
| S-03 | §3 entire, ADR-0005, blockers |
| P-01 | §4 outbox verification, ADR-0006 |
| P-02 | §2.2–2.3, event-catalog, publisher validation |
| P-03 | §4 boundary lint |
| P-04 | §4 bootstrap + implementation-bootstrap.md |
| P-09 | §4 CI governance |

---

## 9. Related documents

- [shared-domains-review.md](shared-domains-review.md)  
- [platform-architecture-review.md](platform-architecture-review.md)  
- [kernel-review.md](kernel-review.md)  
- [event-contracts.md](../architecture/event-contracts.md) · [ADR-0003](../adr/0003-event-contracts-and-outbox.md)  
- [ledger/design.md](../modules/ledger/design.md) · [reporting/design.md](../modules/reporting/design.md) · [payments/design.md](../modules/payments/design.md)
