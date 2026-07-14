# ADR-0007: Orders ↔ Inventory Reservation and Issue Timing

- **Status:** Accepted
- **Accepted:** 2026-07-14
- **Date:** 2026-07-14
- **Deciders:** Noventra platform architecture
- **Tags:** orders, inventory, reservation, fulfillment, stock, overselling, shared-domains
- **Depends on:** [ADR-0001](0001-platform-technology-foundation.md), [ADR-0002](0002-domain-map.md), [ADR-0003](0003-event-contracts-and-outbox.md), [ADR-0004](0004-event-retention-replay-rebuild.md), [ADR-0005](0005-financial-truth-and-projection-ownership.md), [ADR-0006](0006-architecture-enforcement-and-governance.md)
- **Prerequisite milestones:** Core Kernel M1–M6 · Shared S1 Parties · Shared S2 Catalog
- **Companions:** [orders/design.md](../modules/orders/design.md) · [inventory/design.md](../modules/inventory/design.md) · [event catalog](../reference/event-catalog.md)

---

## Context

Shared Domains **S1 Parties** and **S2 Catalog** are complete. Before **S3 Orders**, one open architecture ambiguity remains: **when Inventory reservations and issues interact with the Orders lifecycle**.

Module designs already agree on direction and SoR:

* Orders owns commercial commitment lifecycle (`draft` → `committed` → `partially_fulfilled` / `fulfilled` / `cancelled`).
* Inventory owns on-hand, reserved, and movement truth for **stockable** catalog items ([ADR-0005](0005-financial-truth-and-projection-ownership.md)).
* DAG: **Orders ↛ Inventory**; Inventory (or a host composer) may react to Orders events ([ADR-0002](0002-domain-map.md)).
* Event ownership is producer-prefix (`orders.*`, `inventory.*`) via outbox ([ADR-0003](0003-event-contracts-and-outbox.md)).

They disagree (or leave ambiguous) on **timing**:

| Source | Ambiguity |
| --- | --- |
| [orders/design.md](../modules/orders/design.md) retail example | Implies stock **reduces on commit** |
| [inventory/design.md](../modules/inventory/design.md) | Says commit → **reserve or issue** “per tenant/pack” |
| [ADR-0005](0005-financial-truth-and-projection-ownership.md) | Names Inventory as owner of “Order → inventory reserve/issue” without fixing *when* |

Vertical forces conflict if a single instant is mischosen:

| Vertical | Need |
| --- | --- |
| **Retail / POS** | Fast stock-out; short commit→fulfill (often same transaction) |
| **Restaurant** | Commit fires kitchen; physical goods/ingredients leave later; finished-good lines may not be stockable |
| **Service businesses** | Many lines are **non-stockable** — Inventory must stay quiet |
| **All** | Prevent **overselling** without coupling Orders to Payments or Ledger |

This ADR selects one **platform-default** interaction model suitable for retail, POS, restaurant, and services, and states what packs may **narrow** (not invert) without a superseding ADR.

---

## Decision Summary

| Question | Platform default |
| --- | --- |
| **When to reserve?** | On **Order Committed** (stockable lines only) |
| **When to issue (decrement on-hand)?** | On **Fulfillment** (per fulfilled quantity — started/completed as published by Orders fulfill events) |
| **Draft** | No Inventory effect |
| **Payment Captured** | No Inventory effect (Payments-independent) |
| **Non-stockable / services** | Skip reserve and issue |
| **Who mutates stock?** | **Inventory** only (idempotent handlers / APIs); Orders never writes Inventory |

**One-line rule:** *Commit holds stock; fulfill moves stock; cancel/failure releases unissued holds; services never touch stock.*

```text
draft ─────────────────────────────────────────► (no inventory)
  │
  ▼
committed ──► Inventory.reserve (stockable lines)
  │
  ├── partially_fulfilled / fulfillLines ──► issueAgainstReservation (fulfilled qty)
  ├── fulfilled ──► issue remaining reserved stockable qty
  └── cancelled ──► releaseReservation (unissued) + policy for already-issued
```

POS / same-counter retail compose **commit then fulfill immediately** in the host — net effect looks like “stock left at sale,” without making issue-on-commit the platform default.

---

## Decision

