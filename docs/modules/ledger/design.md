# Ledger Module — Design

| Field | Value |
| --- | --- |
| **Module** | `ledger` (`modules/ledger` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Orders](../orders/design.md) · [Inventory](../inventory/design.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [ADR-0005](../../adr/0005-financial-truth-and-projection-ownership.md) (financial truth; Payments→Ledger mapping) · [Tenant access model](../../architecture/tenant-access-model.md) · [Audit](../audit/design.md)

---

## 1. Purpose

The **Ledger** module is NBCP’s **reusable financial ledger**: tenant-owned **accounts**, **journal entries**, **postings**, and **balances** for commercial activity across all verticals.

It answers: *What accounting facts were booked, to which accounts, in what amounts, and what are the resulting balances?*

It does **not** answer: *How was a card captured, how is a cash drawer balanced, which PSP charge id succeeded, or how tips are tipped-out?* Those are **Payments** (and product ops) concerns. Ledger only records **economic accounting effects**, typically projected from Orders / Payments / Inventory events or explicit posting APIs.

### Must support (industry-neutral chart + posts)

| Vertical | Ledger usage |
| --- | --- |
| Restaurant accounting | Sales, COGS, comps — via order/payment/inventory projections |
| Hotel accounting | Room revenue, deposits, folio charges |
| Retail accounting | Sales, COGS, inventory valuation movements |
| Healthcare accounting | Service revenue, adjustments |
| Education accounting | Tuition revenue, refunds |
| Professional-services accounting | Retainer/revenue recognition posts |

Same aggregates for all: Account, JournalEntry, Posting — **no** vertical ledger subtypes.

### Explicit non-goals

- Card networks, cash drawers, payment gateways, processor settlement files  
- Tax engine UI (tax amounts may appear on posts; calculation ports live elsewhere)  
- Multi-book consolidation / statutory reporting suites (Reporting consumes ledger read models)  
- Mutating posted history in place  

---

## 2. Why card payments, cash handling, gateways, and processor transactions are NOT Ledger concepts

| Concept | Why not Ledger | Correct placement |
| --- | --- | --- |
| **Card payments** | Auth/capture/refund lifecycle, PAN tokens, card brand rules are payment-operations | **Payments** module + Integrations PSP adapters |
| **Cash handling** | Till open/close, denoms, over/short, cashier accountability | Retail/restaurant **product** + optional Payments cash tender |
| **Payment gateways** | HTTP/SDK adapters, webhooks, idempotent provider refs | **Integrations** implementing Payments ports |
| **Processor transactions** | Provider charge/payout ids, fees from acquirer reports | Payments stores provider refs; Ledger may post **fee expense** from a Payments event without knowing the gateway |

**Boundary rule:** Payments (future) owns *settlement attempts*; Ledger owns *double-entry facts*. A successful `payments.capture.succeeded` event may produce journal posts (Dr Undeposited Funds / Cr Revenue, etc.) via a **Ledger consumer** or host composer — Payments does **not** write `ledger_*` tables.

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Account** | Named bucket in a tenant chart (asset, liability, equity, revenue, expense) |
| **Journal entry** | Dated, balanced set of postings — append-only once posted |
| **Posting** | Single debit or credit line to one account within an entry |
| **Balance** | Derived sum of postings for an account (materialized cache allowed, rebuildable) |
| **Reversal** | New journal entry that negates a prior entry — the only correction mechanism |
| **Dimension / analytic** | Optional opaque refs on postings (`partyId`, `orderId`, `locationId`, `catalogItemId`) for reporting — not vertical domain objects |

---

## 4. Append-only contract (normative)

1. **Posted** journal entries and their postings are **immutable**.
2. **No UPDATE** of amounts, accounts, or dates on posted entries; **no DELETE** of posts in application APIs.
3. Corrections = **reversal entry** (full or partial per policy) referencing `reversesEntryId`, then optional replacement entry.
4. Draft entries (if used) may be edited until `post`; after post → append-only.
5. App DB role should deny UPDATE/DELETE on posted tables where feasible (same posture as Audit).

---

## 5. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **Account** | Chart-of-accounts node for a tenant |
| **JournalEntry** | Balanced batch of postings; status draft/posted; reversal links |

```text
Account (AR)
├── organizationId
├── code, name, type (asset|liability|equity|revenue|expense)
├── status (active|inactive)
└── parentAccountId? (optional tree)

JournalEntry (AR)
├── organizationId
├── entryDate / postedAt
├── status: draft | posted
├── Posting[] (entities)  — must balance in currency
├── source (orders|payments|inventory|manual|…)
├── reversesEntryId?
└── externalRef / correlationId
```

**Balances:** Prefer **derived** projections (`ledger_account_balances` as read model updated by posters). Balance table is not a mutable “source of truth” independent of posts — rebuild from postings if corrupted.

---

## 6. Aggregates (detail)

### 6.1 Account

**Invariants:**

1. Tenant-owned; `code` unique per organization among non-deleted.
2. `type` immutable after first posting (or require migrate use case).
3. Inactive accounts cannot receive new postings.

### 6.2 JournalEntry

**Invariants:**

1. At post time: Σ debits = Σ credits in the entry currency (multi-currency deferred or balanced per currency).
2. At least two postings when posted (simple balanced pair minimum).
3. Once `posted`, immutable; reversal creates a **new** entry.
4. Optional dimensions on postings must not invent restaurant/hotel-only required fields.
5. `source` + `externalRef` support idempotent projection from upstream events.

---

## 7. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **Posting** | JournalEntry | accountId, side (debit\|credit), amount, memo?, dimensions (partyId, orderId, locationId, catalogItemId, movementId — all optional opaque) |

---

## 8. Value objects

| Value object | Description |
| --- | --- |
| **AccountId** / **JournalEntryId** / **PostingId** | Opaque ids |
| **OrganizationId** / **LocationId** | Tenant / analytic dim |
| **AccountCode** | Tenant chart code |
| **AccountType** | asset \| liability \| equity \| revenue \| expense |
| **Money** | `{ currency, amountMinor }` |
| **DebitCredit** | debit \| credit |
| **EntryStatus** | draft \| posted |
| **EntrySource** | manual \| orders \| payments \| inventory \| opening_balance \| other |
| **ExternalRef** | Idempotency / correlation from upstream |
| **PartyId** / **OrderId** / **CatalogItemId** / **StockMovementId** | Analytic dims only |

---

## 9. Domain events (contracts)

Producer-owned facade + transactional outbox ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)). All **posted** and **reversal** events are security/financial — outbox mandatory.

