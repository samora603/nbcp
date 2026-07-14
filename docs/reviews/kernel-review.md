# NBCP Platform Kernel Review

| Field | Value |
| --- | --- |
| **Review type** | Architecture review (design-level) |
| **Scope** | Identity, Tenancy, RBAC, Audit + ADR-0001, ADR-0002, domain map |
| **Evidence** | Documentation only — no runtime modules implemented |
| **Reviewer stance** | Principal enterprise architect |
| **Date** | 2026-07-14 |
| **Status** | Accepted for remediation tracking |

**Documents reviewed**

- [`docs/modules/identity/design.md`](../modules/identity/design.md)
- [`docs/modules/tenancy/design.md`](../modules/tenancy/design.md)
- [`docs/modules/rbac/design.md`](../modules/rbac/design.md)
- [`docs/modules/audit/design.md`](../modules/audit/design.md)
- [`docs/architecture/domain-map.md`](../architecture/domain-map.md)
- [`docs/adr/0001-platform-technology-foundation.md`](../adr/0001-platform-technology-foundation.md)
- [`docs/adr/0002-domain-map.md`](../adr/0002-domain-map.md)

**Implementation performed:** None

---

## 1. Executive summary

The NBCP platform kernel designs form a **coherent, enterprise-grade Core** aligned with the modular monolith ([ADR-0001](../adr/0001-platform-technology-foundation.md)) and domain map ([ADR-0002](../adr/0002-domain-map.md)). Dependency direction is **fundamentally correct**: Identity is a true kernel; Tenancy, RBAC, and Audit point inward via facades and opaque ids; Identity/Tenancy/RBAC are forbidden from importing Audit or creating package cycles.

The largest residual risks are not “wrong models” but **integration seams that can recreate cycles or privilege gaps in implementation**:

1. **Owner authority dual-channel** — Tenancy `ownerPrincipalId` vs RBAC `organization.administrator` assignment must stay synchronized via explicit bootstrap (today documented, not enforceable).
2. **Membership location vs assignment location** — two location semantics can diverge without a clarity ADR.
3. **Audit durability vs AuthZ fail-closed** — intentional asymmetry must be operationalized (outbox + idempotent consumers) or security events will silently vanish under handler failure.
4. **Missing shared event-contracts package** — importing concrete module packages for event types is the most likely future cyclic-dependency footgun.
5. **Invitation email bridging** — Tenancy stores invitee email while Identity owns email truth; accept flows need a strict matching policy.

Overall, the kernel is **ready to proceed to scaffolding** once the recommended corrections (especially contracts, bootstrap ownership, and outbox standards) are accepted as binding follow-ups.

| Score dimension | Score (1–10) | Comment |
| --- | --- | --- |
| **Overall architecture** | **8** | Clear seams; residual integration risks |
| **Dependency hygiene** | **9** | Documented DAG is sound |
| **Security / authz** | **8** | Deny-by-default strong; bootstrap & audit gaps |
| **Multi-tenant readiness** | **8** | Model correct; enforcement still design-only |
| **Event / integration readiness** | **6** | Direction good; platform contracts/outbox thin |
| **SaaS scalability (design)** | **7** | Fits modular monolith; hot paths & audit volume need ADRs later |

---

## 2. Dependency graph assessment

### 2.1 Declared package dependency DAG

```text
                    ┌─────────────┐
                    │  identity   │  (no module deps)
                    └──────┬──────┘
                           │ PrincipalId (facade)
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ tenancy  │ │   rbac   │ │  audit   │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             │            │ uses       │ refs / optional validate
             │            ├────────────┤
             │            │ Org/Loc/   │
             │            │ Membership │
             ▼            ▼            │
        (opaque ids to shared/product modules)
             │            │            │
             └────────────┴────────────┘
                  higher modules may depend on
                  identity | tenancy | rbac | audit
```

| Edge | Status | Notes |
| --- | --- | --- |
| Identity → ∅ | **Pass** | Kernel; matches domain map |
| Tenancy → Identity | **Pass** | Facade + `PrincipalId` only |
| RBAC → Identity, Tenancy | **Pass** | Authorize requires membership |
| Audit → Identity, Tenancy | **Pass** | Refs; optional validation |
| Identity → Tenancy/RBAC/Audit | **Forbidden / Pass** | Explicitly banned |
| Tenancy → RBAC/Audit | **Forbidden / Pass** | Explicitly banned |
| RBAC → Audit | **Forbidden / Pass** | Events/handlers instead |
| Shared/Product → Core | **Allowed** | Domain map |