### 1. Reservation Timing — **Order Committed**

**Selected:** Soft reservation occurs when the order becomes a commercial commitment (`orders.order.committed`), for lines whose Catalog offering is **stockable**.

#### Evaluation

| Candidate | Verdict | Why |
| --- | --- | --- |
| **Order Draft** | Rejected | Carts abandon heavily; draft edits thrash reserved qty; starves availability without commercial firmness |
| **Order Committed** | **Accepted** | Firm commitment; earliest safe hold to prevent overselling before fulfillment; aligns event consumers already listed for `orders.order.committed` |
| **Payment Captured** | Rejected | Couples stock to Payments; invoice / pay-later / rooms on account still need holds; ADR-0005 separates commercial commitment from settlement |
| **Fulfillment Started** | Rejected | Gap after commit allows double-selling of scarce SKUs; kitchen/mail prep needs a hold during the wait |

#### Coupling / overselling

* Reservation is an **Inventory SoR** update keyed by opaque `orderId` (and line ids in metadata/externalRef). Orders remains unaware of Inventory tables ([ADR-0002](0002-domain-map.md) DAG).
* **Hard overselling prevention at commit** (reject sale when available qty insufficient) is **not** done inside Orders. Prefer:

  1. **Host/product composer** (allowed by [ADR-0006](0006-architecture-enforcement-and-governance.md)): query Inventory availability and/or call `reserveStock` **before** `commitOrder`, then commit; Inventory handlers remain idempotent on `orders.order.committed` for the same `orderId`; or
  2. **Async reserve** on `committed` under a tenant **shortage policy** (`deny` → compensating cancel orchestration / `inventory` shortage signal; `allow_backorder` → reserve what is available and record shortfall). Shortage policy is Inventory/tenant configuration — not an Orders schema leak.

Packs must not move the default reserve *earlier* than commit or *later* than fulfill without documenting a named exception.

---

### 2. Issue Timing — **Fulfillment (quantity completed)**

**Selected:** On-hand decrements when Orders reports fulfillment progress — primarily `orders.order.partially_fulfilled` / line-level fulfill APIs culminating in `orders.order.fulfilled`. Inventory converts **reservation → issue** for the fulfilled quantity (`issueAgainstReservation` or equivalent).

#### Evaluation

| Candidate | Verdict | Why |
| --- | --- | --- |
| **Order Committed** | Rejected as platform default | Treats commercial accept as physical outbound; wrong for delayed fulfillment, prep/kitchen, pick/pack; complicates cancel of never-shipped goods; retail POS can still fulfill immediately after commit |
| **Fulfillment Started** | Acceptable only as a pack signal | “Started” is ambiguous for multi-line; if product emits started, issue qty only for lines that actually leave stock — prefer explicit fulfill qty |
| **Fulfillment Completed** (incl. partial qty) | **Accepted** | Stock leave matches physical/consumption truth; partial fulfill issues only completed qty; remaining stays reserved |

**Normative meaning of “fulfill” for Inventory:** the fulfilled **quantity** for a stockable line (not merely order header status). Header `fulfilled` completes any residual reserved qty for stockable lines on that order.

---

### 3. Cancellation Behavior

Applies to `orders.order.cancelled` (and draft discard with no Inventory effect).

| Situation | Inventory effect |
| --- | --- |
| Reservations exist; nothing issued | **Release** reservations for that `orderId` → `inventory.reservation.released`; available qty restored |
| Partial issue already posted | **Keep** issued movements (append-only); **release** only remaining reservation; physical return/restock is a separate **receipt** (or reverse-issue movement) with new `externalRef`, never silent delete of issued history ([ADR-0004](0004-event-retention-replay-rebuild.md) spirit for stock evidence) |
| Full issue already posted | No reservation left; restock only via explicit compensating movement if goods return |

Orders cancellation does **not** invent Inventory journals or Ledger COGS reversals — those remain Payments/Ledger policies ([ADR-0005](0005-financial-truth-and-projection-ownership.md)).

---

### 4. Fulfillment Failure Behavior

When fulfillment cannot complete (pick short, kitchen 86, customer refuse after commit):

