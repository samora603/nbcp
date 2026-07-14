# Runbook: Full Reporting Rebuild

**Status:** Operational procedure (docs)  
**Policy:** [ADR-0004](../adr/0004-event-retention-replay-rebuild.md), [ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)  
**Module:** Reporting  
**Last updated:** 2026-07-14  

Rebuild Reporting datasets **across all tenants** (or entire environment). Non-prod anytime; **production only** under incident severity with dual approval and a maintenance window.

Prefer [tenant-projection-rebuild.md](tenant-projection-rebuild.md) whenever possible.

---

## Preconditions

1. Incident severity warrants full rebuild (corruption, bad projector shipped globally).  
2. Dual approval recorded (platform ops + engineering lead / SRE).  
3. Maintenance window communicated; Reporting APIs marked **stale**.  
4. Same table allow-list as tenant rebuild: **Reporting only**.  
5. Capacity plan: expect long runtime; rate-limit event replay.  
6. Optional: Reporting DB snapshot/backup before truncate.

### Forbidden

* Full rebuild tooling that can TRUNCATE Ledger, Payments, Orders, Audit, Inventory.  
* Skipping dual approval in production.  
* Using full rebuild to “fix” financial books ([ADR-0005](../adr/0005-financial-truth-and-projection-ownership.md)).

---

## Authorization Requirements

| Environment | Authority |
| --- | --- |
| Non-prod | Engineers |
| Prod | Dual control: platform ops **and** second approver (eng lead / SRE); change ticket mandatory |
| Tenant admins | Not authorized |

---

## Execution Steps

1. **Announce** — Status page / internal channel; set freshness = stale.  
2. **Pause** — Stop or drain Reporting projectors globally.  
3. **Backup (recommended)** — Snapshot Reporting store.  
4. **Truncate** — Full clear of selected Reporting facts/MVs (all tenants).  
5. **Reset markers** — All Reporting projector `processed_events` (or new consumer group).  
6. **Replay** — Archive → Reporting consumers; monitor lag; prefer tenant-partitioned workers to preserve isolation.  
7. **Refresh MVs** — Global.  
8. **Resume** live projectors.  
9. **Smoke** — Multi-tenant sample set.  
10. **Clear stale** when validation passes.

---

## Validation Steps

1. Global row-count sanity vs sum of per-tenant expectations (approx).  
2. No cross-tenant keys in sample facts.  
3. Sample reconciliation to Orders/Payments/Inventory/Ledger SoR (source wins).  
4. Finance dashboards do not contradict Ledger trial samples — if they do, **Ledger wins**; open projector bug, do not alter books.  
5. Export a known report definition succeeds.  
6. Audit/ops log complete.

---

## Rollback Considerations

* Restore Reporting snapshot if rebuild fails worse than before (Reporting-only restore).  
* Do not restore by replaying into Ledger.  
* Partial failure: fall back to per-tenant rebuilds for critical tenants first.

---

## Audit Requirements

1. Dual-control evidence attached to ticket.  
2. Job parameters, duration, counts, failures.  
3. Incident timeline link.  
4. Retain per ADR-0004 operational/analytics minima (prefer longer if incident is money-adjacent investigation).

---

## References

- [tenant-projection-rebuild.md](tenant-projection-rebuild.md)  
- [event-replay.md](event-replay.md)  
- [reporting/design.md](../modules/reporting/design.md)  
