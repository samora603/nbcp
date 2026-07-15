export type MovementType =
  | "reserve"
  | "release"
  | "issue"
  | "receipt"
  | "adjustment";

export interface Movement {
  movementId: string;
  organizationId: string;
  sku: string;
  type: MovementType;
  quantity: number;
  sourceEventId: string;
  sourceEventType: string;
  occurredAt: string;
  createdAt: string;
}

export type MovementView = Movement;

export function toMovementView(movement: Movement): MovementView {
  return structuredClone(movement);
}

export function idempotencyKey(
  organizationId: string,
  sourceEventId: string,
  sku: string,
  type: MovementType,
): string {
  return `${organizationId}:${sourceEventId}:${sku}:${type}`;
}
