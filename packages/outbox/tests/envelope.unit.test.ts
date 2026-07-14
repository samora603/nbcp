import { describe, expect, it } from "vitest";
import { validateEnvelope } from "../src/validate-envelope.js";
import { EnvelopeValidationError } from "../src/errors.js";
import { createFixtureEnvelope } from "../src/testing/harness.js";
import { ownershipFromEnvelope } from "../src/envelope.js";

describe("validateEnvelope", () => {
  it("accepts a valid catalog-aligned envelope", () => {
    const envelope = createFixtureEnvelope();
    expect(() => validateEnvelope(envelope)).not.toThrow();
  });

  it("rejects missing eventId", () => {
    const envelope = createFixtureEnvelope();
    expect(() =>
      validateEnvelope({ ...envelope, eventId: "" }),
    ).toThrow(EnvelopeValidationError);
  });

  it("rejects missing type", () => {
    const envelope = createFixtureEnvelope();
    expect(() => validateEnvelope({ ...envelope, type: "" })).toThrow(
      EnvelopeValidationError,
    );
  });

  it("rejects non-pattern type", () => {
    const envelope = createFixtureEnvelope({ type: "NotValid" });
    expect(() => validateEnvelope(envelope)).toThrow(EnvelopeValidationError);
  });

  it("rejects version < 1", () => {
    const envelope = createFixtureEnvelope({ version: 0 });
    expect(() => validateEnvelope(envelope)).toThrow(EnvelopeValidationError);
  });

  it("rejects bad occurredAt", () => {
    const envelope = createFixtureEnvelope();
    expect(() =>
      validateEnvelope({ ...envelope, occurredAt: "yesterday" }),
    ).toThrow(EnvelopeValidationError);
  });

  it("rejects bad producer", () => {
    const envelope = createFixtureEnvelope({ producer: "Identity" });
    expect(() => validateEnvelope(envelope)).toThrow(EnvelopeValidationError);
  });

  it("allows organizationId null", () => {
    const envelope = createFixtureEnvelope({ organizationId: null });
    expect(() => validateEnvelope(envelope)).not.toThrow();
  });

  it("rejects array payload", () => {
    const envelope = createFixtureEnvelope();
    expect(() =>
      validateEnvelope({ ...envelope, payload: [] as unknown as Record<string, unknown> }),
    ).toThrow(EnvelopeValidationError);
  });

  it("exposes ownership metadata", () => {
    const envelope = createFixtureEnvelope({
      producer: "tenancy",
      type: "tenancy.organization.created",
      organizationId: "org-1",
    });
    expect(ownershipFromEnvelope(envelope)).toEqual({
      producer: "tenancy",
      type: "tenancy.organization.created",
      organizationId: "org-1",
    });
  });
});
