# Runbook: Event Replay

**Status:** Operational procedure (docs)  
**Policy:** [ADR-0004](../adr/0004-event-retention-replay-rebuild.md)  
**Related:** [Event catalog](../reference/event-catalog.md), [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md), [ADR-0006](../adr/0006-architecture-enforcement-and-governance.md)  
**Last updated:** 2026-07-14  

Re-deliver archived or hot domain events to **idempotent consumers**. This is **not** a Reporting table wipe (see [tenant-projection-rebuild.md](tenant-projection-rebuild.md) / [full-reporting-rebuild.md](full-reporting-rebuild.md)) and **not** a Ledger book rewrite.

---

## Preconditions

1. ADR-0004 Accepted; event archive/hot store available for the target window.  
2. Consumer(s) implement `processed_events` (or equivalent) keyed by `eventId`.  
3. Target event `type`s checked in [event catalog](../reference/event-catalog.md): **Replayable** = `Yes` or `Conditional`.  
4. **Dry-run** capability available for first use of a projector version in production.  
5. Change ticket / incident id for production FINANCIAL or SECURITY scopes.  
6. Confirm scope: `organizationId` (preferred), time range, `type` allow-list, consumer names.

### Forbidden

* Mutating published event payloads.  
* Cross-tenant replay without break-glass.  
* Blind full replay that can double-post Ledger without idempotent `externalRef`.  
* Using replay to delete/rewrite Audit rows.  
* Tenant admin self-serve financial projector replay.

---

## Authorization Requirements

| Environment | Authority |
| --- | --- |
| Non-prod | Engineers with env access |
| Prod — Reporting/ops consumers | Platform ops (on-call / data platform) |
| Prod — FINANCIAL (`Conditional`) | Platform ops **+ dual control** (second approver); finance/controller informed |
| Prod — SECURITY | Platform ops + security/compliance as required |
| Tenant admin | **Not** authorized for platform replay |

Record actor principal ids in the ops/Audit log.

---

## Execution Steps

1. **Classify** — Look up each `type` (classification, Replayable). Abort if `No`.  
2. **Ticket** — Open change/incident; for FINANCIAL attach dual-control approval.  
3. **Dry-run** — Count events in window; list consumer handlers; no writes (or write to shadow).  
4. **Quiesce (optional)** — Pause conflicting rebuild jobs for the same consumers.  
5. **Configure job** — `organizationId` (or documented full-scope exception), `types[]`, `from`/`to` (`occurredAt` or eventId cursor), `consumers[]`, `mode=replay`, `skipIfProcessed=true` (default).  
6. **Execute** — Rate-limit per ADR-0004; monitor lag/errors.  
7. **Ledger path** — If Ledger consumer included: only gap-fill missing journals via Ledger API with same `externalRef`; never UPDATE posted rows. Wrong books → stop; use reverse/replace ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)).  
8. **Complete** — Capture job id, counts processed/skipped/failed.

---

## Validation Steps

1. Zero unexpected consumer errors; poison queue empty for scope.  
2. Spot-check SoR for a sample of `eventId`s (Orders/Payments/Ledger as applicable).  
3. Reporting consumers only: dashboards/freshness within SLO after catch-up.  
4. Ledger: no duplicate postings for same `(organizationId, source, externalRef)`.  
5. Audit: replay job itself logged (actor, scope, ranges, consumers).

---

## Rollback Considerations

* Replay cannot “un-publish” events.  
* Compensating actions: fix projector bug → re-replay with skip-if-processed; Ledger mistakes → **reversal** journals, not delete.  
* If wrong consumer wrote bad derived data: use Reporting rebuild runbooks (Reporting only) — never truncate Ledger/Payments/Orders/Audit.  
* Abort mid-job is safe if consumers are idempotent; record partial cursor for resume.

---

## Audit Requirements

1. Mandatory ops/Audit entry: initiator, approvers, env, tenant scope, types, consumers, window, dry-run vs apply, result counts.  
2. Retain ticket link ≥ FINANCIAL/SECURITY retention class.  
3. Do not suppress Audit on FINANCIAL post/reverse side effects.

---

## References

- [ADR-0004](../adr/0004-event-retention-replay-rebuild.md)  
- [tenant-projection-rebuild.md](tenant-projection-rebuild.md)  
- [full-reporting-rebuild.md](full-reporting-rebuild.md)  
