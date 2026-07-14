# Parties Module — Design

| Field | Value |
| --- | --- |
| **Module** | `parties` (`modules/parties` — future implementation) |
| **Layer** | Shared Business ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companions:** [Tenant access model](../../architecture/tenant-access-model.md) · [Event contracts / ADR-0003](../../architecture/event-contracts.md) · [Domain map §5.1](../../architecture/domain-map.md)

---

## 1. Purpose

The **Parties** module is NBCP’s **canonical business actor model**: the durable, tenant-owned representation of people and organizations that a tenant **does business with or employs** — independent of login accounts.

It answers: *Who is this counterparty (person or org) in this tenant’s world, and what commercial roles do they play?*

It does **not** answer: *Can they log in?* (`identity`) or *Are they a member of the tenant workforce with RBAC?* (`tenancy` / `rbac`) — though a Party **may** optionally link to a `PrincipalId` when the same human is both an Identity user and a business actor (e.g. employee self-service).

### In scope

- Individuals (persons)
- Organizations (as counterparties — suppliers, corporate customers, vendor companies)
- Classifications / roles on a party: **Customer**, **Supplier**, **Vendor**, **Employee**, and extensible role keys
- Contacts (people related to an organization party, or secondary contacts on an individual)
- Addresses and communication channels as owned value/entity data
- Tenant-scoped search and lifecycle
- Reuse across Restaurant, Hotel, Retail, Healthcare, Education, Professional Services

### Explicit non-goals / anti-leak

| Not in Parties | Belongs in |
| --- | --- |
| Separate **Customer** module | Classification on Party (this module) |
| Login credentials / sessions | Identity |
| Tenant membership / invitations | Tenancy |
| Permissions | RBAC |
| Guest **folio**, student **enrollment**, patient **chart**, dining **reservation** | Product-specific domains referencing `partyId` |
| Menu / room type / POS ticket | Catalog / Orders / products |
| “Guest” / “Patient” / “Student” as Core type names | Product UX labels mapped to Party |

### Dependency rules

```text
identity ← tenancy ← rbac
                ↖________ ↖______
                    parties (Shared)

parties → tenancy, rbac (authorize), identity (optional PrincipalId link only)
parties may emit events; Audit consumes (parties may also call audit.record — allowed for Shared)
parties ↛ catalog | orders | inventory | ledger | payments | products
```

Identity and Tenancy **must not** depend on Parties. Core kernel remains independent of Shared Business.

---

## 2. Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Party** | Tenant-owned business actor — either an **individual** or an **organization** (counterparty) |
| **PartyId** | Opaque id; the only legal reference from Catalog, Orders, Inventory, Ledger, Payments, CRM UX |
| **Individual** | Party kind representing a person |
| **Organization party** | Party kind representing a company/institution as a counterparty (not the Tenancy `Organization` tenant) |
| **Tenant Organization** | Tenancy aggregate — the NBCP customer company using the platform (`OrganizationId`) |
| **Party role / classification** | Tagged capability: `customer`, `supplier`, `vendor`, `employee`, … |
| **Customer** | A Party that holds the `customer` classification — **not** a separate module or aggregate root |
| **Supplier / Vendor** | Classifications; vendor may be treated as synonym or subtype of supplier by policy (see §6) |
| **Employee** | Classification of a Party who works for the tenant; optional `PrincipalId` link |
| **Contact** | Named person channel related to a party (often under an organization party) |
| **Relationship** | Explicit link between two parties (e.g. contact-of, subsidiary-of) within a tenant |

**Critical distinction:** Tenancy `Organization` = SaaS tenant boundary. Parties “organization” kind = **counterparty company** in master data. Never conflate table names or ids.

---

## 3. Aggregates

| Aggregate | Responsibility |
| --- | --- |
| **Party** | Master record for one individual or organization actor; lifecycle; classifications; channels; addresses |
| **PartyRelationship** | Explicit edge between two parties in the same tenant (optional AR for independent lifecycle) |

**Contacts:** Prefer Contact as an **entity** inside Party when contacts are small and always edited with that party. Prefer **PartyRelationship** (`contact_of`) to another Individual party when the contact is themselves a first-class Party (searchable, orderable).  

