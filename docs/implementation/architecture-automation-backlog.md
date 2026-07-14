# Architecture Automation Backlog

**Status:** WP-06 implemented for Core kernel gates (W0–W2); Shared-era items remain progressive  
**Policy:** [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)  
**Enforcer:** [`@nbcp/architecture-enforcement`](../../tooling/architecture-enforcement/) (`pnpm enforce:architecture`)  
**Related:** [bootstrap-checklist.md](bootstrap-checklist.md), [event catalog](../reference/event-catalog.md), [permission catalog](../reference/permission-catalog.md)  
**Last updated:** 2026-07-14  

Translates ADR-0006 into **automatable capabilities**. Implementers may choose any stack that satisfies the capability. Items are ordered by hardening priority.

---

## 1. Boundary Checks

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| B-01 | Detect imports from Product modules into Shared or Core | CI fail on violation | Done (package DAG; expands with Shared packages) |
| B-02 | Detect Core → Shared or Core → Product imports | CI fail | Done |
| B-03 | Detect Identity → any `modules/*` dependency | CI fail | Done |
| B-04 | Detect Identity / Tenancy / RBAC → Audit | CI fail | Done |
| B-05 | Detect deep imports across modules (non-facade paths) | CI fail | Done |
| B-06 | Detect domain layer importing Nest/Prisma/HTTP/infra | CI fail | Done |

---

## 2. Dependency Validation

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| D-01 | Validate package dependency graph against allow-list DAG | CI fail on edge not in policy | Done (Core allow-list) |
| D-02 | Forbid Payments packages from depending on Ledger persistence/write modules | CI fail | Done (edge + fail-case) |
| D-03 | Allow Audit → Identity/Tenancy; forbid reverse | Covered by B-04 + allow-list | Done |
| D-04 | Flag new module names outside domain map without ADR reference | CI fail or require exception | Progressive (W4) |

---

## 3. Outbox Verification

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| O-01 | Architecture tests: SECURITY use cases write outbox in same unit of work | Tagged suite green | Done (module arch tests + static gate) |
| O-02 | Architecture tests: FINANCIAL capture/refund/post paths write outbox in same UoW | Tagged suite green when modules exist | Deferred (Shared) |
| O-03 | Assert outbox row absent after rolled-back TX | Test green | Done (`@nbcp/outbox` suite) |
| O-04 | Envelope validation rejects missing fields | Unit/integration green | Done |
| O-05 | Consumer idempotency: re-delivery of same `eventId` | Test green (Audit) | Done |

---

## 4. Event Catalog Validation

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| E-01 | Parse canonical catalog; build allow-list of `type` strings | Artifact loaded in CI | Done |
| E-02 | Fail PR if code publishes / declares `type` not in catalog | CI fail | Done (Core `*EventTypes`) |
| E-03 | Fail PR that adds producer code for new type without catalog diff | CI fail | Done (via E-02) |
| E-04 | Warn/fail on references to Deprecated types after grace | Configurable policy | Progressive (W4) |
| E-05 | Require Classification + Replayable present on every row (schema lint) | Doc CI green | Done |

---

## 5. ADR Compliance

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| A-01 | Required ADR files 0001–0006 exist on main | Foundation CI | Done |
| A-02 | Status headers parseable; Accepted ADRs not silently deleted | CI/doc check | Done |
| A-03 | PRs changing dependency policy require ADR link in description or path | Bot or checklist gate | Progressive |
| A-04 | Reporting rebuild tooling paths cannot reference Ledger truncate allow-lists | Arch test when tooling exists | Deferred |

---

## 6. Permission Catalog Validation

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| P-01 | Allow-list permission keys from permission catalog | Loaded in CI | Done |
| P-02 | Fail unknown permission string literals / seed entries | CI fail | Done (Core permission consts) |
| P-03 | RBAC seed ⊆ catalog | Test green | Done |

---

## 7. CI Gates (orchestration)

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| C-01 | Foundation job: required docs/impl paths present | Green | Done |
| C-02 | Boundary/dependency job blocking on default branch | Required check | Done (`governance` job) |
| C-03 | Architecture test job | Required when packages exist | Done |
| C-04 | Catalog validation job | Required before Shared commerce | Done (in enforcer) |
| C-05 | Progressive enforcement: warn → fail with timeline | Documented | Partial (permissions blocking for Core) |
| C-06 | Exception register: expired exceptions fail build | When register exists | Done |

---

## 8. Documentation Completeness

| ID | Capability | Acceptance signal | Status |
| --- | --- | --- | --- |
| DOC-01 | New `modules/<name>/` without `docs/modules/<name>/design.md` fails | CI fail | Done (+ README/CHANGELOG) |
| DOC-02 | CHANGELOG touched when release-note-worthy platform docs ship | Policy/review | Progressive |

---

## Suggested delivery waves

| Wave | When | Items | WP-06 status |
| --- | --- | --- | --- |
| **W0** | Docs era | A-01 extend CI file list | Done |
| **W1** | First packages | B-01…B-06, D-01…D-02, C-02 | Done |
| **W2** | Identity+outbox | O-01, O-03, O-04, C-03 | Done |
| **W3** | Shared commerce | O-02, O-05*, E-01…E-03, A-04, P-01…P-03, C-04 | Core subset done; O-02/A-04 remain |
| **W4** | Multi-team | C-05, C-06, E-04, D-04 | C-06 done; rest progressive |

\*O-05 Audit path implemented early with WP-05.

---

## Non-goals

* Selecting a specific lint framework vendor beyond this package  
* Product-vertical annex automation (later)

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial ADR-0006 automation backlog |
| 1.1 | 2026-07-14 | WP-06 / M6: `@nbcp/architecture-enforcement` implements W0–W2 (+ Core W3 subset) |
