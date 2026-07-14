/** Permission catalog keys owned by Catalog. */
export const CatalogPermissions = {
  ItemRead: "catalog.item.read",
  ItemManage: "catalog.item.manage",
  TaxManage: "catalog.tax.manage",
} as const;

export type CatalogPermission =
  (typeof CatalogPermissions)[keyof typeof CatalogPermissions];

export const CATALOG_PERMISSION_KEYS: readonly string[] = Object.values(
  CatalogPermissions,
);