**Normative v1:**  

- Communication endpoints and postal addresses are entities on **Party**.  
- **Contact person** for an organization party is either (a) child Contact entity (name + channels only) or (b) relationship to an Individual Party. Use (b) when the person must appear as Customer/Employee elsewhere.

```text
Party (AR)
├── kind: individual | organization
├── PartyClassification[]     (customer, supplier, vendor, employee, …)
├── ContactChannel[]          (email, phone, …)
├── PostalAddress[]
├── ContactPerson[]           (optional lightweight contacts)
└── optional principalId      (link to Identity — employees / portal users)

PartyRelationship (AR)
└── fromPartyId → toPartyId + relationshipType
```

---

## 4. Aggregates (detail)

### 4.1 Party

**Invariants:**

1. Every Party belongs to exactly one Tenancy `organizationId` (tenant ownership).
2. `kind` is `individual` or `organization` and is immutable after create (convert via explicit migrate use case + ADR if ever needed).
3. Display name required (derived rules: individual = given+family or displayName; organization = legal/trade name).
4. At least one classification may be required by product policy; platform allows zero transiently during draft create if status is `draft`.
5. `principalId`, when set, must exist in Identity (facade check); **at most one Party per (tenant, principalId)** when linked.
6. Email channels unique **per tenant** among active parties when marked `isPrimary` / login-eligible (policy); soft uniqueness recommended for primary email.
7. Soft-deleted parties cannot receive new orders/relationships; existing references remain historically valid.
8. No industry-specific required fields (MRN, folio number, student number) — those live in product modules keyed by `partyId`.

**Lifecycle statuses:**

| Status | Meaning |
| --- | --- |
| `draft` | Incomplete; may be hidden from sales search |
| `active` | Normal use |
| `inactive` | Disabled for new business; retained |
| `merged` | Surviving party exists; redirect reads (optional merge model) |
| `deleted` | Soft-deleted |

### 4.2 PartyRelationship

**Invariants:**

1. `fromPartyId` and `toPartyId` same tenant; not equal.
2. `relationshipType` from allowlist: `contact_of`, `subsidiary_of`, `employer_of` (inverse of employee classification optional), `billing_parent_of`, …
3. Unique `(from, to, type)` among active relationships.

---

## 5. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **PartyClassification** | Party | `roleKey` (`customer` \| `supplier` \| `vendor` \| `employee` \| custom), `grantedAt`, `metadata?` |
| **ContactChannel** | Party | `channelType` (email/phone/mobile/fax/other), `value`, `isPrimary`, `isVerified?` |
| **PostalAddress** | Party | Structured address lines, country, `usage` (billing/shipping/legal), `isDefault` |
| **ContactPerson** | Party | Lightweight `name`, optional channels — not a separate PartyId |
| **PartyRelationship** | (AR) | Edge between parties |

---

## 6. Value objects

| Value object | Description |
| --- | --- |
| **PartyId** | Opaque branded id |
| **OrganizationId** | Tenancy tenant id — owner scope |
| **LocationId** | Optional default/home location affinity (UI only; not AuthZ — see tenant access model) |
| **PrincipalId** | Optional Identity link |
| **PartyKind** | `individual` \| `organization` |
| **PartyStatus** | `draft` \| `active` \| `inactive` \| `merged` \| `deleted` |
| **PartyRoleKey** | `customer` \| `supplier` \| `vendor` \| `employee` \| registered extension keys |
| **PersonName** | `givenName`, `familyName`, `displayName`, honorifics optional |
| **OrganizationName** | `legalName`, `tradeName?` |
| **EmailAddress** / **PhoneNumber** | Normalized channels |
| **CountryCode** | ISO country |
| **RelationshipType** | Allowlisted string |

### Customer / Supplier / Vendor / Employee

These are **PartyRoleKey** values on `PartyClassification`, not separate aggregates:

| Role key | Typical meaning | Vertical reuse |
| --- | --- | --- |
| `customer` | Buys goods/services from tenant | All |
| `supplier` | Provides goods/services to tenant | Retail, restaurant, healthcare supplies, … |
| `vendor` | Often synonym of supplier or “marketplace seller”; allow both keys; products pick convention | Retail / procurement |
| `employee` | Works for tenant | All; portal users link `principalId` |

