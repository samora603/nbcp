# Git, Commits & Pull Requests

## Branching

- Trunk-based development from `main`
- Short-lived feature branches
- Protected `main` with required reviews and CI (when workflows are enabled)

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <short summary>

[optional body]

[optional footer]
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `style`, `perf`.

Examples:

```text
docs(adr): accept ADR-0001 platform technology foundation
chore(repo): add pnpm workspace and turbo config
```

## Pull requests

PRs should include:

1. **Summary** — why the change exists
2. **Test plan** — how it was verified (or why N/A)
3. **Risk / rollback** notes when infra or data is involved
4. Links to RFCs/ADRs when architecture shifts

Prefer small, reviewable diffs. Squash-merge is acceptable to keep `main` history readable.

## Do not

- Commit secrets
- Force-push shared branches without coordination
- Merge with failing required checks (once configured)
