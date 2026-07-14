# Notifications Module — Design

| Field | Value |
| --- | --- |
| **Module** | `notifications` (`modules/notifications` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Domain map §5.8](../../architecture/domain-map.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Tenant access model](../../architecture/tenant-access-model.md)

---

## 1. Purpose

The **Notifications** module is NBCP’s **reusable message dispatch domain**: tenant-owned (and optionally platform) **templates**, **message intents**, **channel selection**, **recipient resolution**, **dispatch**, and **delivery status** across **email**, **SMS**, **push**, and **future channels**.

It answers: *What template/payload should be sent, to whom, on which channel(s), and what was the delivery outcome?*

It does **not** answer: *When should a booking reminder fire, what is a marketing campaign audience, or what clinical/student wording is required?* Those are **product (or marketing) workflows** that **call Notifications APIs** or emit events that a composer turns into notification intents — without Notifications owning those business aggregates.

### Must support

| Channel | Representation |
| --- | --- |
| Email | Channel port + template body/subject |
| SMS | Channel port + short body |
| Push | Channel port + title/body/device tokens |
| Future channels | New adapter behind `NotificationChannelPort` — no domain fork |

### Explicit non-goals

- Marketing campaign builders, A/B tests, drip sequences as Notifications ARs  
- Booking/appointment/enrollment reminder **schedulers** as Notifications ARs  
- Clinical messaging compliance suites or SIS parent portals  
- Owning Party/Identity master data (resolve addresses via ports / opaque refs)  

---

## 2. Why marketing campaigns, booking reminders, patient communications, and student notifications are NOT Notifications aggregates

| Concept | Why not a Notifications AR | Correct placement |
| --- | --- | --- |
| **Marketing campaigns** | Audience segments, budgets, consent journeys, campaign analytics are marketing-product language. Notifications only sends **messages**. | Future marketing product / CRM product → `enqueueNotification` / bulk intents |
| **Booking reminders** | “24h before check-in” is hotel timing policy tied to `Booking`. | Hotel product worker emits/calls notify with `templateKey=booking.reminder` + data |
| **Patient communications** | Clinical content, care-gap campaigns, PHI workflow — healthcare product. | Clinic product → Notifications with templates; PHI minimization in payload policy |
| **Student notifications** | Grade posts, attendance alerts — education product. | School product → Notifications |

**Composition pattern:**

```text
Product / Core event (orders.committed, scheduling.entry.confirmed, booking.reminder.due, …)
        │
        ▼  product handler or apps composer
notifications.enqueue({ templateKey, recipient, channelHint, data, externalRef })
        │
        ▼
Template render → channel port → DeliveryAttempt statuses
```

Notifications **never** imports `products/*`.

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Template** | Named, versioned content definition per channel (or multi-channel) |
| **Notification intent** / **Message** | Request to notify a recipient using a template + data |
| **Recipient** | Resolved address endpoint(s): email, E.164 phone, push token ref — or refs to `partyId` / `principalId` for resolution |
| **Channel** | `email` \| `sms` \| `push` \| … |
| **Dispatch** | Hand-off to a channel adapter |
| **Delivery status** | Lifecycle of an attempt: queued → sending → sent → delivered / failed / bounced |

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **NotificationTemplate** | Template key, locale, channel, body/subject, version, status |
| **NotificationMessage** | Intent + rendered payload snapshot + overall status + attempts |

```text
NotificationTemplate (AR)
├── organizationId? (null = platform template)
├── key, locale, channel
├── subject?/body (or provider template ref)
├── version, status
└── variable schema (declared keys)

NotificationMessage (AR)
├── organizationId
├── templateKey / templateId + version snapped
├── RecipientSnapshot
├── channel selected
├── data / rendered snapshot
├── status
├── DeliveryAttempt[] 
└── externalRef / correlationId / sourceEventId?
```

---

## 5. Aggregates (detail)

### 5.1 NotificationTemplate

**Invariants:**

1. Unique `(organizationId, key, locale, channel, version)` among active templates (org null = platform).
2. Variables used in body must be declared or strictly escaped (no arbitrary code execution).
3. Inactive templates cannot be used for new messages.

### 5.2 NotificationMessage

**Invariants:**

