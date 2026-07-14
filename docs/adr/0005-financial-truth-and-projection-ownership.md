# ADR-0005: Financial Truth and Projection Ownership

- **Status:** Proposed
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture
- **Tags:** finance, ledger, reporting, payments, orders, projections, audit, ownership
- **Remediates:** Architecture hardening [S-03](../reviews/architecture-hardening-review.md); Shared Domains Review S-03
- **Depends on:** [ADR-0001](0001-platform-technology-foundation.md), [ADR-0002](0002-domain-map.md), [ADR-0003](0003-event-contracts-and-outbox.md), [ADR-0004](0004-event-retention-replay-rebuild.md)
- **Companion inventory:** [Event catalog](../reference/event-catalog.md)

---

## Context

NBCP integrates Shared Business modules through **domain events** published via the **transactional outbox** ([ADR-0003](0003-event-contracts-and-outbox.md)). Multiple consumers project the same commercial events:

| Consumer | Example inputs | Writes |
| --- | --- | --- |
| **Ledger** | `payments.capture.succeeded`, optional inventory valuation events | Append-only `ledger_*` journals |
| **Reporting** | `orders.order.committed`, payments, inventory, ledger posted events | Rebuildable `reporting_*` facts / MVs |
| **Analytics-style caches** | Subset of the above | Disposable read models (search, dashboards outside Reporting) |

Without a single ownership ADR (hardening **S-03**):

* Operators cannot tell whether a dashboard revenue figure is **book** truth or an **operational** sales projection.
* Both Ledger and Reporting may appear to “own” money math when they simply subscribe to overlapping events.
* Rebuild tooling ([ADR-0004](0004-event-retention-replay-rebuild.md)) risks being applied to the wrong store (Reporting wipe vs Ledger books).
* Audit investigations lack a fixed **precedence** when Ledger, Payments, and Reporting disagree.

### Ledger module responsibilities

Ledger is the **reusable financial ledger**: tenant chart of accounts, journal entries, postings, and balances derived from postings ([ledger/design.md](../modules/ledger/design.md)). It records **economic accounting effects**. It does **not** own card capture lifecycle, PSP adapters, or cash drawer ops.

### Reporting module responsibilities

Reporting owns **datasets, projections, report definitions, materialized views, and exports** ([reporting/design.md](../modules/reporting/design.md)). It answers analytical questions from facts that already happened elsewhere. It is **eventually consistent** and **rebuildable**. It must **never** become write authority for Orders, Payments, Inventory, or Ledger.

### Financial audit requirements

Posted journals, payment captures/refunds, and material money-adjacent mutations are **Audit-mandatory**. Dashboard rollups in Reporting are **not** an Audit substitute for books or payment evidence.

### Projection rebuild requirements

[ADR-0004](0004-event-retention-replay-rebuild.md) already states: Reporting facts are disposable read models; posted Ledger journals must not be truncated by Reporting-style rebuild; corrections to books are **reversals**. This ADR names **who owns** each projector class and **which truth wins** in conflict — without changing those retention/rebuild mechanics.

---

## Decision

Adopt the following **platform-wide** ownership, financial-truth, and conflict-precedence rules. Module designs remain narrative companions; **this ADR is normative** for disputes and projector placement.

### System of Record Ownership

| Data class | Authoritative system of record (SoR) | Not SoR |
| --- | --- | --- |
| **Commercial commitment** (order lines, commit/cancel/fulfill state, commercial snapshots) | **Orders** | Reporting sales facts; Ledger dimensions that reference `orderId` |
| **Payment instrument lifecycle** (intent, auth, capture, refund, cancel, provider refs, settlement attempts) | **Payments** | Ledger journals; Reporting collections facts |
| **Accounting books** (chart, posted journals, postings; balances as derived aids) | **Ledger** | Reporting GL/dashboard projections; Payments tables |
| **Analytical datasets / exports / report definitions** | **Reporting** *(as owner of read models and definition metadata only)* | Any operational or financial SoR |

**Normative clarifications**

1. **Payments ↛ Ledger:** Payments never writes `ledger_*`. Ledger (preferred: in-module handlers calling Ledger post APIs) or a thin host composer that **only** invokes Ledger APIs may react to payment events.
2. **Reporting ↛ SoR tables:** Reporting projectors write only Reporting-owned fact/MV tables (and export artifacts).
3. **Orders do not equal books:** An order commit is commercial truth; it is **not** by default a posted revenue journal (see recognition default below).
4. **Inventory on-hand** remains Inventory SoR; optional COGS/valuation journals are Ledger if/when posted — Reporting stock analytics never redefine Inventory balances.

---

### Financial Truth

