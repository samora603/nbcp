# On-Call Runbook

> Phase 0.1 placeholder — activate when production on-call begins.

## Expectations

- Acknowledge alerts within the agreed SLA.
- Follow [incident-response.md](incident-response.md) for active incidents.
- Prefer mitigation first, perfect root cause second.
- Hand off cleanly at shift boundaries with a brief written status.

## Tooling (planned)

- Alerting: *TBD*
- Dashboards: *TBD*
- Log access: *TBD*
- Deployment / rollback: *TBD*

## Escalation

1. Primary on-call
2. Secondary / module owner (via CODEOWNERS)
3. Security / leadership for SEV-1 or data incidents

## Health checks

When apps exist, document smoke checks here (API health, worker lag, DB connectivity, auth availability).
