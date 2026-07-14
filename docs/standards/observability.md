# Observability Standards

## Intent

Every NBCP runtime should be operable: failures are diagnosable, latency is measurable, and audits are constructible.

## Pillars

| Signal | Direction |
| --- | --- |
| Logs | Structured JSON; correlation IDs; no secrets |
| Metrics | RED/USE basics for API and workers |
| Traces | OpenTelemetry instrumentation when apps exist |

## Rules

1. Propagate request/correlation IDs across API and workers.
2. Log tenant and actor identifiers where safe and useful — never passwords or tokens.
3. Prefer semantic conventions over ad-hoc field names.
4. Define SLOs after production traffic exists; start with availability and error rate.
5. Dashboards and alerts are owned like code (future infra-as-code).

## Status

Telemetry packages are not present in Phase 0.1. This document sets expectations for scaffolding.
