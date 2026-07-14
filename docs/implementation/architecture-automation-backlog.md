# Architecture Automation Backlog

**Status:** Future implementation backlog (capabilities only — no tool selection)  
**Policy:** [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)  
**Related:** [bootstrap-checklist.md](bootstrap-checklist.md), [event catalog](../reference/event-catalog.md), [permission catalog](../reference/permission-catalog.md)  
**Last updated:** 2026-07-14  

Translates ADR-0006 into **automatable capabilities**. Implementers may choose any stack that satisfies the capability. Items are ordered by hardening priority.

---

## 1. Boundary Checks

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| B-01 | Detect imports from Product modules into Shared or Core | CI fail on violation |
| B-02 | Detect Core → Shared or Core → Product imports | CI fail |
| B-03 | Detect Identity → any `modules/*` dependency | CI fail |
| B-04 | Detect Identity / Tenancy / RBAC → Audit | CI fail |
| B-05 | Detect deep imports across modules (non-facade paths) | CI fail |
| B-06 | Detect domain layer importing Nest/Prisma/HTTP/infra | CI fail |

---

## 2. Dependency Validation

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| D-01 | Validate package dependency graph against allow-list DAG | CI fail on edge not in policy |
| D-02 | Forbid Payments packages from depending on Ledger persistence/write modules | CI fail |
| D-03 | Allow Audit → Identity/Tenancy; forbid reverse | Covered by B-04 + allow-list |
| D-04 | Flag new module names outside domain map without ADR reference | CI fail or require exception |

---

## 3. Outbox Verification

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| O-01 | Architecture tests: SECURITY use cases write outbox in same unit of work | Tagged suite green |
| O-02 | Architecture tests: FINANCIAL capture/refund/post paths write outbox in same UoW | Tagged suite green when modules exist |
| O-03 | Assert outbox row absent after rolled-back TX | Test green |
| O-04 | Envelope validation rejects missing `eventId` / `type` / `version` / `producer` / `occurredAt` | Unit/integration green |
| O-05 | Consumer idempotency: re-delivery of same `eventId` does not double-apply | Test green (Audit, Ledger `externalRef`) |

---

## 4. Event Catalog Validation

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| E-01 | Parse canonical catalog; build allow-list of `type` strings | Artifact generated or loaded in CI |
| E-02 | Fail PR if code publishes / declares `type` not in catalog | CI fail |
| E-03 | Fail PR that adds producer code for new type without catalog diff | CI fail |
| E-04 | Warn/fail on references to Deprecated types after grace | Configurable policy |
| E-05 | Require Classification + Replayable present on every row (schema lint) | Doc CI green |

---

## 5. ADR Compliance

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| A-01 | Required ADR files 0001–0006 exist on main | Foundation CI (extend current file checks) |
| A-02 | Status headers parseable; Accepted ADRs not silently deleted | CI/doc check |
| A-03 | PRs changing dependency policy require ADR link in description or path | Bot or checklist gate |
| A-04 | Reporting rebuild tooling paths cannot reference Ledger/Payments/Orders/Audit truncate allow-lists | Arch test when tooling exists |

---

## 6. Permission Catalog Validation

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| P-01 | Allow-list permission keys from permission catalog | Loaded in CI |
| P-02 | Fail unknown permission string literals / seed entries | CI fail (progressive) |
| P-03 | RBAC seed ⊆ catalog | Test green |

---

## 7. CI Gates (orchestration)

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| C-01 | Foundation job: required docs/impl paths present | Green (extend list) |
| C-02 | Boundary/dependency job blocking on default branch | Required check |
| C-03 | Architecture test job (`@architecture` or equivalent) | Required when packages exist |
| C-04 | Catalog validation job | Required before Shared commerce |
| C-05 | Progressive enforcement: warn → fail with timeline | Documented in enforcement stub |
| C-06 | Exception register: expired exceptions fail build | When register exists |

---

## 8. Documentation Completeness

| ID | Capability | Acceptance signal |
| --- | --- | --- |
| DOC-01 | New `modules/<name>/` without `docs/modules/<name>/design.md` fails | CI fail |
| DOC-02 | CHANGELOG touched when release-note-worthy platform docs ship | Policy/review (optional automate) |

---

## Suggested delivery waves

| Wave | When | Items |
| --- | --- | --- |
| **W0** | Now (docs era) | A-01 extend CI file list for readiness package paths |
| **W1** | First packages | B-01…B-06, D-01…D-02, C-02 |
| **W2** | Identity+outbox | O-01, O-03, O-04, C-03 |
| **W3** | Shared commerce | O-02, O-05, E-01…E-03, A-04, P-01…P-03, C-04 |
| **W4** | Multi-team | C-05, C-06, E-04, D-04 |

---

## Non-goals

* Selecting a specific lint framework, test runner, or CI vendor  
* Implementing gates in this documentation change  
* Expanding product-vertical catalogs automation (later annex)

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | 2026-07-14 | Initial ADR-0006 automation backlog |
