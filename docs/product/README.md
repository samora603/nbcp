# Product Compositions

Vertical products are **thin compositions** of NBCP platform modules plus product-specific UI and domain rules.

| Product | Doc | Status |
| --- | --- | --- |
| Restaurant | [restaurant.md](restaurant.md) | Placeholder |
| Hotel | [hotel.md](hotel.md) | Placeholder |
| Retail POS | [retail-pos.md](retail-pos.md) | Placeholder |
| Healthcare (Clinic) | [clinic.md](clinic.md) | Placeholder |
| Education (School) | [school.md](school.md) | Placeholder |
| Professional Services | [professional-services.md](professional-services.md) | Placeholder |
| Property Management | [property.md](property.md) | Placeholder (additional vertical) |

Domain boundaries for all verticals: [architecture/domain-map.md](../architecture/domain-map.md) ([ADR-0002](../adr/0002-domain-map.md)).

## Rules

1. Do not fork the platform per product.
2. Product-specific bounded contexts stay out of Core Platform and Shared Business unless elevated by ADR (≥2 verticals, shared language).
3. Entitlements gate product packs when billing exists.
4. Map stakeholder terms (Guest, Menu, Patient) onto Party, Catalog, Order, Scheduling, etc. at the product layer.
