# Payments Module — Design

| Field | Value |
| --- | --- |
| **Module** | `payments` (`modules/payments` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Orders](../orders/design.md) · [Ledger](../ledger/design.md) · [Parties](../parties/design.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Tenant access model](../../architecture/tenant-access-model.md)

---

## 1. Purpose

The **Payments** module is NBCP’s **reusable payment processing domain**: tenant-owned **payment intents**, **authorization**, **capture**, **refund**, and **settlement state** against commercial payables (typically Orders).

It answers: *Was money authorized/captured/refunded for this payable, through which method/provider, and what is the settlement status?*

It does **not** answer: *Which GL account to debit, what is the trial balance, or how the chart of accounts is structured?* Those are **Ledger** concerns. Payments **publishes events**; Ledger (or an app composer) **consumes** them and posts journals — Payments **must not import Ledger**.

### Must support (neutral payment lifecycle)

| Vertical | Payments usage |
| --- | --- |
| Restaurant transactions | Settle checks / orders; tips as metadata or separate intents per policy |
| Hotel charges | Deposits, folio settlements against order(s) |
| Retail payments | POS tenders (card/cash/other) against sale orders |
| Healthcare billing collections | Patient pay / copay captures |
| Educational payments | Tuition / fee collections |
| Professional-services payments | Invoice / retainer captures |

Same aggregates for all verticals — no `HotelChargePayment` subtype in Core Payments.

### Explicit non-goals

- Chart of accounts, journal entries, account balances (→ **Ledger**)  
- Inventory movements (→ Inventory)  
- Order line editing (→ Orders)  
- PSP SDK details in domain (→ Integrations adapters behind ports)  
- Till/drawer UI sessions (→ product)  

---

## 2. Why ledger entries, account balances, and chart of accounts are NOT Payments concepts

| Concept | Why not Payments | Correct placement |
| --- | --- | --- |
| **Ledger entries** | Double-entry books are accounting facts; mixing them into payment capture couples every PSP change to CoA | **Ledger** `JournalEntry` / `postBalancedEntry` |
| **Account balances** | Derived from postings; payments only know provider settlement, not GL balances | **Ledger** balances read model |
| **Chart of accounts** | Tenant accounting structure; payment methods ≠ GL accounts | **Ledger** `Account` |

**Interaction (normative):**

```text
payments.capture.succeeded  (outbox event)
        │
        ▼  Ledger handler / apps composer (Payments ↛ Ledger package)
ledger.postBalancedEntry(source=payments, externalRef=eventId|paymentId, …)
```

Payments never writes `ledger_*` tables and never imports `@nbcp/ledger`.

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Payment** / **PaymentIntent** | Aggregate representing intent to collect or return money for a payable |
| **Authorization** | Hold / auth success at provider (card) — funds not necessarily captured |
| **Capture** | Collection of authorized or direct-sale funds |
| **Refund** | Return of previously captured funds (full/partial) |
| **Settlement state** | Provider/merchant settlement progress (`pending`, `settled`, `failed`, …) — distinct from Ledger “posted” |
| **Payable ref** | Typically `orderId` (Orders); opaque enough for future invoice ids via `payableType` + `payableId` |
| **partyId** | Optional payer Party (customer) |
| **Provider ref** | Opaque PSP identifiers (charge id, payment intent id) — no PAN |

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **Payment** | Intent + method + amounts + auth/capture/refund lifecycle + settlement state + provider refs |

```text
Payment (AR)
├── organizationId, locationId?
├── payableType + payableId (orderId for v1)
├── partyId? (payer)
├── amount / currency / capturedAmount / refundedAmount
├── status (lifecycle)
├── settlementStatus
├── PaymentAttempt[] (entities) — auth/capture/refund tries
├── method (card|cash|bank|other) + non-sensitive method display
└── provider / providerRefs
```

Optional **Refund** as nested entity lifecycle under Payment rather than separate AR (v1: refunds are attempts on the same Payment AR).

---

## 5. Aggregates (detail)

### 5.1 Payment

**Invariants:**

1. Tenant-owned (`organizationId`); optional `locationId` for place of tender (Tenancy-validated).
2. Amount > 0 for capture intents; currency required.
3. For `payableType=order`, `payableId` must exist / be payable via Orders facade (`getOrder` in committed/fulfillable state per policy).
4. `capturedAmount +` in-flight ≤ authorized/sale amount policy; `refundedAmount ≤ capturedAmount`.
5. Status transitions are explicit (see §5.2); illegal transitions throw.
6. No card PAN/CVV stored; provider tokens only via Integrations vault ports.
7. Cash methods may skip provider auth and go `authorized`/`captured` locally with settlementStatus reflecting till policy.
8. Idempotency keys required on create/capture/refund API (client + provider).

