# Shared Domains Architecture Review

| Field | Value |
| --- | --- |
| **Review type** | Architecture review (design-level) |
| **Scope** | Parties, Catalog, Orders, Inventory, Ledger, Payments, Scheduling, Notifications, Reporting |
| **Also reviewed** | ADR-0001, ADR-0002, ADR-0003, Domain Map, Business Capability Map |
| **Evidence** | Module design docs only — no runtime code |
| **Date** | 2026-07-14 |
| **Status** | Complete |

**Implementation performed:** None

---

## 1. Executive summary

The Shared Business layer is a **coherent commercial platform kernel**: Parties → Catalog → Orders → Payments/Inventory → Ledger projectors, plus Scheduling, Notifications, and Reporting as cross-cutting capabilities. Designs consistently encode **Product → Shared → Core**, opaque id references, anti-leak rules (no Menu/Room/Reservation/Campaign aggregates in shared modules), tenant `organization_id` ownership, RBAC on facades, and ADR-0003 outbox intent.

The dependency DAG among shared modules is **mostly acyclic and intentional**. The main residual risks are **projector complexity** (Ledger + Reporting + Inventory all consuming Orders/Payments), **event contract sprawl** without a frozen catalog index, **Notifications/Reporting optional consumer edges** that can grow into God-consumers, and **rebuildability** that is required in prose but not yet operationalized (event store retention, rebuild SLAs).

| Score | Value | Comment |
| --- | --- | --- |
| **Overall shared-layer architecture** | **8 / 10** | Strong boundaries; integration completeness gaps |
| Dependency graph | 8 | Sound; watch consumer fan-in |
| Event graph | 7 | Rich; needs published catalog + retention |
| Tenant ownership | 9 | Consistent `organization_id` story |
| RBAC consistency | 8 | Pattern clear; permission seed matrix incomplete |
| Product isolation | 9 | Explicit anti-leak across modules |
| Event contract consistency | 7 | Envelope standard exists; per-event schema registry missing |
| Scalability (design) | 7 | Modular monolith fit; projector load risk |
| Projection rebuildability | 7 | Principle stated; ops model incomplete |

**Verdict:** Shared domains are **design-ready for scaffolding** after addressing High findings (event catalog, projection ownership matrix, rebuild/runbook, money-path consistency).

---

## 2. Dependency graph assessment

### 2.1 Declared shared DAG (intended)

```text
                    ┌──────── identity ────────┐
                    │            ▲             │
                    │       tenancy / rbac     │
                    └────────────┬─────────────┘
                                 │
         parties ◄── catalog     │
            ▲          ▲         │
            └──── orders ────────┤
                   ▲    ▲        │
         inventory ┘    └── payments
                   │         │
                   └────► (events) ──► ledger
                                   ──► reporting
                                   ──► notifications (optional)
         scheduling ──► core only
         notifications ──► core (+ ports)
         reporting ──► core (+ event contracts of shared)
```

| Edge | Status |
| --- | --- |
| Orders → Parties, Catalog, Core | **Pass** |
| Inventory → Catalog, Parties, Core; may → Orders events | **Pass** |
| Payments → Orders, Parties, Core; ↛ Ledger | **Pass** |
| Ledger → Core; consumes Orders/Payments/Inventory events | **Pass** |
| Reporting → Core; consumes shared events; ↛ writes source | **Pass** |
| Scheduling → Core only | **Pass** |
| Notifications → Core; optional Identity/Parties/Orders event consumption | **Pass** with caution |
| Product packages → Shared | **Allowed** |
| Shared → Product | **Forbidden — Pass in designs** |
| Payments → Ledger / Orders → Payments / Orders → Inventory | **Correctly avoided** |

### 2.2 Hidden / future cycle risks

| Risk | Severity | Notes |
| --- | --- | --- |
| Notifications consumes Orders **and** Orders later calls Notifications | Medium | Keep Identity/Core pattern: composers or one-way consumer only |
| Ledger + Reporting both project same events with divergent mapping | High | Need single mapping ownership (config templates) |
| Inventory ↔ Orders status coupling via dual paths | Medium | Document single policy: reserve-on-commit vs issue-on-fulfill |
| Deep event DTO imports without `@nbcp/contracts` | Medium | Remains K-04 class risk at scale |

---

## 3. Event graph assessment

### 3.1 Primary money path

```text
orders.committed
   ├──► inventory (reserve/issue)
   ├──► payments (intent — often API-driven)
   ├──► reporting (sales facts)
   ├──► notifications (receipt — optional)
   └──► ledger (optional early; often capture-driven)

payments.capture.succeeded / refund.succeeded
   ├──► ledger (journals)
   ├──► reporting (collections)
   └──► audit

inventory.* movements
   ├──► ledger (valuation optional)
   └──► reporting
```

### 3.2 Consistency with ADR-0003

| Requirement | Shared modules |
| --- | --- |
| Envelope / eventId | Referenced across designs |
| Outbox for financial/security | Orders commit/cancel, Payments capture/refund, Inventory adjust, Ledger post/reverse — **Pass** |
| Idempotent consumers | Stated for Inventory, Ledger, Reporting — **Pass** |
| Producer-owned contracts | **Pass** |
| Central event catalog index | **Missing** — finding S-02 |

---

## 4. Tenant ownership consistency

| Module | Tenant on every business row | Notes |
| --- | --- | --- |
| Parties | Yes | Global Identity ≠ Party |
| Catalog | Yes | |
| Orders | Yes | + optional locationId |
| Inventory | Yes | location = stock place |
| Ledger | Yes | |
| Payments | Yes | |
| Scheduling | Yes | |
| Notifications | Yes on messages; templates may be platform (null org) | Acceptable |
| Reporting | Yes on facts; forced org predicate | **Pass** |