1. Tenant-owned when `organizationId` set; platform/system messages allowed with policy.
2. Recipient must resolve to at least one channel address before send (or fail `undeliverable`).
3. Attempts append-only; success/failure recorded per attempt.
4. Idempotent enqueue on `(organizationId, externalRef)` when provided.
5. Payloads must not include secrets (passwords, raw cards, reset tokens in clear — use deep links opaque ids).

### Recipient resolution (owned capability, not Party module)

Resolution order (configurable):

1. Explicit address on command (`toEmail`, `toPhone`, `pushTokenId`).  
2. Else `principalId` → Identity facade port (email).  
3. Else `partyId` → Parties facade port (primary channel) — **optional port**; if Parties not wired, require explicit address.  

Hard package deps remain **Core**; Identity/Parties access via **ports** implemented in infrastructure (see §10) so domain does not hard-wire Shared graph beyond ports.

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **DeliveryAttempt** | NotificationMessage | channel, provider, providerMessageId, status, errorCode?, attemptedAt |
| **TemplateLocalization** (optional) | Template | split locale variants if not separate ARs |

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **TemplateId** / **MessageId** / **AttemptId** | Opaque ids |
| **OrganizationId** | Tenant scope |
| **TemplateKey** | Stable key e.g. `identity.password_reset`, `orders.receipt` |
| **Channel** | email \| sms \| push \| … |
| **Locale** | BCP-47 |
| **RecipientSnapshot** | Resolved addresses used at send time |
| **MessageStatus** | queued \| rendering \| sending \| sent \| delivered \| failed \| cancelled |
| **AttemptStatus** | pending \| sent \| delivered \| bounced \| failed |
| **PartyId** / **PrincipalId** | Optional resolution refs |
| **ExternalRef** | Caller idempotency / product correlation |
| **ProviderKey** | ses \| twilio \| fcm \| … |

---

## 8. Domain events (contracts)

Outbox for message terminal states that matter for ops/audit ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)).

| Event `type` | When | Typical consumers |
| --- | --- | --- |
| `notifications.template.published` | Template activated | Audit |
| `notifications.message.queued` | Intent accepted | Workers |
| `notifications.message.sent` | Provider accepted | Audit (optional sample), product |
| `notifications.message.delivered` | Provider delivery receipt | Product UX |
| `notifications.message.failed` | Exhausted retries | Audit **recommended**, ops alerts |
| `notifications.message.bounced` | Hard bounce | Party channel invalidation (product/parties handler) |

**Payload essentials:** organizationId, messageId, templateKey, channel, recipientFingerprint (hashed), status, externalRef?, sourceEventId?, providerIds?, correlationId, eventId.

Avoid putting full email body with PII in event payloads when possible; store on message aggregate and reference ids.

---

## 9. Public APIs

Authorize: `notifications.template.manage`, `notifications.message.enqueue`, `notifications.message.read` (tenant-scoped).

### Commands

| API | Behavior |
| --- | --- |
| `upsertTemplate` / `publishTemplate` / `retireTemplate` | Template lifecycle |
| `enqueueNotification({ organizationId, templateKey, locale?, recipient, data, channelHint?, externalRef?, idempotencyKey? })` | Create message + queue |
| `enqueueBulk` (optional) | Fan-out with rate limits — still message ARs, not Campaign AR |
| `cancelMessage` | If still queued |
| `recordProviderWebhook` | Update attempt/delivery status |

### Queries

| API | Behavior |
| --- | --- |
| `getTemplate` / `listTemplates` | Template admin |
| `getMessage` / `findMessages` | Status / support tooling |

### HTTP (illustrative)

- `POST /v1/organizations/:organizationId/notifications`
- `GET /v1/organizations/:organizationId/notifications/:messageId`
- `POST /v1/organizations/:organizationId/notification-templates`
- Provider webhooks → apps → Notifications application

---

## 10. Dependencies

```text
notifications → tenancy, rbac
notifications → ports: IdentityDirectory?, PartyDirectory?, ChannelAdapters (Integrations)
notifications ↛ products | orders | scheduling | campaigns
products / identity / tenancy composers → notifications  (via API or their own handlers)
```

