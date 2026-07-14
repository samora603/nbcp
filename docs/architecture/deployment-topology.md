# Deployment Topology

## Environments

| Environment | Purpose |
| --- | --- |
| `local` | Developer machines via Compose (future) |
| `dev` | Shared integration environment |
| `staging` | Pre-production validation |
| `prod` | Production |

Promotion should move **immutable artifacts** (same image digest), not rebuild-from-source at the last moment.

## Hosting baseline

- **PostgreSQL**: Supabase-managed
- **Application runtimes**: To be decided per environment (containers on a cloud VM/Kubernetes or a PaaS) — track in a future ADR
- **Redis**: Managed Redis or self-hosted in Compose for local
- **Object storage**: Supabase Storage or compatible S3 API (future ADR)

## Local topology (planned)

```text
Developer machine
  ├─ apps/api
  ├─ apps/worker
  ├─ apps/web-*
  ├─ Postgres (or Supabase local / remote dev project)
  └─ Redis
```

## Status

`infra/docker` and `infra/terraform` directories exist as placeholders. No Compose files or Terraform modules are committed in Phase 0.1 beyond directory intent.
