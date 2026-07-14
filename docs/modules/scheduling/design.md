# Scheduling Module — Design

| Field | Value |
| --- | --- |
| **Module** | `scheduling` (`modules/scheduling` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Business capability map](../../architecture/business-capability-map.md) · [Domain map §5.7](../../architecture/domain-map.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Tenant access model](../../architecture/tenant-access-model.md) · [Invitation / restaurant note](../../adr/0002-domain-map.md) (reservations are product-specific)

---

## 1. Purpose

The **Scheduling** module is NBCP’s **reusable time-and-capacity domain**: tenant-owned **resources**, **availability**, **time slots**, and **allocations** — expressed in industry-neutral language.

It answers: *What resource is occupied or free between which times, and what allocation holds that capacity?*

It does **not** answer: *Is this a dining reservation, hotel stay booking, clinical appointment, or class enrollment?* Those are **product workflows** that **compose** Scheduling (and often Parties / Orders) without Scheduling knowing their names.

### Must support (as generic capacity — not vertical ARs)

| Vertical need | Scheduling representation |
| --- | --- |
| Restaurant reservations | Product `Reservation` → allocates a resource/slot (table resource or section capacity) |
| Hotel bookings | Product `Booking` → may allocate room-type capacity / time ranges via resources |
| Healthcare appointments | Product `Appointment` → `ScheduleEntry` on practitioner/room resources |
| Education timetables | Product `Section`/`ClassMeeting` → recurring entries on room/teacher resources |
| Professional-services engagements | Product engagement sessions → entries on consultant resources |

### Explicit non-goals

- Owning reservation/booking/appointment/enrollment **business rules** (deposits, clinical acuity, credits, waitlists as product domains)  
- Kitchen / housekeeping boards as scheduled types named in Core  
- Replacing Catalog (sellable offerings) or Orders (commercial commitments)  

---

## 2. Why reservations, bookings, appointments, and enrollments are NOT Scheduling aggregates

| Concept | Why not a Scheduling AR | Correct composition |
| --- | --- | --- |
| **Reservation** (dining) | Ubiquitous language is F&B-specific (covers, waitlist, table combine). Elevating it would force hotels/clinics to inherit restaurant semantics ([ADR-0002](../../adr/0002-domain-map.md)). | `products/restaurant`: `Reservation` stores party size, preferences, `scheduleAllocationId` / `scheduleEntryId` |
| **Booking** (hotel stay) | Stay nights, guarantees, room assignment, folio — PMS product language. | `products/hotel`: `Booking` + room instance; optional Scheduling for blocks/holds |
| **Appointment** (healthcare) | Clinical reason, encounter link, provider privileges — clinic product. | `products/clinic`: `Appointment` → `scheduleEntryId` + `patientPartyId` |
| **Enrollment** | Academic term, roster, grading — education product. | `products/school`: `Enrollment` / timetable rows → schedule entries for meetings |

**Composition pattern:**

```text
Product aggregate (Reservation | Booking | Appointment | Enrollment meeting | EngagementSession)
        │  references opaque scheduleEntryId / allocationId
        │  holds vertical fields (covers, roomId, ICD context, sectionId, …)
        ▼
scheduling.Resource + ScheduleEntry / Allocation   (neutral)
```

Scheduling **never** imports `products/*`. Products may depend on Scheduling facade.

---

## 3. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Resource** | Anything that can be scheduled: person-slot, room-space, table, equipment — identified opaquely; **type is a string code**, not a vertical class hierarchy |
| **Availability** | Rules describing when a resource can be allocated (weekly hours, blackouts) |
| **Time slot** | A discrete bookable interval derived from availability + duration rules (optional first-class entity or computed) |
| **Allocation** / **Schedule entry** | A held interval on one or more resources (the occupancy fact) |
| **Attendee ref** | Optional opaque `partyId` / `principalId` on an entry — stored as id only; Scheduling does not own Party/CRM |

Public model uses **`Resource`**, **`AvailabilityRule`**, **`ScheduleEntry`** (allocation) — never `DiningReservation` / `HotelBooking` types inside this module.

---

## 4. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **Resource** | Schedulable capacity unit + timezone + status |
| **AvailabilityCalendar** (or rules on Resource) | Open hours / exceptions |
| **ScheduleEntry** | Allocation of time on resource(s); status active/cancelled |