**Verdict:** Declared module dependencies are **acyclic and layer-correct**.

### 2.2 Hidden coupling (non-package)

| Coupling | Risk | Assessment |
| --- | --- | --- |
| Tenancy `suggestedRoleKey` ↔ RBAC role keys | String contract drift | **Medium** — undocumented registry |
| Tenancy `ownerPrincipalId` ↔ RBAC admin role | Dual authority | **High** if bootstrap missed |
| Membership `locationId` ↔ Assignment `locationId` | Semantic collision | **High** without clarification |
| Invitation `email` ↔ Identity `email` | Join-by-string | **Medium** |
| Audit action keys ↔ domain event type names | Naming drift | **Low–Medium** |
| App-host orchestration (register → createOrg → assignRole) | Knowledge in apps, not modules | **Acceptable** if standardized |

### 2.3 Future cyclic dependency risks

| Risk scenario | How it appears | Mitigation |
| --- | --- | --- |
| RBAC imports Tenancy events **and** Tenancy starts calling `authorize` on membership mutations | Package cycle tenancy ↔ rbac | Keep Tenancy free of RBAC; authz only in app services of other modules / API host |
| Audit handler package lives inside `@nbcp/tenancy` | Accidental reverse dep | Handlers belong in `@nbcp/audit` or `apps/*` composers |
| Shared `@nbcp/events` not created; modules import each other’s `domain/events` deeply | Deep import cycles | **Publish event DTOs via facades or `packages/contracts`** |
| Identity loads org list at login via Tenancy | Identity → Tenancy | Forbidden; keep org picker in app after session resolve |
| Audit query calls RBAC inside Audit module | audit → rbac; later rbac audits via audit handlers → soft cycle pressure | Keep read authz in API host (as designed) |

**Verdict:** Cycles are **avoidable** if event contracts and bootstrap ownership stay outside Identity/Tenancy packages.

---

## 3. Security assessment

### Strengths

- Clear AuthN / AuthZ / Tenant / Audit separation of concerns.
- Session tokens and reset tokens hashed at rest (Identity).
- Deny-by-default RBAC with membership precondition.
- No implicit “owner bypasses RBAC” — owner must receive an assignment.
- Append-only Audit with redaction deny-list and insert-only DB posture.
- Anti-enumeration guidance on login/reset (Identity); invitation accept binds authenticated `PrincipalId`.

### Gaps / concerns

| Topic | Severity | Detail |
| --- | --- | --- |
| Admin bootstrap gap | **High** | New org without admin role assignment = owner locked out of management APIs that only check RBAC |
| AuthZ denial auditing | **Medium** | Optional/sampled; brute-force on APIs may be under-audited vs login lockout |
| Audit fail-open on directory validation | **Medium** | Correct for durability; enable anomalous actor ids — monitor `validation=skipped` |
| MFA deferred | **Medium** (roadmap) | Acceptable for design stage; elevate before high-assurance tenants |
| Break-glass paths | **Medium** | Mentioned; not fully specified (platform operator model) |
| Rate limiting | **Low–Medium** | Stated as production requirement; not yet a platform standard ADR |

### Authorization model validation

| Criterion | Result |
| --- | --- |
| Deny by default | **Pass** |
| Org-scoped evaluation | **Pass** |
| Location-scoped evaluation | **Pass** (exact match v1) |
| Server-side enforcement intent | **Pass** |
| Identity/Tenancy free of RBAC | **Pass** |
| Permission catalog extensibility | **Pass** (product packs) |

---

## 4. Multi-tenant assessment

### Strengths

- Organization as sole primary tenant boundary; locations nested.
- `resolveTenantContext` as mandatory gateway for tenant-scoped work.
- Global Identity principals enable true multi-org SaaS users (good).
- Business modules instructed to carry `organization_id` (+ optional location).
- Soft-delete / suspend org policies deny new memberships.

### Assumptions to treat as binding

1. **Row-level shared schema** remains the isolation strategy until a regulated vertical forces otherwise (ADR-0001/tenancy model).
2. **Repository-level tenant predicates** are non-negotiable in implementation (design cannot enforce yet).
3. **Identity rows are not org-scoped** — audit and admin UIs must not assume every action has `organizationId`.
4. **Membership active** is required for RBAC allow — suspended members fail closed.

### Weak spots

