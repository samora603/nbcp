# Security Standards

## Goals

Protect confidentiality, integrity, and availability of multi-tenant business data across all NBCP products.

## Required practices

1. **Secrets** — never commit credentials; use secret managers / env injection.
2. **Validation** — validate all untrusted input at boundaries.
3. **AuthZ** — deny by default; enforce server-side.
4. **Tenancy** — isolate organization data at repository / policy layers.
5. **Audit** — record security-sensitive actions when modules exist.
6. **Dependencies** — keep lockfiles committed; remediate high/critical issues promptly.
7. **Transport** — TLS in non-local environments.
8. **Uploads** — size/type limits and safe storage patterns when files module exists.
9. **PII** — classify sensitive fields; minimize retention and exposure.
10. **Threat modeling** — lightweight review for new high-risk modules.

## Reporting

Follow [SECURITY.md](../../SECURITY.md) for vulnerability disclosure.

## Status

Standards apply now for documentation and configuration hygiene. Runtime controls land with Phase 1+ modules.
