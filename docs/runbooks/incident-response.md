# Incident Response Runbook

> Phase 0.1 placeholder — refine when staging/production exist.

## Severity (draft)

| Severity | Description | Response intent |
| --- | --- | --- |
| SEV-1 | Full outage or confirmed tenant data exposure | Immediate all-hands mitigation |
| SEV-2 | Major feature unavailable / significant degradation | Rapid response within business hours+ |
| SEV-3 | Partial degradation with workaround | Planned fix |
| SEV-4 | Minor issue | Backlog |

## Immediate steps

1. **Declare** — name an incident commander; open an incident channel/thread.
2. **Assess** — blast radius, tenant impact, data risk, start time.
3. **Mitigate** — roll back, feature-flag off, scale, or fail closed as appropriate.
4. **Communicate** — status updates on an agreed cadence.
5. **Preserve evidence** — logs, traces, timelines for postmortem.
6. **Resolve** — confirm recovery; monitor for recurrence.
7. **Postmortem** — blameless write-up with action items within an agreed window.

## Security incidents

If tenant data may be exposed, involve security ownership immediately and follow [SECURITY.md](../../SECURITY.md) escalation norms.

## Contacts

- Platform on-call: *TBD*
- Security: *TBD* (`security@noventra.local` placeholder)
- Leadership escalation: *TBD*