| Event `type` | When | Typical consumers |
| --- | --- | --- |
| `ledger.account.created` / `updated` | Chart changes | Audit, reporting |
| `ledger.journal.posted` | Entry posted | Audit (**mandatory**), reporting balances |
| `ledger.journal.reversed` | Reversal posted | Audit (**mandatory**), reporting |
| `ledger.balance.changed` (optional) | Materialized balance update | Cache warmers |

**Payload essentials:** organizationId, journalEntryId, entryDate, totals, posting summaries (accountId, side, amount), source, externalRef, reversesEntryId?, correlationId.

---

## 10. Public APIs

Authorize: `ledger.account.manage`, `ledger.journal.post`, `ledger.journal.read`, `ledger.journal.reverse` after tenant context.

### Commands

| API | Behavior |
| --- | --- |
| `createAccount` / `updateAccount` / `inactivateAccount` | Chart maintenance |
| `createDraftEntry` / `addPosting` / `postEntry` | Manual journals |
| `postBalancedEntry({ postings, source, externalRef, … })` | Atomic create+post (preferred for projectors) |
| `reverseEntry({ journalEntryId, reason })` | Append reversal; emit `reversed` |
| `ensureDefaultChart({ organizationId, templateKey? })` | Seed minimal AR/AP/Cash/Revenue/COGS/… template |

### Queries

| API | Behavior |
| --- | --- |
| `getAccount` / `listAccounts` | Chart |
| `getJournalEntry` / `findEntries` | History (tenant-scoped) |
| `getAccountBalance({ accountId, asOf? })` | Balance |
| `trialBalance({ organizationId, asOf })` | Reporting aid |

### HTTP (illustrative)

- `GET/POST /v1/organizations/:organizationId/ledger/accounts`
- `POST /v1/organizations/:organizationId/ledger/journals`
- `POST /v1/organizations/:organizationId/ledger/journals/:id/post`
- `POST /v1/organizations/:organizationId/ledger/journals/:id/reverse`

---

## 11. Dependencies

```text
ledger → tenancy, rbac, (audit via outbox consumers / optional record)
ledger → orders | payments | inventory   [OPTIONAL: event contract imports for handlers]
orders | payments | inventory | parties | catalog  ↛  ledger
Core (identity/tenancy/rbac) ↛ ledger
```

| Depends on | Usage |
| --- | --- |
| **Tenancy** | Tenant ownership; optional location dim validation |
| **RBAC** | authorize |
| **Orders / Payments / Inventory** (optional) | Facade **event types only** for projectors inside Ledger or `apps/*` composers |

**Normative dependency statement (matches request):** Ledger’s **required** module deps are **Core** (tenancy, rbac). Interaction with Orders, Inventory, and Payments is **event-driven** (Ledger or app consumes their events and calls Ledger APIs). Upstream shared modules **must not** depend on Ledger (no reverse dependencies).

Parties/Catalog ids appear only as **posting dimensions**, not as package deps unless validating dims (prefer opaque trust of ids from already-validated upstream events).