### 5.2 Lifecycle statuses (intent)

| Status | Meaning |
| --- | --- |
| `requires_payment_method` | Created; awaiting method |
| `authorized` | Auth hold success |
| `capture_pending` | Capture requested |
| `captured` | Funds captured |
| `partially_refunded` | Some refunds done |
| `refunded` | Fully refunded |
| `cancelled` | Voided / abandoned |
| `failed` | Terminal failure |

**Settlement state** (orthogonal):

| settlementStatus | Meaning |
| --- | --- |
| `unsettled` | Not yet settled with merchant account |
| `pending` | In settlement batch |
| `settled` | Settled |
| `settlement_failed` | Settlement problem (ops) |

Ledger may post on `captured` even if settlement still `pending` (accounting policy); settlement updates emit further events for ops — optional second Ledger postings only if policy requires.

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **PaymentAttempt** | Payment | kind (`authorize`\|`capture`\|`refund`\|`void`), amount, status, providerRef, errorCode?, occurredAt |
| **PaymentMethodSnapshot** | Payment | brand last4, wallet type, `cash`, etc. — display only |

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **PaymentId** | Opaque id |
| **OrganizationId** / **LocationId** | Tenant / tender place |
| **OrderId** / **PartyId** | Payable + payer refs |
| **PayableRef** | `{ type: 'order' \| …, id }` |
| **Money** | `{ currency, amountMinor }` |
| **PaymentStatus** / **SettlementStatus** | Enums above |
| **PaymentMethodType** | card \| cash \| bank_transfer \| other |
| **ProviderKey** | `stripe` \| `adyen` \| `manual` \| … |
| **IdempotencyKey** | Client-supplied uniqueness |
| **ProviderReference** | Opaque string |

---

## 8. Domain events (contracts)

Producer-owned facade + transactional outbox ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)). Financial events are outbox-**mandatory**.

| Event `type` | When | Typical consumers |
| --- | --- | --- |
| `payments.payment.created` | Intent created | Audit, product UX |
| `payments.authorization.succeeded` / `failed` | Auth result | Audit, product |
| `payments.capture.succeeded` / `failed` | Capture result | **Ledger**, Orders (paid flag policy), Audit **mandatory on success** |
| `payments.refund.succeeded` / `failed` | Refund result | **Ledger**, Orders, Audit **mandatory on success** |
| `payments.payment.cancelled` | Cancelled | Ledger optional reverse, Audit |
| `payments.settlement.updated` | Settlement state change | Ops, optional Ledger |

**Payload essentials:** organizationId, paymentId, payableType/Id (orderId), partyId?, amounts, currency, provider, providerRefs, locationId?, status, settlementStatus, correlationId, eventId.

**Ledger consumption (no import from Payments into Ledger required for DAG — Ledger depends on Payments event contracts):**

```text
payments.capture.succeeded → ledger.postBalancedEntry(…, source=payments, externalRef=eventId)
payments.refund.succeeded  → ledger reverse/opposite posts
```

---

## 9. Public APIs

Authorize: `payments.payment.create|capture|refund|read|cancel` after tenant context.

### Commands

| API | Behavior |
| --- | --- |
| `createPaymentIntent({ organizationId, orderId, amount?, partyId?, methodHint?, idempotencyKey })` | Create; amount default from order balance due policy |
| `attachPaymentMethod({ paymentId, method via port })` | Tokenize via Integrations |
| `authorizePayment({ paymentId, idempotencyKey })` | Provider auth |
| `capturePayment({ paymentId, amount?, idempotencyKey })` | Capture |
| `refundPayment({ paymentId, amount?, reason?, idempotencyKey })` | Refund |
| `cancelPayment({ paymentId })` | Cancel if allowed |
| `recordCashPayment({ orderId, amount, … })` | Manual capture path without PSP |
| `updateSettlementStatus({ paymentId, settlementStatus })` | Ops / webhook projection |

### Queries

| API | Behavior |
| --- | --- |
| `getPayment` / `findPaymentsByOrder` / `findPayments` | Tenant-scoped |
| `getOrderPaymentSummary({ orderId })` | Captured/refunded/remaining |

### HTTP (illustrative)

- `POST /v1/organizations/:organizationId/payments`
- `POST /v1/organizations/:organizationId/payments/:id/authorize`
- `POST /v1/organizations/:organizationId/payments/:id/capture`
- `POST /v1/organizations/:organizationId/payments/:id/refund`
- Provider webhooks → `apps/api` → Payments application handlers (signatures verified in Integrations)

---

## 10. Dependencies

```text
payments → orders, parties, tenancy, rbac
payments → integrations (ports only; adapters in infrastructure)
payments ↛ ledger | inventory | products
ledger → payments (event contracts)   # allowed one-way
orders ↛ payments                     # Orders does not import Payments; may react to events optionally
```