#### What constitutes financial truth

| Question | Truth | Owner |
| --- | --- | --- |
| Was money authorized / captured / refunded (and under which provider refs)? | Payment operational + settlement facts | **Payments** |
| What double-entry impact was booked to the chart? | Posted journal entries and postings | **Ledger** |
| What committed commercial document exists (amounts before/at commit)? | Order aggregate + snapshots | **Orders** |
| What does a sales/collections dashboard show? | Projected analytics (may lag; **non-authoritative for books**) | **Reporting** |

**Platform definition:** **Financial (book) truth** for accounting disputes, statutory investigation, and close is **posted Ledger journals** (and Account chart metadata). **Financial (cash/settlement) truth** for “did funds move?” is **Payments**. Reporting never outranks either.

#### Which module owns it

* **Ledger** owns book truth and the **mapping** from qualifying domain events (and explicit post APIs) to account codes / journal shapes (chart templates, recognition policy hooks).
* **Payments** owns capture/refund truth and emits events Ledger may consume.
* **Orders** owns commercial commitment truth.
* **Reporting** owns presentation of **derived** views only.

#### Default recognition mapping (resolves S-03 ambiguity)

Unless a **named tenant/industry template** (documented in Ledger chart templates / product pack) explicitly overrides:

1. **Revenue / AR (or undeposited funds) posts** are driven primarily by **`payments.capture.succeeded`** (and analogous success paths).
2. **Refund / contra** posts are driven by **`payments.refund.succeeded`**.
3. **`orders.order.committed`** does **not** post revenue by default.
4. Reporting **may** still project `orders.order.committed` into **operational sales** datasets; those figures must be labeled **non-book / operational** (not GAAP substitutes, not close evidence).
5. Optional Inventory → COGS / valuation posts are **Ledger-owned** when enabled; Reporting must not invent parallel COGS money math when books are the dispute surface.

Mapping tables (account codes, journal templates) are **Ledger-owned**. Reporting must not maintain a second monetary calculator that redefines debit/credit outcomes.

#### Immutable records

| Record | Immutability |
| --- | --- |
| **Posted** Ledger journal entries and their postings | **Immutable** — no UPDATE of amounts/accounts/dates; no application DELETE ([ledger/design.md](../modules/ledger/design.md) §4) |
| Payments capture/refund success rows (business keys / provider refs) | Treat as durable evidence; corrections via new compensating payment operations + events, not silent rewrite |
| Orders committed snapshots (per Orders design) | Per Orders append/snapshot policy; cancel/fulfill via explicit lifecycle, not silent history edit |
| Reporting fact rows / MVs | **Mutable / disposable** — truncate + rebuild allowed per ADR-0004 |
| Audit records | Append-only; never “rebuild” by wipe |

#### Correction mechanisms

| Domain | Correction mechanism |
| --- | --- |
| **Ledger** | **Reversal** journal (full/partial) referencing prior entry, then optional replacement post — never in-place edit of posted amounts ([ADR-0004](0004-event-retention-replay-rebuild.md) Ledger protection) |
| **Payments** | Compensating capture/refund/cancel operations emitting new events; Ledger reacts with new posts/reversals |
| **Orders** | Cancel / adjust flows emitting Orders events; Inventory/Payments/Ledger/Reporting react per their ownership — Orders does not write ledger |
| **Reporting** | Fix projector + **rebuild** dataset (or correct forward with new projection logic); no claim of correcting books |

Ledger **projector gap-fill** (missing journal for an already-processed financial event): insert a **new** journal via Ledger API with the same idempotent `externalRef` — never modify an existing posted entry ([ADR-0004](0004-event-retention-replay-rebuild.md)).

---

### Reporting Ownership

#### What Reporting may store

* Dataset registrations, report definitions, export job metadata.
* Fact tables and materialized views for analytics (sales operational facts, collections facts, inventory movement summaries, optional non-authoritative GL dashboards projected from `ledger.journal.posted`).
* Freshness / lag markers and rebuild checkpoints for its own projectors.

#### What Reporting may derive

* Aggregations, rollups, filtered slices, exports, and parameterized report results.
* Denormalized dimensions copied from event payloads for query convenience (party, location, catalog refs) — **display/analytics only**.
* Cross-module **analytical** joins in read models **without** becoming SoR for any joined domain.

#### What Reporting must never own

| Forbidden | Reason |
| --- | --- |
| Orders / Payments / Inventory / Ledger **write** paths or tables | Breaks SoR |
| Authoritative balances that override Ledger postings | Books are Ledger |
| Capture/refund finality decisions | Payments |
| Silent “correction” of money by editing facts without rebuild provenance | Undermines auditability |
| Use as sole evidence in financial dispute or statutory close | Non-authoritative |
| Truncate/rebuild tools that touch `ledger_*`, `payments_*`, `orders_*`, `audit_*` | ADR-0004 |

