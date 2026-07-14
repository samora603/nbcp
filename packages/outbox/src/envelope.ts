/**
 * Normative domain-event envelope (ADR-0003 / event-contracts.md).
 * Payload semantics are owned by the producing module; this type is infrastructure.
 */

export interface DomainEventEnvelope {
  /** Globally unique idempotency key (ULID / UUIDv7 recommended). */
  eventId: string;
  /** Catalog type, e.g. `identity.user.registered`. */
  type: string;
  /** Payload schema version; start at 1. */
  version: number;
  /** ISO-8601 UTC timestamp. */
  occurredAt: string;
  /** Owning module id: identity | tenancy | rbac | … */
  producer: string;
  /** Tenant scope; null only for global Identity facts. */
  organizationId: string | null;
  /** Request / trace correlation when available. */
  correlationId: string | null;
  /** Type-specific payload object. */
  payload: Record<string, unknown>;
}

/** Wire-level event ownership metadata derived from the envelope. */
export interface EventOwnership {
  producer: string;
  type: string;
  organizationId: string | null;
}

export function ownershipFromEnvelope(
  envelope: DomainEventEnvelope,
): EventOwnership {
  return {
    producer: envelope.producer,
    type: envelope.type,
    organizationId: envelope.organizationId,
  };
}

/** Catalog-aligned type pattern: module.resource.past_tense (2+ segments after module). */
export const EVENT_TYPE_PATTERN =
  /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;

export const PRODUCER_PATTERN = /^[a-z][a-z0-9_]*$/;
