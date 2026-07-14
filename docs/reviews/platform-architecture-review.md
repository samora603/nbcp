# Platform Architecture Review

| Field | Value |
| --- | --- |
| **Review type** | Holistic platform architecture review (design-level) |
| **Scope** | Core + Shared modules + ADRs + architecture docs |
| **Evidence** | Documentation only — no application runtime |
| **Date** | 2026-07-14 |
| **Status** | Complete |

**Implementation performed:** None

---

## 1. Executive summary

NBCP’s documented architecture is a **credible 10-year multi-vertical platform foundation**: modular monolith (ADR-0001), domain map with Core / Shared / Product layers (ADR-0002), event contracts and outbox (ADR-0003), tenant access model, invitation policy, business capability map, and complete design docs for **four Core** and **nine Shared** modules.

| Layer | Assessment |
| --- | --- |
| **Core** (Identity, Tenancy, RBAC, Audit) | Strong DAG; K-01–K-05 remediated in docs |
| **Shared** (Parties…Reporting) | Strong anti-leak; commerce + capacity + notify + analytics coherent |
| **Architecture docs** | Sufficient to govern scaffolding; some indexes still missing |

**Overall platform architecture score: 8.5 / 10** (design maturity). Implementation risk remains until boundary lint, outbox, and bootstrap tests exist.

### Dimension scores

| Dimension | Score | Notes |
| --- | --- | --- |
| Dependency DAG | **9** | Clear; Identity independent; Payments ↛ Ledger |
| Module boundaries | **9** | Hexagonal standard + templates |
| Event ownership | **8** | Producer-owned; catalog index still needed |
| Multi-tenancy | **9** | Org-scoped shared data; global Identity correct |
| Authorization | **8** | Deny-by-default + access model; bootstrap must be tested |
| Auditability | **8** | Append-only Audit + financial outbox; checklist extend |
| Product extensibility | **9** | Capability map validates platform orientation |
| Platform scalability | **7** | Right style; projector/reporting volume TBD |

---

## 2. Scope of materials reviewed

### Core

Identity · Tenancy · RBAC · Audit (+ [kernel-review](kernel-review.md) remediations)

### Shared

Parties · Catalog · Orders · Inventory · Ledger · Payments · Scheduling · Notifications · Reporting (+ [shared-domains-review](shared-domains-review.md))

### Architecture

ADR-0001 · ADR-0002 · ADR-0003 · Domain Map · Event Contracts · Tenant Access Model · Invitation Acceptance Policy · Business Capability Map · Module Standard · Authz/Tenancy models

---

## 3. Dependency DAG validation

```text
Product (* ) ──► Shared ──► Core ──► technical packages

Core:
  identity (∅)
  tenancy → identity
  rbac → identity, tenancy
  audit → identity, tenancy   (handlers; Identity/Tenancy/RBAC ↛ audit)

Shared (simplified):
  parties → tenancy, rbac
  catalog → tenancy, rbac [, parties]
  orders → parties, catalog, tenancy, rbac
  inventory → catalog, parties, tenancy, rbac [, orders events]
  payments → orders, parties, tenancy, rbac   ; ↛ ledger
  ledger → tenancy, rbac [, orders/payments/inventory events]
  scheduling → tenancy, rbac
  notifications → tenancy, rbac [, ports]
  reporting → tenancy, rbac [, many event contracts]
```

| Check | Result |
| --- | --- |
| Product → Shared → Core | **Pass** |
| No Core → Shared | **Pass** |
| No Shared → Product | **Pass** |
| Identity independence | **Pass** |
| Payments ↛ Ledger | **Pass** |
| Orders ↛ Inventory / Payments | **Pass** |
| Cycle-free package intent | **Pass** (with consumer-edge vigilance) |

---

## 4. Module boundaries

| Check | Result |
| --- | --- |
| Module standard + template | **Pass** |
| Public facade only | **Pass** (documented) |
| Table ownership prefixes | **Pass** |
| Anti-leak language per shared module | **Pass** |
| Customer as Party classification | **Pass** |
| Reservations not in Scheduling | **Pass** |

---

## 5. Event ownership

| Check | Result |
| --- | --- |
| Producer owns contract / facade export | **Pass** (ADR-0003) |
| Envelope with eventId | **Pass** |
| Outbox for security/financial | **Pass** (normative) |
| Audit consumes Core without reverse deps | **Pass** |
| Ledger consumes Payments without Payments→Ledger | **Pass** |
| Consolidated event catalog | **Gap** — see S-02 / P-02 |

---

## 6. Multi-tenancy

| Check | Result |
| --- | --- |
| Organization primary tenant | **Pass** |
| Row-level org on shared SoR | **Pass** |
| Global Identity principals | **Pass** |
| resolveTenantContext pipeline | **Pass** (tenant-access-model) |
| Invitation email bind | **Pass** (invitation policy) |
| RBAC location vs membership location | **Pass** (membership affinity only) |
| Reporting forced org predicate | **Pass** |
| RLS defense-in-depth | Deferred — acceptable |