| Topic | Severity | Detail |
| --- | --- | --- |
| Location on Membership vs Assignment | **High** | Ambiguous which constrains “where can this person act?” |
| Cross-tenant break-glass | **Medium** | Process named; controls unfinished |
| Location inside Organization AR | **Low–Medium** | May need split aggregate under large multi-site tenants |
| No DB RLS mandated yet | **Medium** | App-layer filters alone are brittle without defense-in-depth option |

---

## 5. Event architecture assessment

### Strengths

- Rich, past-tense domain events on Identity, Tenancy, RBAC.
- Audit prefers consuming events for Core (avoids reverse deps).
- Outbox / idempotency mentioned in Audit and module standard.
- Cross-module side effects directed away from shared table writes.

### Gaps

| Topic | Severity | Detail |
| --- | --- | --- |
| No kernel **Event Contract ADR** | **High** | Payload versioning, cloud events shape, idempotency keys not standardized |
| In-process bus assumed early | **Medium** | Fine for monolith; must not skip outbox for security audit projection |
| Audit lag / loss on handler failure | **High** | Without transactional outbox, “audited” ≠ “committed” |
| Dual paths (`record()` vs handlers) | **Medium** | Inconsistent producer patterns across modules |
| `audit.record.appended` discouraged | **Pass** | Avoids chatter loops |

**Readiness verdict:** **Directionally ready**, **operationally incomplete** until outbox + contracts are mandatory for security-relevant events.

---

## 6. Auditability model validation

| Criterion | Result |
| --- | --- |
| Append-only | **Pass** |
| Actor / org / location / action / target / metadata | **Pass** |
| Usable by future modules | **Pass** |
| Identity/Tenancy/RBAC do not depend on Audit | **Pass** |
| Examples (role assign, membership remove, password reset, stock adjust, payment capture) | **Pass** |
| Retention / archive / legal hold thinking | **Pass** (design-level) |
| Tamper-evidence (hash chain / WORM) | **Deferred** — acceptable for v1 with DB grants |

**Critical success factor:** Security events from Identity/Tenancy/RBAC must be covered by a **mandatory consumer checklist** before production hardening — documentation alone will not guarantee coverage.

---

## 7. SaaS scalability assessment

| Concern | Assessment |
| --- | --- |
| Modular monolith hosting many tenants | **Appropriate** for current ADRs |
| Global users + N orgs per user | **Supported** by kernel split |
| `authorize` + membership on hot paths | Need caching (RBAC doc) + fail-closed; watch latency |
| Audit table growth | Partition/archive strategy required before multi-year SaaS scale |
| Entitlements (`billing`) | Named in domain map; **not yet integrated** into kernel request path — required before pack gating |
| Horizontal scale of Identity sessions | Redis/session store TBD in infra ADR |
| Multi-region / residency | Deferred — correct for now |

**Verdict:** Kernel design **supports SaaS** without fork-per-tenant; scalability limits will appear in **audit volume**, **authz QPS**, and **billing entitlements**, not in the Identity↔Tenancy↔RBAC story itself.

---

## 8. Findings by severity

### Critical

| ID | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| **K-01** | Security-relevant audit projection lacks a **mandatory outbox + idempotent consumer** standard | Audit §9–12; eventing still directional | Production incidents with missing audit trails; compliance failure |

*No other true blockers in the static designs.* Bootstrap (K-02) is **High** because it can brick org admin UX / force unsafe bypasses.

### High

| ID | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| **K-02** | Org owner privilege depends on **external bootstrap** of RBAC admin role | RBAC §8.1, §13.1; Tenancy ownership | Owner without role → deny-all admin APIs or pressure to add owner bypass |
| **K-03** | Dual location semantics (membership vs assignment) unspecified | Tenancy membership; RBAC assignment | Incorrect allow/deny; confused product UX |
| **K-04** | No shared **event contracts** package/ADR | Cross-module event imports | Likely cyclic or deep-import coupling during implementation |
| **K-05** | Invitation-email ↔ Identity-email matching policy incomplete | Tenancy invitations; Identity email uniqueness | Account takeover / wrong-principal accept edge cases |

### Medium