| Depends on | Usage |
| --- | --- |
| **Tenancy** | Tenant ownership on templates/messages |
| **RBAC** | authorize admin/enqueue |
| **Integrations** | email/SMS/push adapters |
| **Identity / Parties** | Optional **ports only** for recipient resolution |

| Must not depend on | Reason |
| --- | --- |
| **`products/*`** | Explicit ban |
| Marketing/booking/clinic modules | Product triggers Notifications |

Matches: **Notifications → Core modules**; **no product dependencies**.

**Who triggers password reset email?** Identity must **not** import Notifications. Options (same as Audit pattern):

1. App composer after Identity use case, or  
2. Notifications (or apps) handler on `identity.password_reset.requested` — Notifications may depend on Identity **event contracts** (one-way). Identity stays free of Notifications.

---

## 11. Database ownership

Notifications owns `notifications_*` tables.

| Table | Contents |
| --- | --- |
| `notifications_templates` | id, organization_id nullables, key, locale, channel, version, subject, body, status, variable_schema, … |
| `notifications_messages` | id, organization_id, template_id, template_key, channel, status, recipient_snapshot, data/render jsonb, external_ref, correlation_id, … |
| `notifications_delivery_attempts` | id, message_id, status, provider, provider_message_id, error_code, attempted_at, … |

**Tenant ownership rules:**

1. Tenant messages always carry `organization_id`.  
2. Queries for tenant users filter by org; platform templates `organization_id IS NULL` readable per policy.  
3. No cross-tenant reads of message bodies.  
4. Soft-delete/retention configurable for PII (align privacy ADR).

---

## 12. Audit requirements

| Action | Requirement |
| --- | --- |
| Template publish/retire | Outbox → Audit |
| message.failed / bounce (security-relevant) | Recommended Audit |
| Password-reset / invite related sends | Prefer auditing **source domain events** (Identity/Tenancy); Notifications may additionally audit enqueue with hashed recipient |
| Metadata | Never log full message body with secrets; hash addresses where possible |

---

## 13. Event contract summary

- **Produces:** message/template lifecycle events  
- **May consume:** Core/Shared public events for known platform templates (password reset, invitation) without product imports  
- **Idempotency:** `eventId`; enqueue idempotent on `externalRef`  

---

## 14. How products trigger notifications

| Trigger style | Example |
| --- | --- |
| **Direct API** | Hotel booking service calls `enqueueNotification({ templateKey: 'hotel.booking.confirmed', data: {…}, externalRef })` |
| **Product event → composer** | `booking.reminder.due` (product outbox) → hotel worker → Notifications |
| **Shared event → Notifications handler** | `orders.order.committed` → optional receipt email (Notifications or app; if in Notifications, depends on Orders **events only**) |
| **Bulk API** | Marketing product loops/chunks `enqueue` — Campaign AR stays in marketing product |

Channel selection: caller `channelHint` or template’s channel; future rules engine remains inside Notifications as **generic** preference resolution (user prefs table), not “patient communication policy.”

---

## 15. Channel adapters

```text
NotificationChannelPort
  sendEmail / sendSms / sendPush / parseDeliveryWebhook
```

Domain has no SES/Twilio/FCM imports — infrastructure only.

---

## 16. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `notifications.template.manage` | Templates |
| `notifications.message.enqueue` | Send |
| `notifications.message.read` | Support view status |

---

## 17. Testing expectations

| Focus | Assertion |
| --- | --- |
| Idempotent enqueue | Same externalRef → one message |
| Template inactive | Enqueue fails |
| Tenant isolation | Cannot read other org messages |
| Anti-leak | No Campaign/BookingReminder/PatientMessage types |
| DAG | No `products/*` imports; Identity does not import Notifications |
| Redaction | Payloads reject password/token fields via deny-list |

---

## 18. Implementation roadmap (non-binding)

1. Templates + enqueue + email adapter + attempts  
2. SMS + push ports  
3. Webhook delivery status  
4. Platform handlers for Identity/Tenancy security emails  
5. Preference/suppression list (generic)  

---

## 19. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §9  
- [domain-map.md](../../architecture/domain-map.md) §5.8  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md)  
- [identity/design.md](../identity/design.md) · [module-standard.md](../../architecture/module-standard.md) · [audit/design.md](../audit/design.md)
