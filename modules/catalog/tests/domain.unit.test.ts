import { describe, expect, it } from "vitest";
import {
  isItemOrderable,
  isTerminalStatus,
  moneyValidationError,
  resolveListPrice,
  OFFERING_TRAITS,
  type CatalogItem,
} from "../src/domain/catalog-item.js";
import {
  CatalogEventTypes,
  CATALOG_EVENT_TYPE_SET,
} from "../src/domain/events.js";
import { CATALOG_PERMISSION_KEYS } from "../src/application/permissions.js";

function baseItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    catalogItemId: "item1",
    organizationId: "org1",
    code: "SKU-1",
    name: "Widget",
    description: null,
    traits: ["goods"],
    status: "active",
    orderable: true,
    stockable: true,
    taxCategoryId: null,
    supplierPartyId: null,
    locationIds: [],
    variants: [],
    prices: [
      {
        priceId: "p1",
        variantId: null,
        money: { currency: "USD", amountMinor: 1000 },
        validFrom: null,
        validTo: null,
      },
    ],
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("catalog domain unit", () => {
  it("exposes offering traits for goods and services", () => {
    expect(OFFERING_TRAITS).toContain("goods");
    expect(OFFERING_TRAITS).toContain("service");
  });

  it("lifecycle and orderability helpers", () => {
    expect(isTerminalStatus("deleted")).toBe(true);
    expect(isTerminalStatus("active")).toBe(false);
    expect(isItemOrderable(baseItem()).ok).toBe(true);
    expect(isItemOrderable(baseItem({ status: "inactive" })).ok).toBe(false);
    expect(isItemOrderable(baseItem({ status: "deleted" })).ok).toBe(false);
    expect(isItemOrderable(baseItem({ status: "draft" })).ok).toBe(false);
  });

  it("respects location applicability", () => {
    const item = baseItem({ locationIds: ["loc-a"] });
    expect(isItemOrderable(item, { locationId: "loc-a" }).ok).toBe(true);
    expect(isItemOrderable(item, { locationId: "loc-b" }).ok).toBe(false);
    expect(isItemOrderable(item).ok).toBe(false);
  });

  it("validates money", () => {
    expect(moneyValidationError({ currency: "USD", amountMinor: 0 })).toBeNull();
    expect(moneyValidationError({ currency: "usd", amountMinor: 1 })).not.toBeNull();
    expect(
      moneyValidationError({ currency: "USD", amountMinor: -1 }),
    ).not.toBeNull();
  });

  it("resolves list price with variant fallback", () => {
    const item = baseItem({
      variants: [
        {
          variantId: "v1",
          code: "S",
          name: "Small",
          status: "active",
          stockable: null,
          options: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      prices: [
        {
          priceId: "p1",
          variantId: null,
          money: { currency: "USD", amountMinor: 1000 },
          validFrom: null,
          validTo: null,
        },
        {
          priceId: "p2",
          variantId: "v1",
          money: { currency: "USD", amountMinor: 900 },
          validFrom: null,
          validTo: null,
        },
      ],
    });
    expect(resolveListPrice(item)?.amountMinor).toBe(1000);
    expect(resolveListPrice(item, { variantId: "v1" })?.amountMinor).toBe(900);
  });

  it("event and permission keys match catalog prefixes", () => {
    for (const t of CATALOG_EVENT_TYPE_SET) {
      expect(t.startsWith("catalog.")).toBe(true);
    }
    expect(CatalogEventTypes.PriceChanged).toBe("catalog.price.changed");
    expect(CATALOG_PERMISSION_KEYS).toContain("catalog.item.manage");
    expect(CATALOG_PERMISSION_KEYS).toContain("catalog.tax.manage");
  });
});