A single Party MAY hold **multiple** classifications (e.g. customer + supplier).

---

## 7. Domain events (contracts)

Publish via module facade + transactional outbox for security/master-data significance ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)). Envelope fields as in [event-contracts.md](../../architecture/event-contracts.md). `organizationId` is **always** set for Parties events.

| Event `type` | Payload (core) | Typical consumers |
| --- | --- | --- |
| `parties.party.created` | partyId, kind, status, roleKeys[] | Audit, search index, CRM UX |
| `parties.party.updated` | partyId, changedFields[] | Search, cache |
| `parties.party.activated` / `inactivated` | partyId | Orders validation |
| `parties.party.deleted` | partyId | Soft refs; block new orders |
| `parties.party.merged` | survivingPartyId, absorbedPartyId | Orders remaps (careful), search |
| `parties.classification.granted` | partyId, roleKey | Audit |
| `parties.classification.revoked` | partyId, roleKey | Audit |
| `parties.channel.added` / `removed` | partyId, channelType | Notifications prefs |
| `parties.relationship.created` / `removed` | relationshipId, from, to, type | CRM graph |
| `parties.principal_linked` / `unlinked` | partyId, principalId | Employee portal |

**Facade exports:** event types + envelope helpers only; no Prisma models.

---

## 8. Public APIs (facade)

Authorization: every mutating/query API runs after tenant context + `rbac.authorize` with permissions such as `parties.party.read|manage`, `parties.classification.manage` ([tenant access model](../../architecture/tenant-access-model.md)).

### 8.1 Commands

| API | Behavior |
| --- | --- |
| `createIndividual({ organizationId, name, channels?, roleKeys?, locationId?, principalId? })` | Create individual party |
| `createOrganizationParty({ organizationId, names, channels?, roleKeys?, … })` | Create counterparty org party |
| `updatePartyProfile({ partyId, organizationId, … })` | Update names/status fields |
| `activateParty` / `inactivateParty` / `deleteParty` | Lifecycle |
| `grantClassification({ partyId, roleKey })` | Add customer/supplier/… |
| `revokeClassification({ partyId, roleKey })` | Remove classification |
| `addContactChannel` / `removeContactChannel` / `setPrimaryChannel` | Channels |
| `addPostalAddress` / `updatePostalAddress` / `removePostalAddress` | Addresses |
| `addContactPerson` / `removeContactPerson` | Lightweight contacts |
| `linkPrincipal({ partyId, principalId })` | Employee/portal link; uniqueness check |
| `unlinkPrincipal({ partyId })` | Remove link |
| `createRelationship` / `removeRelationship` | PartyRelationship |
| `mergeParties({ survivingPartyId, absorbedPartyId })` | Optional advanced |

### 8.2 Queries

| API | Behavior |
| --- | --- |
| `getParty({ partyId, organizationId })` | Tenant-scoped get |
| `findParties({ organizationId, roleKey?, text?, status?, kind? })` | Search; never cross-tenant |
| `listClassifications(partyId)` | Roles |
| `getPartyByPrincipalId({ organizationId, principalId })` | Employee/portal lookup |
| `assertPartyUsable({ partyId, organizationId, requiredRoleKey? })` | For Orders: active + optional classification |

### 8.3 HTTP (illustrative)

- `POST /v1/organizations/:organizationId/parties`
- `GET /v1/organizations/:organizationId/parties/:partyId`
- `GET /v1/organizations/:organizationId/parties?role=customer&q=`
- `POST /v1/organizations/:organizationId/parties/:partyId/classifications`
- `POST /v1/organizations/:organizationId/parties/:partyId/principal-link`

---

## 9. Dependencies

| Depends on | Usage |
| --- | --- |
| **Tenancy** | `organizationId` ownership; `resolveTenantContext`; location existence if default location set |
| **RBAC** | `authorize` on all ops |
| **Identity** (optional) | Validate `principalId` on link |
| **Audit** (optional direct) | Shared may `audit.record`; also outbox → Audit consumers |
| **Files** (optional later) | Attachments via opaque file ids |