| Depends on | Usage |
| --- | --- |
| **Orders** | Validate payable order; amounts; optional mark paid via Orders facade **or** event only (prefer Orders consuming `capture.succeeded` if status needed) |
| **Parties** | Optional payer `partyId` validation |
| **Tenancy / RBAC** | Tenant context + authorize |
| **Integrations** | `PaymentProviderPort` (authorize/capture/refund/webhook parse) |

| Must not import | Reason |
| --- | --- |
| **Ledger** | Explicit ban — events only |
| Inventory / product modules | Wrong boundary |

If Orders needs a `paymentStatus`, either: (a) Orders handler on Payments events, or (b) query Payments by orderId — **not** Payments writing Orders tables (no cross-module write). Prefer (a) in Orders package (Orders → Payments events) **or** keep payment state only in Payments and read via BFF. **DAG note:** Orders depending on Payments event types creates `orders → payments`. Request requires `Payments → Orders`. To avoid a cycle:

- **Normative:** Orders does **not** depend on Payments. Order “amount due” computed by BFF: order totals − Payments summaries. Product UIs call both facades.  
- Alternatively a future tiny `packages/order-payment-readmodel` — not required now.

**Hard rule preserved:** `Payments → Orders`, `Payments ↛ Ledger`.

---

## 11. Database ownership

Payments owns `payments_*` tables.

| Table | Contents |
| --- | --- |
| `payments_payments` | id, organization_id, location_id, payable_type, payable_id, party_id, currency, amount_minor, captured_minor, refunded_minor, status, settlement_status, provider, method_type, method_snapshot, … |
| `payments_attempts` | id, payment_id, kind, amount_minor, status, provider_ref, error_code, occurred_at, idempotency_key |

**Tenant ownership rules:**

1. Every payment row has `organization_id`.
2. All queries tenant-filtered; location must belong to org when set.
3. Cross-tenant payment access forbidden.
4. Opaque orderId/partyId; no Ledger FKs.

---

## 12. Audit requirements

| Action | Requirement |
| --- | --- |
| create / authorize / capture / refund / cancel | Outbox → Audit; **capture & refund success mandatory** on checklist |
| Metadata | paymentId, orderId, amounts, provider refs — **never** PAN/CVV/full track data |
| Failures | Recommended audit for fraud monitoring |

---

## 13. Event contract summary

- **Produces:** authorization/capture/refund/settlement events for Ledger & Audit  
- **Consumes:** optional Orders events only if auto-creating intents on commit (product/app may create intents explicitly instead)  
- **Idempotency:** `eventId` + attempt `idempotency_key`  

---

## 14. Provider ports (infrastructure)

```text
PaymentProviderPort
  createRemoteIntent / authorize / capture / refund / parseWebhook
```

Domain never imports Stripe/Adyen SDKs — only port interfaces ([domain map Integrations](../../architecture/domain-map.md)).

---

## 15. Vertical composition examples

| Product | Flow |
| --- | --- |
| Restaurant | Order commit → createPaymentIntent → capture (card) or recordCashPayment → Ledger from event |
| Hotel | Deposit intent against booking’s orderId; capture on no-show policy in product |
| Retail | POS capture; cash via recordCashPayment; drawer in product |
| Healthcare / Education / Prof. services | Same intent/capture against fee/engagement orders |

Tips, split tenders, depositha: product orchestration creating multiple Payment aggregates — still generic Payment ARs.

---

## 16. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `payments.payment.read` | View |
| `payments.payment.create` | Create intents |
| `payments.payment.capture` | Capture |
| `payments.payment.refund` | Refund (sensitive) |
| `payments.payment.cancel` | Cancel |

---

## 17. Testing expectations

| Focus | Assertion |
| --- | --- |
| Payable validation | Cannot capture unknown/cancelled order per policy |
| Amount invariants | Refund cannot exceed captured |
| Idempotent capture | Same idempotency key → one attempt |
| Tenant isolation | Org-scoped get |
| Anti-leak | No JournalEntry/Account types in payments domain |
| DAG | Package does not import `@nbcp/ledger` |
| Outbox | capture.succeeded in same TX as status update |

---

## 18. Implementation roadmap (non-binding)

1. Payment AR + cash + manual provider  
2. Card provider adapter (Integrations) + webhooks  
3. Capture/refund + outbox events  
4. Document Ledger mapping templates  
5. Settlement webhook updates  

---

## 19. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §7  
- [domain-map.md](../../architecture/domain-map.md) §5.4  
- [orders/design.md](../orders/design.md) · [ledger/design.md](../ledger/design.md) · [inventory/design.md](../inventory/design.md)  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md)  
- [module-standard.md](../../architecture/module-standard.md) · [audit/design.md](../audit/design.md)
