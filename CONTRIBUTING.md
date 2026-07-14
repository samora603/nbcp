# Contributing to NBCP

Thank you for contributing to the Noventra Business Core Platform. This document describes how we work so the platform remains coherent for 10+ years.

---

## Before You Start

1. Read the [README](README.md) and [architecture overview](docs/architecture/overview.md).
2. Review [engineering standards](docs/standards/README.md).
3. Check existing [ADRs](docs/adr/README.md) before proposing structural changes.
4. For significant design changes, open an [RFC](docs/rfc/README.md) before implementation.

---

## Development Model

- **Trunk-based development** — short-lived branches from `main`.
- **`main` is always releasable** — protect it with reviews and CI.
- **Conventional Commits** — see [Git & PR standards](docs/standards/git-commit-pr.md).
- **Small pull requests** — prefer focused changes with a clear test plan.

### Branch naming

| Prefix | Use |
| --- | --- |
| `feat/` | New capability |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `chore/` | Tooling, config, maintenance |
| `refactor/` | Internal restructuring without behavior change |
| `test/` | Test-only changes |

---

## Workflow

1. Create a branch from up-to-date `main`.
2. Make changes that match package/module boundaries.
3. Update docs or ADRs when behavior or architecture changes.
4. Open a pull request using the repository template.
5. Address review feedback; keep the PR reviewable.

### Pull request checklist

- [ ] Purpose is clear in the summary
- [ ] Scope matches one coherent change
- [ ] Docs / ADR updated if needed
- [ ] No secrets or environment credentials committed
- [ ] Test plan described (even if “N/A — docs only”)
- [ ] CI expectations understood for the touched paths

---

## Repository Boundaries (Critical)

| Area | Allowed to contain |
| --- | --- |
| `modules/` | Domain capabilities with hexagonal layout |
| `packages/` | Shared technical libraries (no vertical business rules) |
| `products/` | Thin product compositions |
| `apps/` | Deployable hosts only |
| `docs/` | Architecture, standards, ADRs, runbooks |

Do **not** introduce circular dependencies between modules. Import only public module facades.

---

## Code Standards

When application code exists:

- TypeScript strict mode
- Domain logic free of NestJS / Prisma / framework imports
- Tenant isolation enforced below the transport layer
- Tests accompany behavior changes

See [docs/standards](docs/standards/README.md) for the full set.

---

## Local Environment

Phase 0.1 provides workspace configuration only. Local development commands (`pnpm install`, `pnpm dev`, Compose stacks) will be documented when packages and apps are scaffolded.

- Node: version pinned in `.nvmrc`
- Package manager: pnpm (see root `package.json` `packageManager` field)

---

## Security

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

---

## Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Questions

- Architecture: propose an RFC or ADR amendment.
- Ownership: see [CODEOWNERS](CODEOWNERS).
- Operations: see [runbooks](docs/runbooks/README.md).