| Must not depend on | Reason |
| --- | --- |
| Catalog, Orders, Inventory, Ledger, Payments | Invert dependency — they reference `PartyId` |
| Product modules | Anti-leak |
| Writing `identity_*` / `tenancy_*` | Cross-module write ban |

---

## 10. Database ownership

Parties owns all `parties_*` tables. Other modules store **only** `party_id` opaque references (no FK required without ADR).

| Table | Contents |
| --- | --- |
| `parties_parties` | id, organization_id, kind, status, display_name, given/family or legal/trade names, principal_id nullable, default_location_id nullable, created_at, updated_at, deleted_at |
| `parties_classifications` | id, party_id, role_key, granted_at; UNIQUE(party_id, role_key) active |
| `parties_contact_channels` | id, party_id, channel_type, value_normalized, is_primary, … |
| `parties_postal_addresses` | id, party_id, usage, lines, country, is_default, … |
| `parties_contact_persons` | id, party_id, name, … |
| `parties_relationships` | id, organization_id, from_party_id, to_party_id, type, … |

**Indexes:** `(organization_id, status)`, `(organization_id, display_name)`, `(organization_id, principal_id)` unique where not null, classifications by `(organization_id, role_key)` via join, channel value search.

**Tenant ownership rules:**

1. Every row carries `organization_id` (or inherits via `party_id` with repository joins that always filter tenant).
2. All queries **must** include tenant predicate ([tenancy model](../../architecture/tenancy-model.md)).
3. Cross-tenant party access forbidden except platform break-glass + audit.
4. Location columns are affinity only — **not** used by RBAC authorize.

---

## 11. Audit considerations

| Action | Audit / event |
| --- | --- |
| Create/update/delete party | `parties.party.*` → Audit projection (outbox) |
| Grant/revoke customer (or any classification) | `parties.classification.*` |
| Link/unlink principal | `parties.principal_linked` — security-sensitive |
| Merge parties | Mandatory audit with both ids |

Metadata: ids and role keys only — no secrets. Prefer Audit consumer checklist entries for classification and principal link events ([event-contracts.md](../../architecture/event-contracts.md)).

---

## 12. Event contract summary (producer-owned)

- **Producer:** `parties`
- **Export:** facade event classes + envelope
- **Outbox:** required for created/deleted/merged, classification grant/revoke, principal link/unlink
- **Consumers may depend on** `@nbcp/parties` facade types if they already depend on Parties (Orders, Payments, …)
- **Parties does not import** consumers’ contracts

---

## 13. How future modules reference Party

All commercial modules store **`partyId`** (and tenant `organizationId`). They never copy party email/name as source of truth (denormalized display cache optional with refresh on `parties.party.updated`).

| Module | How it uses Party |
| --- | --- |
| **Catalog** | Rarely owns parties; may reference manufacturer/supplier `partyId` on items |
| **Orders** | `customerPartyId` (requires `customer` classification or `assertPartyUsable`); optional `billToPartyId` / `shipToPartyId` |
| **Inventory** | Supplier `partyId` on receipts/POs; not customers |
| **Ledger** | Sub-ledger links / dimensions by `partyId` for AR/AP |
| **Payments** | Payer/`partyId` on payment intents; refund destination party |
| **CRM features** | Product or thin apps Compose Parties search + classifications + relationships + notes (notes may be product module) |
| **Scheduling** | Attendee `partyId` optional |
| **Notifications** | Resolve channels from Party for non-user recipients |
| **Healthcare / Education / Hotel / Restaurant products** | Encounter/enrollment/guest/stay records hold `partyId`; industry fields stay in product tables |

```text
orders.order
  organization_id
  customer_party_id  ──► parties_parties.id
  …
```

Dependency direction:

```text
orders → parties → tenancy/rbac
payments → orders / parties
ledger → parties (refs)
inventory → parties (supplier refs)
```

---

## 14. Lifecycle examples

### 14.1 Restaurant — walk-in customer later saved

