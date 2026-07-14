# Architecture Exceptions Register

**Policy:** [ADR-0006](../0006-architecture-enforcement-and-governance.md) Exceptions Process  
**Owner:** Platform architecture  
**Last updated:** 2026-07-14  

Temporary waivers of ADR-0006 gates **must** be listed here. Expired **Active** rows fail `@nbcp/architecture-enforcement` (rule C-06).

## Rules

* No silent exceptions — PR + this register  
* Default max duration ≤ 90 days; SECURITY/FINANCIAL ≤ 30 days  
* **Forbidden to except:** Identity independence; Payments writing `ledger_*`; wipe-rebuild of Ledger/Audit; production SECURITY without durable outbox  

## Active / historical exceptions

| ID | Rule | Scope | Reason | Status | Expires |
| --- | --- | --- | --- | --- | --- |
| — | — | — | No open kernel exceptions (M6) | — | — |

When adding a row, use Status `Active` or `Expired` and an ISO date in Expires (`YYYY-MM-DD`).
