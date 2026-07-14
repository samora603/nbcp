# `@nbcp/catalog`

Shared Business **Catalog** module (S2): canonical commercial offering registry — products and services as CatalogItems, variants, list prices, availability metadata, lifecycle.

## Dependencies

* `@nbcp/outbox` — event publication  
* `@nbcp/tenancy` — tenant org / membership / locations  
* `@nbcp/rbac` — authorize Catalog permissions  
* `@nbcp/parties` — optional supplier party validation  
* `@nbcp/audit` — optional Audit `record`  
* `@nbcp/identity` — allowed for host/actor wiring (not required in facade)

Must **not** depend on Orders, Payments, Ledger, Inventory, or Reporting.

## Usage

```ts
const catalog = createCatalogKernel({
  tenancy: tenancy.service,
  rbac: rbac.service,
  parties: parties.service,
  outboxStore,
});

const actor = {
  principalId: owner.principalId,
  organizationId: org.organizationId,
};

await catalog.service.createItem(actor, {
  code: "WIDGET-01",
  name: "Widget",
  traits: ["goods"],
  status: "active",
  listPrice: { currency: "USD", amountMinor: 2500 },
});
```

Goods / services are **traits** on CatalogItem — not separate aggregates.