1. Staff authenticated; tenant context = Org_Resto / Loc_Main.  
2. `authorize(…, parties.party.manage, …)`.  
3. `createIndividual({ roleKeys: ['customer'], name, phone })` → `parties.party.created`.  
4. Order module: `createOrder({ customerPartyId })`.  
5. Product “reservation” (if any) references same `partyId` — not stored in Parties as Reservation.

### 14.2 Hotel — corporate account + guest

1. `createOrganizationParty({ roleKeys: ['customer'], legalName: 'Acme Corp' })`.  
2. `createIndividual({ roleKeys: ['customer'], name: 'Ada Guest' })`.  
3. `createRelationship({ from: Ada, to: Acme, type: 'contact_of' })`.  
4. Hotel booking product stores `guestPartyId` + optional `companyPartyId`; folio uses Orders/Payments with those ids.

### 14.3 Retail — supplier and customer

1. Vendor: `createOrganizationParty({ roleKeys: ['supplier','vendor'] })`.  
2. Inventory goods receipt references `supplierPartyId`.  
3. Walk-in or loyalty customer: individual + `customer`.  
4. POS order references `customerPartyId` (optional anonymous sale with null party — Orders policy).

### 14.4 Healthcare — patient as Party

1. Individual party + `customer` (or registered extension roleKey `patient` **in product pack classification registry**, not a Core aggregate).  
2. Clinic encounter table: `patient_party_id` + clinical fields.  
3. Parties never stores diagnoses.

*Prefer extension role keys via pack registration over Core enum explosion; Core seeds customer/supplier/vendor/employee.*

### 14.5 Education — student + guardian

1. Student individual party; guardian individual party; relationship `contact_of` / `guardian_of`.  
2. Enrollment product references `studentPartyId`.  
3. Tuition Orders use student or guardian as `customerPartyId` per school policy.

### 14.6 Professional services — client + employee

1. Client: organization or individual + `customer`.  
2. Consultant: individual + `employee` + `linkPrincipal(principalId)` for portal.  
3. Engagement product references `clientPartyId`; time entries reference employee party.

### 14.7 Customer classification lifecycle

```text
createIndividual(status=draft)
  → grantClassification(customer) → parties.classification.granted
  → activateParty
  → … orders …
  → revokeClassification(customer)  // still exists as party if supplier remains
  → inactivateParty                 // block new orders via assertPartyUsable
```

### 14.8 Employee link

```text
createIndividual(roleKeys=[employee])
  → identity user already exists (PrincipalId P)
  → linkPrincipal(partyId, P)   // unique per tenant
  → unlink on termination + inactivateParty / revoke employee classification
```

---

## 15. Seed permissions (illustrative)

| Permission | Intent |
| --- | --- |
| `parties.party.read` | View parties |
| `parties.party.manage` | Create/update/lifecycle |
| `parties.classification.manage` | Grant/revoke roles |
| `parties.principal.link` | Link Identity principal |
| `parties.relationship.manage` | Graph edges |
| `parties.party.merge` | Merge (sensitive) |

---

## 16. Testing expectations (when implemented)

| Layer | Focus |
| --- | --- |
| Unit | Multi-classification; immutable kind; principal uniqueness |
| Integration | Tenant isolation on search; email primary rules |
| AuthZ | Deny without permission; location assignment irrelevant to membership home |
| Contracts | Outbox row on create/classification/principal link |
| Negatives | No restaurant Reservation entity; Identity does not import Parties |

---

## 17. Implementation roadmap (non-binding)

1. Party + classifications + channels + addresses  
2. Search + `assertPartyUsable` for Orders  
3. Relationships + contact persons  
4. Principal link  
5. Merge (optional)  
6. Pack-registered extension role keys  

---

## 18. Related documents

- [Domain map](../../architecture/domain-map.md)
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [ADR-0002](../../adr/0002-domain-map.md) / [ADR-0003](../../adr/0003-event-contracts-and-outbox.md)
- [Tenant access model](../../architecture/tenant-access-model.md)
- [Identity](../identity/design.md) · [Tenancy](../tenancy/design.md) · [RBAC](../rbac/design.md) · [Audit](../audit/design.md)
- [Module standard](../../architecture/module-standard.md)
- [Glossary](../../glossary.md)