| ID | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| **K-06** | `suggestedRoleKey` is an undeclared cross-module contract | Tenancy invite; RBAC templates | Silent no-op role assignment on accept |
| **K-07** | Audit fail-open vs AuthZ fail-closed asymmetry undocumented in ops runbooks | Audit §9; RBAC §8.3 | Misconfigured monitoring |
| **K-08** | AuthZ denial not first-class auditable | RBAC §7; Audit outcomes | Weaker detection of permission probing |
| **K-09** | Platform break-glass / operator model under-specified | All four designs mention; none complete | Risky production support paths |
| **K-10** | Domain map Audit “depends on Identity/Tenancy” vs “used by all” vs “RBAC must not depend on Audit” needs a single **kernel dependency matrix** diagram in domain-map | domain-map §4.x vs audit design | Implementer confusion |
| **K-11** | Billing/entitlements not in request pipeline yet | domain-map billing | Pack features ungated in early SaaS |

### Low

| ID | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| **K-12** | Location aggregate vs entity trade-off deferred | Tenancy §3 | Refactor later under load |
| **K-13** | MFA / SSO provider ADRs still open | Identity non-goals | Expected sequencing |
| **K-14** | Tamper-evident audit storage deferred | Audit §14 | Acceptable v1 |

---

## 9. Recommended corrections

Prioritized for architectural correctness before implementation velocity.

### Immediate (before / with first scaffolds)

1. **Publish a Kernel Dependency Matrix** (short ADR or domain-map section) locking the DAG in §2.1 and explicit “who may import audit/rbac.”
2. **ADR: Domain Event Contracts** — `packages/contracts` (or per-module facade exports only), versioning, idempotency key = event id, outbox required for security events.
3. **ADR: Org Bootstrap Sequence** — atomic/composer steps: `createOrganization` → `ensureSystemRoles` → `assignRole(organization.administrator)` with automated test; forbid owner bypass.
4. **Clarify location scope** — document that **RBAC assignment location** governs authorization; membership `locationId` is organizational affinity only (or remove membership location until needed).
5. **Invitation accept policy** — require authenticated principal; verify Identity email matches invite email when invite is email-bound (or switch invites to `principalId` after account exists).

### Short-term

6. Registry for **system role keys** / `suggestedRoleKey` validation on invite create.
7. Mandatory Audit consumers checklist for Identity/Tenancy/RBAC events + CI coverage test (“event emitted ⇒ audit row”).
8. Standardize producer pattern: Core → events→Audit; Shared → `audit.record` in same app transaction/outbox.
9. Sample **authz denial** audit (rate-limited) for sensitive permissions.
10. Draft **break-glass** runbook + permissions (`platform.tenant.impersonate` reserved, never in tenant roles).

### Long-term

11. Entitlements in authorize path (`billing` check) once packs exist.
12. Audit partition/archive ADR under load.
13. Optional Postgres RLS for `organization_id` defense-in-depth.
14. MFA + SSO provider ADRs before enterprise sales motion.

---

## 10. Objective checklist

| # | Objective | Result |
| --- | --- | --- |
| 1 | Validate dependency direction | **Pass** (documented DAG) |
| 2 | Detect hidden coupling | **Pass** — several non-package couplings noted |
| 3 | Detect future cyclic risks | **Pass** — event import & bootstrap are primary risks |
| 4 | Validate multi-tenant isolation assumptions | **Pass with caveats** (location semantics, RLS) |
| 5 | Validate authorization model | **Pass** (deny-by-default; bootstrap High risk) |
| 6 | Validate auditability model | **Pass with caveats** (outbox/consumers) |
| 7 | Validate event-driven integration readiness | **Conditional Pass** — needs contracts/outbox ADR |
| 8 | Validate SaaS scalability | **Pass for stage** — billing/audit volume follow-ups |

---

## 11. Conclusion

Identity, Tenancy, RBAC, and Audit are **well-bounded Core designs** that correctly keep AuthN, tenancy, AuthZ, and audit trails separable and reusable across verticals. The architecture scores highly on dependency hygiene. Before treating the kernel as implementation-ready for production-bound phases, close **K-01 through K-05**: outbox/contracts, admin bootstrap, location semantics, and invitation identity binding.

**Recommendation:** Accept this review; open follow-up ADRs for event contracts and org bootstrap; then scaffold modules strictly against the DAG and module standard.

---

## 12. Related documents

- Module designs under [`docs/modules/`](../modules/README.md)
- [`docs/architecture/module-standard.md`](../architecture/module-standard.md)
- [`docs/architecture/eventing.md`](../architecture/eventing.md)
- [`docs/architecture/tenancy-model.md`](../architecture/tenancy-model.md)
- [`docs/architecture/authz-model.md`](../architecture/authz-model.md)