| Concern | Handling |
| --- | --- |
| **Reservation** | Release qty that will never fulfill (full or partial). Prefer Orders cancel / down-quantity use cases that emit lifecycle events Inventory already understands; product may call Inventory `releaseReservation` with `orderId` when orchestration needs sync correction |
| **Already issued** | Do not erase; post compensating **receipt** / reverse issue if goods return to stock |
| **Order state** | Partially fulfilled + cancel of remainder, or cancel from committed if nothing issued — Orders owns commercial status; Inventory follows events/APIs |

Failures must not leave orphan reservations indefinitely — Inventory may apply reservation **TTL / reconcile** jobs keyed by `orderId`, but SoR corrections remain Inventory-owned.

---

### 5. Partial Fulfillment

| Concern | Handling |
| --- | --- |
| **Reservation** | Retain reserve for **unfulfilled** stockable quantity; release only cancelled remainder |
| **Issue** | Issue **exactly** the fulfilled quantity for stockable lines; idempotent on `(organizationId, orderId, lineId, fulfilledQtyCheckpoint)` or movement `externalRef` |

`orders.order.partially_fulfilled` payloads must carry enough line/qty summary for Inventory idempotency (catalog already expects line summaries on order events).

---

### 6. Services (non-stocked offerings)

| Catalog signal | Inventory behavior |
| --- | --- |
| Not **stockable** (typical `service`, memberships, many fee offerings) | **No** reserve, **no** issue, **no** stock row required |
| Stockable goods on a mixed order | Affect **only** stockable lines |
| Product “consumes supplies” behind a service | Product calls Inventory `issueStock` with its own `externalRef` — **not** automatic from Orders line fulfill unless the line itself is stockable |

Catalog remains the trait SoR ([S2 Catalog](../implementation/catalog-implementation-package.md)); Inventory gates on stockable asserts. Orders must not grow a parallel “needsInventory” flag.

---

### 7. Event Ownership

| Event `type` | Owner | Role in this model |
| --- | --- | --- |
| `orders.order.created` / `updated` | **Orders** | Draft UX only — no Inventory mutation |
| `orders.order.committed` | **Orders** | **Triggers** Inventory reserve (consumer) |
| `orders.pricing.finalized` | **Orders** | Commercial/Reporting — no stock |
| `orders.order.partially_fulfilled` | **Orders** | **Triggers** issue of fulfilled qty |
| `orders.order.fulfilled` | **Orders** | **Triggers** issue of any residual reserved stockable qty |
| `orders.order.cancelled` | **Orders** | **Triggers** reservation release (+ restock policy above) |
| `orders.line.added` / `removed` | **Orders** | Draft only — no Inventory mutation |
| `inventory.stock.reserved` | **Inventory** | Reservation fact |
| `inventory.reservation.released` | **Inventory** | Release fact |
| `inventory.stock.issued` | **Inventory** | On-hand decrement fact |
| Other `inventory.stock.*` | **Inventory** | Receipts, transfers, adjustments — not driven by Orders by default |

**Publisher rules** ([ADR-0003](0003-event-contracts-and-outbox.md)): Orders never publishes `inventory.*`; Inventory never publishes `orders.*`. Projection ownership for Order → reserve/issue remains **Inventory** ([ADR-0005](0005-financial-truth-and-projection-ownership.md)).

---

### 8. Future Compatibility

| Concern | Compatibility |
| --- | --- |
| **Payments** | Capture/refund do not reserve or issue. Pay-at-POS packs still commit→fulfill on success in the **composer** after payment if product requires paid-before-stock-leave — that is orchestration order, not Inventory listening to `payments.capture.succeeded` as default |
| **Ledger** | Optional COGS/valuation still consume Inventory valuation/issue events if configured — never treat order commit as books ([ADR-0005](0005-financial-truth-and-projection-ownership.md) default: commit ≠ revenue) |
| **Reporting** | May project commit (operational sales) and inventory movements separately; must not redefine on-hand ([ADR-0005](0005-financial-truth-and-projection-ownership.md)) |
| **Replay / rebuild ([ADR-0004](0004-event-retention-replay-rebuild.md))** | Inventory applies order events **idempotently** (`eventId` / order+line checkpoints). Reporting rebuild may wipe analytics tables; it must not wipe `inventory_*` or `orders_*`. Correcting stock uses compensating movements, not silent balance edits from Reporting replay |
| **Financial ownership ([ADR-0005](0005-financial-truth-and-projection-ownership.md))** | Affirmed: Inventory owns reserve/issue SoR effects; Orders owns commercial lifecycle; Payments/Ledger unchanged |