**Verdict:** Strong alignment with tenancy model and capability map. No shared design introduces restaurant-global tables.

---

## 5. RBAC consistency

| Pattern | Status |
| --- | --- |
| Authorize after tenant context | Documented in each shared design |
| Permission seeds per module | Present as illustrative — **not unified matrix** |
| Deny by default | Inherited from RBAC design |
| Location scope via assignment | Compatible with tenant-access-model |

**Gap:** No single `docs/architecture/permission-catalog.md` listing all `parties.*` / `orders.*` / … keys for pack registration (finding S-04).

---

## 6. Product isolation

Capability map + each design’s “must NOT leak” tables are **consistent**:

- Catalog ≠ MenuItem/Room/Course/PatientService  
- Orders ≠ table/room/patient/student/kitchen  
- Inventory ≠ recipes/kitchen/rooms  
- Scheduling ≠ Reservation/Booking/Appointment/Enrollment  
- Notifications ≠ Campaign/reminder ARs  
- Reporting ≠ operational SoR  

**Verdict:** Product isolation at design level is **excellent (9/10)**. Risk is implementation drift via `metadata` jsonb abuse (finding S-05).

---

## 7. Event contract consistency

| Strength | Gap |
| --- | --- |
| Shared reference to ADR-0003 | No versioned JSON Schema registry |
| Idempotency on eventId / externalRef | ExternalRef uniqueness rules differ slightly by module |
| Audit action aligns with event type (mostly) | Mandatory Audit checklist not extended fully to all shared financial events beyond kernel |

---

## 8. Future scalability

| Concern | Assessment |
| --- | --- |
| Modular monolith + projectors | Appropriate; projector CPU/IO will dominate before service split |
| Reporting + Ledger dual consumers | Scale with partitioning by organizationId; async workers |
| Inventory on every POS commit | Need batching/back-pressure design |
| Scheduling recurrence (education) | Correctly deferred to ADR |
| Multi-region | Still deferred (ADR-0001) |

---

## 9. Rebuildability of projections

| Module | Rebuild story |
| --- | --- |
| Reporting | Explicit rebuild API + processed_events — **Pass principle** |
| Ledger | Balances rebuildable from postings — **Pass**; event projectors need replay source |
| Inventory | Balances from movements — **Pass** if movements retained forever |
| Notifications | N/A as SoR |
| Downstream product marts | Out of shared scope |

**Gaps:** No platform policy for **event retention TTL**, cold storage of outbox/events, or rebuild RPO/RTO (finding S-01). Without durable event log, Reporting rebuild is aspirational.

---

## 10. Findings by severity

### Critical

None at design documentation level that invalidate the layer. Operational rebuild without event store is a **production Critical** if launched without S-01 — treat as High until scaffolding chooses store.

### High

| ID | Finding | Recommendation |
| --- | --- | --- |
| **S-01** | Projection rebuildability lacks durable event retention / replay platform standard | ADR: event log retention + rebuild runbooks for Reporting/Ledger projectors |
| **S-02** | No consolidated event catalog across shared modules | Publish `docs/architecture/event-catalog.md` (index of type → producer → consumers) |
| **S-03** | Ledger vs Reporting mapping ownership unclear for revenue recognition | Single mapping config owned by finance templates; document in Ledger design addendum |

### Medium

| ID | Finding | Recommendation |
| --- | --- | --- |
| **S-04** | RBAC permission seeds fragmented | Unified permission catalog doc |
| **S-05** | `metadata` / `externalRef` escape hatches can smuggle vertical SoR | Lint guidelines + review checklist forbidding vertical required keys in Shared |
| **S-06** | Inventory×Orders fulfillment policy (reserve vs issue timing) underspecified | Short ADR or orders/inventory joint policy section |
| **S-07** | Notifications optional God-consumer of many domains | Prefer apps composers for vertical receipts; limit module handlers to Core security emails |
| **S-08** | Anonymous/guest Order policy left open | Decide before POS/restaurant scaffolds |

### Low

| ID | Finding |
| --- | --- |
| **S-09** | Scheduling recurrence deferred — OK |
| **S-10** | Multi-currency ledger deferred — OK |
| **S-11** | Files module still design-light for export artifacts |

---

## 11. Risks

1. **Projector drift** → finance dashboards ≠ books (Ledger) vs analytics (Reporting).  
2. **Metadata pollution** → accidental restaurant-centric shared schema.  
3. **Event retention loss** → inability to rebuild Reporting after corruption.  
4. **Consumer fan-in** → outbox lag affecting checkout UX if sync wait introduced (must stay async).  
5. **Permission sprawl** → inconsistent authorize strings across modules.

---

## 12. Recommendations

### Immediate

1. Add **event catalog** index (S-02).  
2. ADR for **event retention + rebuild** (S-01).  
3. Document **Orders↔Inventory↔Payments↔Ledger** happy-path sequence + idempotency keys (S-03, S-06).  

### Short-term

4. Unified **permission catalog**.  
5. Metadata anti-leak checklist in module-standard.  
6. Confine Notifications domain event handlers to Core templates.  

### Long-term

7. Partition reporting facts by organizationId.  
8. Extract hot projectors only if metrics demand (per modular monolith extraction criteria).  

---

## 13. Related documents

- [platform-architecture-review.md](platform-architecture-review.md)  
- [kernel-review.md](kernel-review.md)  
- [business-capability-map.md](../architecture/business-capability-map.md)  
- [modules/README.md](../modules/README.md)