```text
Resource (AR)
├── organizationId, locationId?
├── code, name, resourceTypeCode (opaque: "table" | "room_space" | "practitioner" | …)
├── capacity? (e.g. seats — generic integer)
├── status
└── AvailabilityRule[] (entities) + Blackout[]

ScheduleEntry (AR)
├── organizationId
├── resourceId (+ optional additional ResourceLink[])
├── startAt / endAt (UTC + original tz)
├── status: held | confirmed | cancelled
├── attendeePartyId? / attendeePrincipalId? (opaque)
└── externalRef (product correlation)
```

**Time slots:** Prefer **computed** from availability + duration for query APIs (`listOpenSlots`) rather than a heavy Slot AR — unless persistent slot inventories are required (then `Slot` entity under Resource with ADR).

---

## 5. Aggregates (detail)

### 5.1 Resource

**Invariants:**

1. Tenant-owned; `code` unique per organization (or per location when location-scoped).
2. `locationId`, if set, belongs to organization (Tenancy).
3. `resourceTypeCode` is an opaque allowlisted or free-string pack code — **not** an enum of vertical products in domain logic.
4. Inactive resources cannot receive new entries.

### 5.2 ScheduleEntry (allocation)

**Invariants:**

1. `endAt > startAt`.
2. Conflicts: overlapping `held`/`confirmed` entries on the same resource rejected (policy: allow overbook with permission — default **deny**).
3. Multi-resource entries: all resources same tenant; conflict checked per resource.
4. Cancel is status change + event; history retained (soft).
5. `externalRef` optional unique per tenant for idempotent product sync.

---

## 6. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **AvailabilityRule** | Resource | weekday / time range / effective dating |
| **Blackout** | Resource | closed interval + reasonCode |
| **ScheduleEntryResource** | ScheduleEntry | extra resources on one allocation |

---

## 7. Value objects

| Value object | Description |
| --- | --- |
| **ResourceId** / **ScheduleEntryId** | Opaque ids |
| **OrganizationId** / **LocationId** | Tenant scope |
| **ResourceTypeCode** | Opaque string |
| **Capacity** | Non-negative int |
| **TimeRange** | start/end Instant |
| **EntryStatus** | held \| confirmed \| cancelled |
| **PartyId** / **PrincipalId** | Optional opaque attendee dims |
| **ExternalRef** | Product correlation |
| **Timezone** | IANA tz for local rules |

---

## 8. Domain events (contracts)

Producer-owned facade + outbox for significant mutations ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)).

| Event `type` | When | Typical consumers |
| --- | --- | --- |
| `scheduling.resource.created` / `updated` | Resource changes | Audit, product caches |
| `scheduling.entry.created` | Allocation created | Product confirmations, Notifications, Audit |
| `scheduling.entry.confirmed` | held → confirmed | Product, Notifications |
| `scheduling.entry.cancelled` | Cancelled | Product release workflows, Audit |
| `scheduling.entry.rescheduled` | Time change | Product, Notifications |
| `scheduling.conflict.detected` (optional) | Overbook attempt | Audit/ops |

**Payload essentials:** organizationId, resourceId(s), entryId, start/end, status, externalRef?, attendee ids?, correlationId, eventId.

---

## 9. Public APIs

Authorize: `scheduling.resource.manage`, `scheduling.entry.manage`, `scheduling.entry.read`, `scheduling.availability.read`.

### Commands

| API | Behavior |
| --- | --- |
| `createResource` / `updateResource` / `inactivateResource` | Resource registry |
| `setAvailabilityRules` / `addBlackout` | Availability |
| `createEntry({ resourceId, range, externalRef?, attendeePartyId?, status? })` | Allocate; conflict check |
| `confirmEntry` / `cancelEntry` / `rescheduleEntry` | Lifecycle |
| `holdEntry` | Short-lived hold (TTL) for checkout UX |

### Queries

| API | Behavior |
| --- | --- |
| `getResource` / `listResources` | Registry |
| `listOpenSlots({ resourceId, from, to, duration })` | Computed availability |
| `getEntry` / `findEntries` | By resource/time/externalRef |
| `checkConflict({ resourceId, range, excludeEntryId? })` | Pre-flight |

### HTTP (illustrative)

- `POST /v1/organizations/:organizationId/scheduling/resources`
- `GET /v1/organizations/:organizationId/scheduling/resources/:id/slots`
- `POST /v1/organizations/:organizationId/scheduling/entries`
- `POST /v1/organizations/:organizationId/scheduling/entries/:id/cancel`

---

## 10. Dependencies

