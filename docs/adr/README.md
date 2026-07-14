# Architecture Decision Records

Architecture Decision Records (ADRs) capture significant, durable choices for NBCP.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-platform-technology-foundation.md) | Platform technology & modular monolith foundation | Accepted |
| [0002](0002-domain-map.md) | NBCP domain map (core / shared / product) | Accepted |
| [0003](0003-event-contracts-and-outbox.md) | Event contracts and transactional outbox | Accepted |
| [0004](0004-event-retention-replay-rebuild.md) | Event retention, replay, and projection rebuild | Accepted |
| [0005](0005-financial-truth-and-projection-ownership.md) | Financial truth and projection ownership | Accepted |
| [0006](0006-architecture-enforcement-and-governance.md) | Architecture enforcement and governance | Accepted |

## Process

1. Draft significant proposals as an [RFC](../rfc/README.md) when discussion is needed.
2. Record the decision as an ADR using the [template](TEMPLATE.md).
3. ADRs are immutable once accepted; supersede with a new ADR instead of silently rewriting history.
4. Link ADRs from PRs that implement or rely on them.

## Status values

- **Proposed** — under discussion
- **Accepted** — approved for implementation
- **Rejected** — considered and declined
- **Superseded** — replaced by a newer ADR
- **Deprecated** — no longer recommended
