# Runbook: Tenant Projection Rebuild (Reporting)

**Status:** Operational procedure (docs)  
**Policy:** [ADR-0004](../adr/0004-event-retention-replay-rebuild.md), [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)  
**Module:** Reporting ([reporting/design.md](../modules/reporting/design.md))  
**Last updated:** 2026-07-14  

Rebuild **one tenant’s** Reporting datasets / MVs from the event archive (and/or approved SoR snapshot sources). Preferred production rebuild mode.

---

## Preconditions

1. Target `organizationId` known and verified.  
2. Dataset keys identified (`sales_order_facts`, collections, etc.).  
3. Event archive covers required window **or** documented SoR re-fetch path exists.  
4. Rebuild tooling **allow-lists only** `reporting_*` tables / Reporting MVs — hard-fail on `ledger_*`, `payments_*`, `orders_*`, `audit_*`, `inventory_*`.  
5. Stakeholders notified: Reporting freshness will show **stale** during job.  
6. Change ticket for production.

### Forbidden

* Truncating or mutating Ledger posted journals.  
* Treating rebuild as correction of Payments/Orders truth.  
* Cross-tenant event bleed into tenant facts.  
* Tenant admin triggering FINANCIAL Ledger projectors.

---

## Authorization Requirements

| Environment | Authority |
| --- | --- |
| Non-prod | Engineers |
| Prod | Platform ops / data platform; optional org admin **request** only (ops executes) |
| Dual control | Required if rebuild accompanies FINANCIAL event replay into non-Reporting stores (should not) |

---

## Execution Steps

1. **Freeze writes (optional)** — Pause Reporting projectors for that tenant/datasets to avoid races.  
2. **Snapshot metrics** — Row counts / checksums for post-compare.  
3. **Truncate/clear** — Tenant-scoped delete for selected Reporting fact tables/MVs only.  
4. **Reset markers** — Clear matching `processed_events` for Reporting projectors for that tenant **or** use rebuild-specific consumer group.  
5. **Replay / re-project** — Feed events for `organizationId` + dataset input types (see event catalog); or SoR snapshot load if dataset docs allow.  
6. **Refresh MVs** — Per dataset registration.  
7. **Resume** — Re-enable live projectors; let live tail catch up if needed.  
8. Record job id and duration.

---

## Validation Steps

1. Row counts / checksums vs smoke queries and prior snapshot (expect explainable deltas if SoR changed).  
2. Spot-check: sample `orderId` / `paymentId` facts match **source modules** ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md) — source wins).  
3. Book-aligned finance dashboards: reconcile sample to **Ledger** read API, not the reverse.  
4. Operational sales datasets labeled non-book remain free to diverge from recognized revenue.  
5. No other tenant’s data present (spot query).  
6. Freshness API shows healthy after catch-up.

---

## Rollback Considerations

* Prior Reporting data is disposable; “rollback” = re-run rebuild from last known good archive cursor or restore Reporting backup **if** taken (optional pre-step).  
* Never roll back by writing to Orders/Payments/Ledger.  
* If projector bug remains, fix code then rebuild again.

---

## Audit Requirements

1. Log actor, `organizationId`, datasets, window, ticket, before/after counts.  
2. Export rebuild completion if product requires tenant-visible notice.  
3. Retain logs per OPERATIONAL/ANALYTICS policy (ADR-0004).

---

## References

- [full-reporting-rebuild.md](full-reporting-rebuild.md)  
- [event-replay.md](event-replay.md)  
- [ADR-0004](../adr/0004-event-retention-replay-rebuild.md)  