```text
scheduling → tenancy, rbac
scheduling ↛ products | orders | catalog | reservations
products → scheduling   (allowed)
```

| Depends on | Usage |
| --- | --- |
| **Tenancy** | organizationId, optional locationId |
| **RBAC** | authorize |
| **Parties / Identity** | **Not required**. Optional attendee ids are opaque; validation may be done in product/app |

| Must not depend on | Reason |
| --- | --- |
| **Any `products/*`** | Explicit ban |
| Orders / Catalog | Scheduling is capacity, not commerce (products glue them) |

Matches: **Scheduling → Core modules**; **no product dependencies**.

---

## 11. Database ownership

Scheduling owns `scheduling_*` tables.

| Table | Contents |
| --- | --- |
| `scheduling_resources` | id, organization_id, location_id, code, name, resource_type_code, capacity, status, timezone, … |
| `scheduling_availability_rules` | id, resource_id, rule payload, … |
| `scheduling_blackouts` | id, resource_id, start_at, end_at, reason_code, … |
| `scheduling_entries` | id, organization_id, resource_id, start_at, end_at, status, attendee_party_id, attendee_principal_id, external_ref, … |
| `scheduling_entry_resources` | entry_id, resource_id (multi-resource) |

**Tenant ownership rules:**

1. Every resource/entry has `organization_id`.
2. Queries always tenant-scoped; no cross-tenant allocations.
3. Location must belong to org when present.
4. No FKs into product tables.

---

## 12. Audit requirements

| Action | Requirement |
| --- | --- |
| Resource create/inactivate | Outbox → Audit |
| Entry create / confirm / cancel / reschedule | Outbox → Audit (cancel **recommended mandatory** for no-show disputes) |
| Metadata | ids, times, externalRef — no clinical notes in Scheduling |

---

## 13. Event contract summary

- **Produces:** resource + entry lifecycle events  
- **Consumes:** none required from products (products call APIs)  
- **Idempotency:** `eventId`; createEntry idempotent on `(organizationId, externalRef)` when provided  

---

## 14. How products compose workflows on top of Scheduling

| Product | Product aggregate | Scheduling usage |
| --- | --- | --- |
| **Restaurant** | `Reservation` (covers, waitlist, preferences) | Resource type `table`/`section`; `createEntry` for hold; product owns deposit via Orders/Payments |
| **Hotel** | `Booking` + `Room` | Optional resource for stay block or housekeeping window; room **instance** stays product |
| **Healthcare** | `Appointment` | Resource = practitioner/room; entry = visit window; encounter links `scheduleEntryId` |
| **Education** | `Section` / `ClassMeeting` | Teacher + room resources; recurring entries (recurrence expansion in product or future ADR) |
| **Professional Services** | `EngagementSession` | Consultant resource; billable link via Orders separately |

**Glue sequence (example — restaurant):**

1. Product validates party + covers.  
2. `scheduling.createEntry` (hold).  
3. Product persists `Reservation { scheduleEntryId, tablePreferences… }`.  
4. On confirm: `scheduling.confirmEntry` + optional Orders deposit.  
5. Kitchen never touched by Scheduling.

---

## 15. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `scheduling.resource.read` / `manage` | Resources & availability |
| `scheduling.entry.read` / `manage` | Allocations |
| `scheduling.entry.overbook` | Optional conflict override |

---

## 16. Testing expectations

| Focus | Assertion |
| --- | --- |
| Conflict detection | Overlapping confirmed entries denied by default |
| Tenant isolation | Cross-org resource access denied |
| Anti-leak | No Reservation/Booking/Appointment/Enrollment types in domain |
| DAG | No imports of `products/*` |
| Idempotent externalRef | Duplicate create with same ref returns same entry |
| Outbox | cancel/create emit outbox in same TX |

---

## 17. Implementation roadmap (non-binding)

1. Resource + availability rules + create/cancel entry + conflicts  
2. confirm/reschedule + open-slots query  
3. Multi-resource entries  
4. Recurrence ADR (education-heavy)  
5. Hold TTL worker  

---

## 18. Related documents

- [business-capability-map.md](../../architecture/business-capability-map.md) §8  
- [domain-map.md](../../architecture/domain-map.md) §3 (Reservations placement) & §5.7  
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [0002](../../adr/0002-domain-map.md) / [0003](../../adr/0003-event-contracts-and-outbox.md)  
- [module-standard.md](../../architecture/module-standard.md) · [product/restaurant.md](../../product/restaurant.md)