---

### Projection Ownership

| Projection class | Owner | Rebuildable? | Notes |
| --- | --- | --- | --- |
| **Payment → journal posts** | **Ledger** (default: Ledger module handlers; apps only for cross-cutting orchestration that still calls Ledger APIs) | Gap-fill only — **not** Reporting-style wipe | Idempotent on `(organizationId, source, externalRef)` |
| **Order → inventory reserve/issue** | **Inventory** | Idempotent SoR updates / compensating events | Not Reporting |
| **Order/Payment/Inventory/Ledger events → analytics facts** | **Reporting** | **Yes** — disposable | ADR-0004 Reporting rebuild |
| **Ledger balances from postings** | **Ledger** | **Yes** — from postings only, never from Reporting | Materialized aid |
| **Search / UX caches** | Owning product or infrastructure | **Yes** (disposable) | Must not write Shared SoR except via APIs |
| **Aggregated metrics / analytical summaries** | **Reporting** (or product marts fed from Reporting/events) | **Yes** | Labeled non-book when sourced from operational sales |
| **Audit projection** | **Audit** | No wipe-rebuild of history | Consumes SECURITY/FINANCIAL events |

**Rebuildable projections:** Reporting datasets/MVs; Ledger **balances** (from postings); non-SoR caches.

**Disposable projections:** Same as rebuildable read models — may be truncated and re-projected. Posted journals are **not** disposable.

**Aggregated metrics / analytical summaries:** Owned by Reporting (or explicit product analytics packs). Prefer deriving book-oriented finance dashboards from `ledger.journal.*` events or Ledger read APIs so they do not invent parallel recognition math.

---

### Conflict Resolution

When values differ, apply this **precedence** (highest first). The lower party **loses**; operators correct the lower store or its projector — they do not “average” truths.

#### Ledger versus Reporting

1. **Ledger posted journals and posting-derived balances** win for all book, close, recognition, and GL disputes.
2. Reporting finance dashboards are explanatory only; on conflict → rebuild Reporting or fix projector; **do not** alter posted Ledger to match a dashboard.
3. If Reporting shows revenue that Ledger never posted under default recognition, treat Reporting as **operational sales** unless a documented template says otherwise.

#### Payments versus Reporting

1. **Payments** wins for capture/refund/settlement occurrence and amounts/refs.
2. Reporting collections facts must be reconciled to Payments (and to Ledger posts that reference those payment events).
3. On conflict → rebuild Reporting or repair Payments via compensating operations — never invent payment truth in Reporting.

#### Operational module versus Reporting

| Operational SoR | Wins over Reporting for |
| --- | --- |
| **Orders** | Commit/cancel/fulfill state, line commercial amounts at commit |
| **Inventory** | On-hand / reserved balances and movement SoR |
| **Scheduling / Parties / Catalog** | Their respective entity truth |
| **Ledger** | Booked accounting effects (even when Reporting also listened to the same upstream event) |

**Payments versus Ledger:** Different questions — Payments wins “was it captured?”; Ledger wins “what was booked?”. A successful capture without a journal is a **Ledger projector gap** (gap-fill), not proof that Reporting may redefine books. A journal without a payment is allowed only for non-payment sources (manual journal, inventory valuation, etc.) and must carry honest `source` metadata.

**Orders versus Ledger:** Orders wins commercial commitment; Ledger wins booked effect. Default policy: commit ≠ revenue post.

---

### Audit Requirements

#### Audit source

| Concern | Primary evidence |
| --- | --- |
| Book post / reverse | Ledger SoR + mandatory Audit on `ledger.journal.posted` / `reversed` |
| Capture / refund | Payments SoR + mandatory Audit on success events |
| Order commit / cancel | Orders SoR + Audit on material lifecycle events |
| Who ran a report/export | Reporting export/definition Audit events |
| Who ran rebuild/replay | Ops/Audit log per ADR-0004 |

Reporting fact tables are **not** primary Audit evidence for money.

#### Investigation workflow

1. Identify the **question** (cash? books? commercial doc? dashboard?).
2. Open the owning SoR first (Payments / Ledger / Orders).
3. Correlate via `eventId`, `organizationId`, and business keys (`paymentId`, `orderId`, `journalEntryId`) from the [event catalog](../reference/event-catalog.md).
4. Consult Audit trail for actor/time/action.
5. Use Reporting only as a **hint** to find keys — then confirm in SoR.
6. If dashboard wrong → rebuild/fix Reporting projector; if books wrong → reverse + replace in Ledger; if capture wrong → Payments compensating flow.

