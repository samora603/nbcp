/** Composable offering kinds — not industry subclasses. */
export type OfferingTrait =
  | "goods"
  | "service"
  | "membership"
  | "bookable_offering"
  | "education_offering"
  | "healthcare_offering";

export const OFFERING_TRAITS: readonly OfferingTrait[] = [
  "goods",
  "service",
  "membership",
  "bookable_offering",
  "education_offering",
  "healthcare_offering",
] as const;

export type ItemStatus = "draft" | "active" | "inactive" | "deleted";

export type VariantStatus = "active" | "inactive" | "retired";

export interface Money {
  currency: string;
  amountMinor: number;
}

export interface ItemPrice {
  priceId: string;
  /** When null, price applies to the catalog item. */
  variantId: string | null;
  money: Money;
  validFrom: string | null;
  validTo: string | null;
}

export interface CatalogVariant {
  variantId: string;
  code: string;
  name: string;
  status: VariantStatus;
  stockable: boolean | null;
  options: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  catalogItemId: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  traits: OfferingTrait[];
  status: ItemStatus;
  /** May appear on new order lines when status is active. */
  orderable: boolean;
  /** Inventory may track qty when true; Catalog never stores qty. */
  stockable: boolean;
  taxCategoryId: string | null;
  supplierPartyId: string | null;
  /** Empty = all locations in tenant. */
  locationIds: string[];
  variants: CatalogVariant[];
  prices: ItemPrice[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type CatalogItemView = CatalogItem;

export function toCatalogItemView(item: CatalogItem): CatalogItemView {
  return structuredClone(item);
}

export function isTerminalStatus(status: ItemStatus): boolean {
  return status === "deleted";
}

/** Drafts and inactive/deleted items are not orderable for new lines. */
export function isItemOrderable(
  item: CatalogItem,
  opts: { variantId?: string | null; locationId?: string | null } = {},
): { ok: true } | { ok: false; reason: string } {
  if (item.status !== "active") {
    return { ok: false, reason: `item status is ${item.status}` };
  }
  if (!item.orderable) {
    return { ok: false, reason: "item is not orderable" };
  }
  if (item.locationIds.length > 0) {
    const loc = opts.locationId ?? null;
    if (!loc || !item.locationIds.includes(loc)) {
      return { ok: false, reason: "item not applicable at location" };
    }
  }
  if (opts.variantId) {
    const variant = item.variants.find((v) => v.variantId === opts.variantId);
    if (!variant) {
      return { ok: false, reason: "variant not found" };
    }
    if (variant.status !== "active") {
      return { ok: false, reason: `variant status is ${variant.status}` };
    }
  }
  return { ok: true };
}

export function isValidTrait(value: string): value is OfferingTrait {
  return (OFFERING_TRAITS as readonly string[]).includes(value);
}

export function moneyValidationError(money: Money): string | null {
  if (!money.currency || !/^[A-Z]{3}$/.test(money.currency)) {
    return "currency must be ISO 4217 (3 uppercase letters)";
  }
  if (
    typeof money.amountMinor !== "number" ||
    !Number.isInteger(money.amountMinor) ||
    money.amountMinor < 0
  ) {
    return "amountMinor must be a non-negative integer";
  }
  return null;
}

export function resolveListPrice(
  item: CatalogItem,
  opts: { variantId?: string | null; at?: string | null } = {},
): Money | null {
  const at = opts.at ?? null;
  const candidates = item.prices.filter((p) => {
    if (opts.variantId) {
      if (p.variantId !== opts.variantId) return false;
    } else if (p.variantId !== null) {
      return false;
    }
    if (at) {
      if (p.validFrom && p.validFrom > at) return false;
      if (p.validTo && p.validTo < at) return false;
    }
    return true;
  });
  if (candidates.length === 0 && opts.variantId) {
    return resolveListPrice(item, { at: opts.at ?? null });
  }
  return candidates[0]?.money ?? null;
}
