export interface InventoryItem {
  inventoryItemId: string;
  organizationId: string;
  sku: string;
  onHand: number;
  reserved: number;
  createdAt: string;
  updatedAt: string;
}

export type InventoryItemView = InventoryItem & { available: number };

export function computeAvailable(item: InventoryItem): number {
  return item.onHand - item.reserved;
}

export function toInventoryItemView(item: InventoryItem): InventoryItemView {
  return {
    ...structuredClone(item),
    available: computeAvailable(item),
  };
}

export function assertNonNegativeAvailable(item: InventoryItem): void {
  const available = computeAvailable(item);
  if (available < 0) {
    throw new Error(`available stock cannot be negative: ${available}`);
  }
}

export function assertCanReserve(item: InventoryItem, quantity: number): void {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("reserve quantity must be a positive integer");
  }
  if (computeAvailable(item) < quantity) {
    throw new Error("insufficient available stock");
  }
}

export function assertCanIssue(item: InventoryItem, quantity: number): void {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("issue quantity must be a positive integer");
  }
  if (item.reserved < quantity) {
    throw new Error("issue exceeds reserved quantity");
  }
  if (item.onHand < quantity) {
    throw new Error("issue exceeds on-hand quantity");
  }
}

export function assertCanRelease(item: InventoryItem, quantity: number): void {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("release quantity must be a positive integer");
  }
  if (item.reserved < quantity) {
    throw new Error("release exceeds reserved quantity");
  }
}

export function assertCanAdjust(item: InventoryItem, delta: number): void {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("adjustment delta must be a non-zero integer");
  }
  const nextOnHand = item.onHand + delta;
  if (nextOnHand < item.reserved) {
    throw new Error("adjustment would reduce onHand below reserved");
  }
  if (nextOnHand < 0) {
    throw new Error("adjustment would result in negative onHand");
  }
}

export function applyReserve(
  item: InventoryItem,
  quantity: number,
  now: string,
): InventoryItem {
  assertCanReserve(item, quantity);
  const next = {
    ...item,
    reserved: item.reserved + quantity,
    updatedAt: now,
  };
  assertNonNegativeAvailable(next);
  return next;
}

export function applyRelease(
  item: InventoryItem,
  quantity: number,
  now: string,
): InventoryItem {
  assertCanRelease(item, quantity);
  const next = {
    ...item,
    reserved: item.reserved - quantity,
    updatedAt: now,
  };
  assertNonNegativeAvailable(next);
  return next;
}

export function applyIssue(
  item: InventoryItem,
  quantity: number,
  now: string,
): InventoryItem {
  assertCanIssue(item, quantity);
  const next = {
    ...item,
    onHand: item.onHand - quantity,
    reserved: item.reserved - quantity,
    updatedAt: now,
  };
  assertNonNegativeAvailable(next);
  return next;
}

export function applyReceive(
  item: InventoryItem,
  quantity: number,
  now: string,
): InventoryItem {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error("receive quantity must be a positive integer");
  }
  const next = {
    ...item,
    onHand: item.onHand + quantity,
    updatedAt: now,
  };
  assertNonNegativeAvailable(next);
  return next;
}

export function applyAdjust(
  item: InventoryItem,
  delta: number,
  now: string,
): InventoryItem {
  assertCanAdjust(item, delta);
  const next = {
    ...item,
    onHand: item.onHand + delta,
    updatedAt: now,
  };
  assertNonNegativeAvailable(next);
  return next;
}