---

## 7. Authorization

| Check | Result |
| --- | --- |
| Deny by default | **Pass** |
| No owner RBAC bypass | **Pass** (documented) |
| Admin bootstrap sequence | **Pass** (docs) — **must be automated at implement** |
| Permission seeds per module | Partial — unify (S-04 / P-03) |

---

## 8. Auditability

| Check | Result |
| --- | --- |
| Append-only Audit SoR | **Pass** |
| Financial modules outbox → consumers | **Pass** intent |
| Ledger append-only + reversals | **Pass** |
| Export audit for Reporting | **Pass** |
| Mandatory consumer checklist completeness | Extend to all shared money events (P-04) |

---

## 9. Product extensibility

| Check | Result |
| --- | --- |
| Capability map covers six verticals | **Pass** |
| Composition via ids + externalRef | **Pass** |
| Entitlements module still light | Gap for SaaS pack gating (P-05) |
| Files/Integrations/Billing designs thin | Expected sequencing |

---

## 10. Platform scalability

| Check | Result |
| --- | --- |
| Modular monolith first | **Pass** (ADR-0001) |
| Extraction criteria documented | **Pass** |
| Async projectors for ledger/reporting | **Pass** |
| Hot checkout path risk if sync projections | Mitigate — keep async (P-06) |
| Multi-region / active-active | Deferred correctly |

---

## 11. Findings (platform-level)

### High

| ID | Finding | Source |
| --- | --- | --- |
| **P-01** | Event retention + rebuild not standardized for Reporting/Ledger projectors | Shared S-01 |
| **P-02** | Missing platform event catalog index | Shared S-02 |
| **P-03** | Fragmented RBAC permission seed lists | Shared S-04 |
| **P-04** | Audit mandatory event checklist not fully extended beyond kernel | Audit + shared money path |

### Medium

| ID | Finding |
| --- | --- |
| **P-05** | Billing/entitlements not in authorize path yet |
| **P-06** | Need explicit NFR: checkout must not await Reporting/Ledger projectors |
| **P-07** | Metadata escape-hatch governance |
| **P-08** | Integrations/Files designs underweight for Payments/Notifications/Reporting exports |
| **P-09** | Boundary lint / CI architecture tests not yet real (foundation CI is file presence) |

### Low

| ID | Finding |
| --- | --- |
| **P-10** | Recurrence, multi-currency, lot tracking correctly deferred |
| **P-11** | Prompt library not auto-wired as Cursor rules |

**Kernel K-01–K-05:** Document-remediated; retain regression tests at scaffold time.

---

## 12. Risks

1. **Implementation drift** from excellent docs without boundary tooling.  
2. **Financial inconsistency** if Ledger and Reporting mappings diverge.  
3. **Invisible audit gaps** if outbox consumers incomplete.  
4. **SaaS packaging** without entitlements → feature leak across plans.  
5. **Projector backlog** under POS load if workers undersized.

---

## 13. Recommendations

### Before / during first scaffolds

1. Implement outbox + ADR-0003 envelope in database package.  
2. Org bootstrap composer tests (K-02).  
3. Publish event catalog + permission catalog.  
4. Event retention/rebuild ADR (P-01).  
5. Boundary lint when packages exist (P-09).  

### Before production multi-tenant traffic

6. Money-path integration tests: Order → Payment → Ledger → Reporting rebuild.  
7. Entitlements checks design (Billing).  
8. NFR: async projection; SLOs for outbox lag.  
9. Files + Integrations designs for notifications/payments/exports.  

### Ongoing

10. Architecture review gate for any shared `metadata` schema expansion.  
11. Keep Product compositions thin; elevate to Shared only via ADR (≥2 verticals).  

---

## 14. Scorecard summary

| Area | Score |
| --- | --- |
| **Overall** | **8.5 / 10** |
| Core kernel | 8.5 (post K-01…K-05 docs) |
| Shared domains | 8.0 |
| Docs/ADR completeness | 8.5 |
| Production readiness (as docs alone) | 5.0 — scaffolding + tests required |

---

## 15. Conclusion

NBCP’s **design corpus is platform-grade**: dependency DAG, tenancy, authz, auditability, and product extensibility are aligned for Restaurant through Professional Services without restaurant-shaped shared kernels. The architectural priority now shifts from **more domain essays** to **enforceable scaffolding** (outbox, catalogs, bootstrap tests, boundary lint) and closing High findings P-01–P-04.

**Recommendation:** Accept this platform review as the gate from “design complete for Core+Shared” to “Phase 1 implementation,” with P-01–P-04 tracked as prerequisites for production data paths.

---

## 16. Related documents

- [shared-domains-review.md](shared-domains-review.md)  
- [kernel-review.md](kernel-review.md)  
- [modules/README.md](../modules/README.md)  
- [architecture/README.md](../architecture/README.md)  
- ADR-0001 · ADR-0002 · ADR-0003