#### Reconciliation expectations

| Pair | Expectation |
| --- | --- |
| Payments captures ↔ Ledger posts (default template) | Every successful capture/refund eventually maps to ≤1 posted effect set (idempotent `externalRef`); exceptions are ops defects |
| Orders commits ↔ Reporting sales facts | Operational alignment; **not** required to equal Ledger revenue |
| Ledger trial balance ↔ Reporting GL dashboard | Dashboard may lag; books win; freshness SLO on Reporting |
| Inventory on-hand ↔ Reporting stock analytics | Inventory wins; analytics rebuilt on drift |

Periodic reconciliation jobs (when implemented) compare keys/amounts between SoR and Reporting and alert on drift — they must **never** auto-write SoR from Reporting.

---

## Consequences

### Benefits

* Removes dual-interpreter ambiguity between Ledger and Reporting (S-03).
* Separates **operational sales** analytics from **book** recognition with an explicit default.
* Gives dispute and Audit workflows a fixed precedence ladder.
* Aligns projector placement with ADR-0004 rebuild/Ledger protection.
* Keeps Payments ↛ Ledger and Reporting-as-derived invariants enforceable in review.

### Trade-offs

* Operational dashboards (order-commit based) may **diverge** from recognized revenue until capture — by design; UX must label them.
* Industry packs that post on commit must be explicit templates (extra documentation / chart variants).
* Host composers remain allowed but are discouraged for pure payment→journal paths (prefer Ledger handlers) — migration cost if early prototypes put logic only in apps.
* Reconciliation and labeling discipline required so tenants do not treat Reporting as close.

### Operational implications

* Rebuild jobs: Reporting-only tools; hard-fail if targeted tables are outside Reporting.
* Ledger gap-fill and reversal runbooks are separate from Reporting rebuild ([ADR-0004](0004-event-retention-replay-rebuild.md) follow-ups).
* Support playbooks: “books vs dashboard” first question before any truncate.
* Classification in the event catalog remains FINANCIAL for money events; Reporting consumption does not reclassify them as ANALYTICS-only.

---

## Follow-up Actions

### Documentation

1. Link this ADR from [reporting/design.md](../modules/reporting/design.md), [ledger/design.md](../modules/ledger/design.md), [payments/design.md](../modules/payments/design.md), and [event catalog](../reference/event-catalog.md) consumer rules.
2. Publish `docs/runbooks/rebuild-projections.md` (Reporting) and `docs/runbooks/ledger-gap-fill-and-reversal.md` (or fold into event-replay runbook).
3. Document default vs override recognition templates under Ledger chart/template design.
4. Optional thin guide `docs/architecture/financial-projection-ownership.md` that points **only** to this ADR (avoid duplicating policy).
5. Accept this ADR after review; mark hardening S-03 remediated (docs).

### Implementation controls (when coding begins — not part of this ADR authoring)

1. Ledger handlers (or composer) idempotent on payment `externalRef`; architecture tests forbid Payments writing `ledger_*`.
2. Reporting rebuild CLI allow-list of `reporting_*` (and Reporting MVs) only.
3. Report definition metadata marks datasets `book_aligned` vs `operational_sales` where both exist.
4. Reconciliation job (optional phase) diffs Payments↔Ledger and SoR↔Reporting without auto-mutating SoR.
5. Dual-control for FINANCIAL replay/gap-fill per ADR-0004.

---

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Reporting as financial warehouse of record** | Violates rebuild/disposability and Audit posture; creates second set of books |
| **Default revenue on `orders.order.committed`** | Couples recognition to commercial commit before capture; harder cash reconciliation for card flows; rejected as **platform default** (allowed only as named template) |
| **Payments writes ledger rows directly** | Breaks module boundary; mixes settlement ops with accounting SoR |
| **Single merged “Finance” module** | Conflates PSP lifecycle with GL; rejected by ADR-0002 Shared map |
| **Always require apps composer for posts** | Acceptable but weaker encapsulation; default preference is Ledger-owned handlers |

---

## References

- [ADR-0004](0004-event-retention-replay-rebuild.md) — retention, replay, rebuild, Ledger protection
- [ADR-0003](0003-event-contracts-and-outbox.md) — envelope / outbox
- [Event catalog](../reference/event-catalog.md)
- [ledger/design.md](../modules/ledger/design.md)
- [reporting/design.md](../modules/reporting/design.md)
- [payments/design.md](../modules/payments/design.md)
- [orders/design.md](../modules/orders/design.md)
- [architecture-hardening-review.md](../reviews/architecture-hardening-review.md) §3
