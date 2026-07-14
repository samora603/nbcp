# Runbooks

Operational procedures for NBCP. Expand these as environments and services come online.

| Runbook | Purpose |
| --- | --- |
| [incident-response.md](incident-response.md) | Handling production incidents |
| [on-call.md](on-call.md) | On-call expectations |
| [rotate-secrets.md](rotate-secrets.md) | Secret rotation procedure |
| [event-replay.md](event-replay.md) | Idempotent event replay ([ADR-0004](../adr/0004-event-retention-replay-rebuild.md)) |
| [tenant-projection-rebuild.md](tenant-projection-rebuild.md) | Tenant-scoped Reporting rebuild |
| [full-reporting-rebuild.md](full-reporting-rebuild.md) | Full-environment Reporting rebuild |
| [rebuild-projections.md](rebuild-projections.md) | Stub → rebuild/replay runbooks |

## Principles

- Runbooks are actionable checklists, not essays.
- Keep contacts and tool links up to date.
- After major incidents, update the relevant runbook in the same remediation PR track.