---

## Vertical fit (single model)

| Vertical | How the default applies |
| --- | --- |
| **Retail** | Commit reserves store stock; pick/pack fulfill issues; cancel releases |
| **POS** | Composer: commit then immediate fulfill → reserve+issue in one user action without making issue-on-commit normative |
| **Restaurant** | Commit reserves only **stockable** lines (often none for menu finished goods); kitchen listens to Orders; ingredient consumption is product `issueStock` / recipe runs |
| **Service businesses** | Non-stockable lines ignored by Inventory; optional supply SKUs on separate stockable lines |

---

## Consequences

### Positive

* Clears S3 ambiguity with one overselling-aware default across verticals.
* Preserves **Orders ↛ Inventory** while still preventing double-sell via commit holds.
* Separates commercial firmness (commit) from physical outbound (fulfill) — correct for delayed fulfillment and cancellations.
* Keeps Payments and Ledger out of the stock path.
* Matches existing event catalog consumers (`committed` → Inventory; `cancelled` → release; Inventory owns `reserved` / `issued`).

### Negative / Trade-offs

* Pure POS must remember **fulfill** (or composer auto-fulfill); issue-on-commit is not implicit.
* Async reserve without pre-check can briefly accept a commit that Inventory cannot fully cover — mitigated by composer pre-check or shortage policy + compensating cancel.
* Restaurant finished-goods vs ingredients remains product discipline (Catalog stockable traits), not Orders special-casing.

### Follow-ups

1. Update [orders/design.md](../modules/orders/design.md) and [inventory/design.md](../modules/inventory/design.md) examples/sections to cite this ADR (done with acceptance).
2. S3 Orders implementation package / facade: emit fulfill events with line qty summaries sufficient for Inventory idempotency.
3. S6 Inventory: implement reserve-on-committed, issue-on-fulfill, release-on-cancel handlers; document shortage policy knobs.
4. Host composer guideline for POS: commit → fulfill (optional pay between) calling facades only.
5. Optional later: named pack template “issue at commit” as **explicit exception** if a regulated retail mode requires it — would need ADR amendment; not platform default.
6. Ensure architecture enforcement continues to forbid Orders → Inventory imports ([ADR-0006](0006-architecture-enforcement-and-governance.md)).

---

## Alternatives Considered

| Alternative | Why rejected |
| --- | --- |
| **Issue on commit (platform default)** | Oversimplifies POS at the expense of restaurant/mail-order/cancel-before-ship; conflates commercial and physical truths |
| **Reserve on draft** | Thrash and false scarcity |
| **Reserve/issue on payment capture** | Couples Inventory to Payments; breaks unpaid commitments and account sales |
| **Issue only on `orders.order.fulfilled` (header only)** | Weak partial fulfillment; encourage line-qty issue on partial |
| **Inventory imported by Orders for sync check** | Violates ADR-0002 DAG; host composer or Inventory APIs are the correct sync seam |
| **Per-vertical incompatible defaults** | Fragments Shared Domains; packs may narrow orchestration, not invent reverse ownership |

---

## References

- [ADR-0002](0002-domain-map.md) — Shared map; Orders vs Inventory placement
- [ADR-0003](0003-event-contracts-and-outbox.md) — producer-owned events / outbox
- [ADR-0004](0004-event-retention-replay-rebuild.md) — replay/idempotency; no Reporting wipe of Inventory SoR
- [ADR-0005](0005-financial-truth-and-projection-ownership.md) — Inventory owns order→reserve/issue projection
- [ADR-0006](0006-architecture-enforcement-and-governance.md) — host composers; DAG enforcement
- [orders/design.md](../modules/orders/design.md) · [inventory/design.md](../modules/inventory/design.md)
- [event catalog](../reference/event-catalog.md) — `orders.*` / `inventory.*` inventory
- [catalog-implementation-package.md](../implementation/catalog-implementation-package.md) — stockable vs service traits
- [kernel-completion-report.md](../reviews/kernel-completion-report.md) — Shared Domains sequencing