---

## 12. How Orders, Inventory, and Payments interact with Ledger through events

```text
orders.order.committed / fulfilled / cancelled
        │
        ▼ (Ledger handler or app composer — idempotent on eventId)
ledger.postBalancedEntry(source=orders, externalRef=eventId/orderId, …)

payments.capture.succeeded / refund.succeeded   [future Payments module]
        │
        ▼
ledger.postBalancedEntry(source=payments, dimensions include orderId/partyId, …)

inventory.stock.issued / received / adjusted
        │
        ▼ (when inventory valuation enabled)
ledger.postBalancedEntry(source=inventory, COGS/inventory asset, externalRef=movementId, …)
```

| Upstream event | Typical posting pattern (illustrative, configurable) |
| --- | --- |
| Order committed/fulfilled | Dr AR or Cash clearing; Cr Revenue (by tax/policy) |
| Payment capture succeeded | Dr Cash/Clearing; Cr AR |
| Payment refund | Reverse / opposite posts |
| Inventory issue (sale) | Dr COGS; Cr Inventory asset |
| Inventory receipt | Dr Inventory; Cr GRNI/AP clearing |
| Order cancelled | Reversal entries of prior projections |

**Idempotency:** unique `(organizationId, source, externalRef)` on posted entries derived from upstream `eventId` or stable business key — never double-post on replay ([event-contracts.md](../../architecture/event-contracts.md)).

**Products** (restaurant tip rules, hotel folio folio-night revenue recognition nuances) configure **mapping templates** or post additional manual/adjustment entries — they do not fork Ledger aggregates.

---

## 13. Database ownership

Ledger owns `ledger_*` tables.

| Table | Contents |
| --- | --- |
| `ledger_accounts` | id, organization_id, code, name, type, status, parent_id, … |
| `ledger_journal_entries` | id, organization_id, entry_date, posted_at, status, source, external_ref, reverses_entry_id, … |
| `ledger_postings` | id, journal_entry_id, account_id, side, amount_minor, currency, party_id, order_id, location_id, catalog_item_id, stock_movement_id, memo, … |
| `ledger_account_balances` | account_id, organization_id, currency, balance_minor, as_of (materialized; rebuildable) |

**Tenant ownership rules:**

1. Every account/entry row has `organization_id`.
2. Queries always tenant-scoped; trial balance never crosses orgs.
3. No cross-tenant journals.
4. Insert-only for posted postings; reverse via new rows.

---

## 14. Audit requirements

| Action | Requirement |
| --- | --- |
| Account create/inactivate | Outbox → Audit |
| Journal posted | **Mandatory** Audit projection |
| Journal reversed | **Mandatory** Audit projection |
| Metadata | account codes, amounts, source refs — no card/PSP secrets |

Ledger’s own immutability **complements** Audit; both are append-oriented financial/security memory.

---

## 15. Event contract summary

- **Produces:** `ledger.journal.posted`, `ledger.journal.reversed`, account lifecycle events  
- **Consumes (optional handlers):** Orders / Payments / Inventory public events  
- **Does not require** Payments/Orders to import Ledger  

---

## 16. Chart seeding (illustrative)

`ensureDefaultChart` may create minimal accounts (examples): Cash, AR, AP, Inventory Asset, Sales Revenue, COGS, Tax Payable. Verticals extend via additional accounts — not via new Ledger module types.

---

## 17. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `ledger.account.read` / `manage` | Chart |
| `ledger.journal.read` | View entries |
| `ledger.journal.post` | Post drafts / balanced entries |
| `ledger.journal.reverse` | Reversals (sensitive) |

---

## 18. Testing expectations

| Focus | Assertion |
| --- | --- |
| Balance invariant | Unbalanced post rejected |
| Immutability | Posted entry cannot change amounts |
| Reversal | Reverse creates balancing opposite posts; original unchanged |
| Tenant isolation | Trial balance org-scoped |
| Idempotent projection | Replay same Orders eventId → single journal |
| Anti-leak | No CardPayment/CashDrawer/Gateway types in ledger domain |
| DAG | Orders/Inventory packages do not import `@nbcp/ledger` |

---

## 19. Implementation roadmap (non-binding)

1. Account + postBalancedEntry + balances + reverse  
2. Default chart seed  
3. Orders event projector (revenue/AR)  
4. Payments projector when Payments exists  
5. Inventory valuation projector (optional flag)  
6. Multi-currency ADR if required  

---

## 20. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §6  
- [domain-map.md](../../architecture/domain-map.md) §5.5  
- [orders/design.md](../orders/design.md) · [inventory/design.md](../inventory/design.md) · [payments](../modules/README.md) (future)  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md)  
- [module-standard.md](../../architecture/module-standard.md) · [audit/design.md](../audit/design.md)
