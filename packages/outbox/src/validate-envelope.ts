import type { DomainEventEnvelope } from "./envelope.js";
import {
  EVENT_TYPE_PATTERN,
  PRODUCER_PATTERN,
} from "./envelope.js";
import { EnvelopeValidationError } from "./errors.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIso8601Utc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false;
  }
  const ms = Date.parse(value);
  return !Number.isNaN(ms);
}

/**
 * Validates a domain-event envelope before outbox append.
 * Does not load the event catalog; catalog CI is WP-06.
 */
export function validateEnvelope(
  envelope: unknown,
): asserts envelope is DomainEventEnvelope {
  if (envelope === null || typeof envelope !== "object") {
    throw new EnvelopeValidationError("Envelope must be an object");
  }

  const e = envelope as Record<string, unknown>;

  if (!isNonEmptyString(e.eventId)) {
    throw new EnvelopeValidationError("eventId is required");
  }
  if (!isNonEmptyString(e.type)) {
    throw new EnvelopeValidationError("type is required");
  }
  if (!EVENT_TYPE_PATTERN.test(e.type)) {
    throw new EnvelopeValidationError(
      `type must match module.resource.past_tense pattern; got "${e.type}"`,
    );
  }
  if (typeof e.version !== "number" || !Number.isInteger(e.version) || e.version < 1) {
    throw new EnvelopeValidationError("version must be an integer >= 1");
  }
  if (!isNonEmptyString(e.occurredAt) || !isIso8601Utc(e.occurredAt)) {
    throw new EnvelopeValidationError(
      "occurredAt must be a parseable ISO-8601 timestamp",
    );
  }
  if (!isNonEmptyString(e.producer) || !PRODUCER_PATTERN.test(e.producer)) {
    throw new EnvelopeValidationError(
      "producer must be a lowercase module id",
    );
  }
  if (e.organizationId !== null && !isNonEmptyString(e.organizationId)) {
    throw new EnvelopeValidationError(
      "organizationId must be a non-empty string or null",
    );
  }
  if (e.correlationId !== null && !isNonEmptyString(e.correlationId)) {
    throw new EnvelopeValidationError(
      "correlationId must be a non-empty string or null",
    );
  }
  if (
    e.payload === null ||
    typeof e.payload !== "object" ||
    Array.isArray(e.payload)
  ) {
    throw new EnvelopeValidationError("payload must be a non-null object");
  }
}
