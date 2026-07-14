# Secret Rotation Runbook

> Phase 0.1 placeholder — no production secrets yet.

## Principles

1. Secrets never live in git.
2. Rotation is rehearsed, not improvised during compromise when avoidable.
3. Prefer short-lived credentials and automated rotation where possible.
4. Record rotations in the change/incident log as appropriate.

## Checklist (generic)

1. Identify the secret class (DB URL, API key, signing key, webhook secret, …).
2. Generate a new secret in the approved secret manager.
3. Deploy consumers dual-read or dual-write if keys require overlap.
4. Cut over traffic to the new secret.
5. Revoke/disable the old secret after verification.
6. Confirm health checks and critical flows.
7. Update runbooks if process gaps appeared.

## Emergency compromise response

1. Treat as a security incident ([incident-response.md](incident-response.md)).
2. Rotate immediately; invalidate sessions/tokens if applicable.
3. Audit access logs for abuse windows.
4. Notify stakeholders per severity and legal guidance.
