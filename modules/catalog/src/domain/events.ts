export const CatalogEventTypes = {
  ItemCreated: "catalog.item.created",
  ItemUpdated: "catalog.item.updated",
  ItemActivated: "catalog.item.activated",
  ItemInactivated: "catalog.item.inactivated",
  ItemDeleted: "catalog.item.deleted",
  VariantCreated: "catalog.variant.created",
  VariantUpdated: "catalog.variant.updated",
  PriceChanged: "catalog.price.changed",
} as const;

export type CatalogEventType =
  (typeof CatalogEventTypes)[keyof typeof CatalogEventTypes];

export const CATALOG_EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  Object.values(CatalogEventTypes),
);
