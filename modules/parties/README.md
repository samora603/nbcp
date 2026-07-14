# `@nbcp/parties`

Shared Business **Parties** module (S1): canonical party master data — customers, suppliers, employees (classifications), contact methods, lifecycle.

## Dependencies

* `@nbcp/outbox` — event publication  
* `@nbcp/identity` — principal link validation  
* `@nbcp/tenancy` — tenant org / membership  
* `@nbcp/rbac` — authorize Parties permissions  
* `@nbcp/audit` — optional SECURITY record on principal link  

Must **not** depend on Catalog, Orders, Payments, Ledger, Inventory, or Reporting.

## Usage

```ts
const parties = createPartiesKernel({
  identity: identity.service,
  tenancy: tenancy.service,
  rbac: rbac.service,
  audit: audit.service,
  outboxStore,
});

const actor = {
  principalId: owner.principalId,
  organizationId: org.organizationId,
};

await parties.service.createIndividual(actor, {
  givenName: "Ada",
  familyName: "Lovelace",
  roleKeys: ["customer"],
});
```

Customer / supplier / employee are **classifications**, not separate aggregates.
