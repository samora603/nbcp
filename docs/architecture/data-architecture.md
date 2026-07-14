# Data Architecture

## System of record

**PostgreSQL** is the system of record for NBCP transactional data. Hosting is provided via **Supabase** (managed PostgreSQL and related platform services). See [ADR-0001](../adr/0001-platform-technology-foundation.md).

## Access layer

**Prisma** is the chosen ORM and migration tool for application data access.

## Principles

1. Module-owned tables with clear prefixes or ownership metadata (`identity_*`, `tenancy_*`, …).
2. Prefer explicit migrations reviewed in PRs.
3. Soft deletes only when business retention requires them; otherwise use status fields + audit.
4. Financial primitives favor append-only ledger patterns when those modules arrive.
5. Avoid unconstrained cross-module foreign keys without an ADR.
6. Connection secrets and database URLs never commit to git.

## Redis

Redis supports ephemeral concerns: queues (BullMQ), rate limiting, locks, and similar — not primary business truth.

## Status

No schemas, Prisma projects, or migrations exist in Phase 0.1. This document sets direction only.
