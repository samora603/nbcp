# NBCP Cursor Prompt Library

This directory holds Noventra’s **engineering prompt system** for the Business Core Platform (NBCP). Prompts and rules here are first-class engineering assets: they encode how we design, review, and evolve the platform inside Cursor and similar AI-assisted workflows.

Treat them with the same care as ADRs and coding standards. They should remain accurate, opinionated, and aligned with `docs/`.

---

## Purpose

The Prompt Library exists to:

1. **Codify methodology** — Capture how NBCP expects architecture, scaffolding, and reviews to be done.
2. **Reduce variance** — Give every engineer (and every AI session) the same constraints and quality bar.
3. **Preserve institutional memory** — Survive team changes without relying on tribal knowledge.
4. **Complement documentation** — Points to ADRs and standards; does not replace them.

| Path | Role |
| --- | --- |
| `prompts/` | Task-oriented prompts you paste or attach when starting a focused effort |
| `rules/` | Persistent engineering constraints that should guide generation at all times |
| `README.md` | This guide — how to use and evolve the library |

---

## How to use prompts

1. **Read the relevant docs first** — at minimum `README.md`, `docs/architecture/overview.md`, and active ADRs.
2. **Open the matching prompt** under `prompts/` for the task you are about to run.
3. **Attach or paste** the prompt into the Cursor conversation (or `@`-reference the file).
4. **Supply context** — current phase, affected paths, constraints, and what must *not* change.
5. **Obey the prompt’s boundaries** — many prompts are review- or foundation-oriented and forbid implementation unless you explicitly request it afterward.
6. **Record outcomes** — promote durable decisions to ADRs; update standards when process changes.

### Using rules

- `rules/engineering.md` defines non-negotiable principles for NBCP work.
- Prefer keeping rules short, enforceable, and linked to repository docs.
- When Cursor project rules are configured, keep them synchronized with this file so humans and agents share one source of truth.

---

## When to create a new prompt

Create a new prompt only when **all** of the following are true:

1. The task will repeat (more than a one-off chat).
2. Existing prompts cannot cover it without becoming vague or contradictory.
3. The desired behavior needs durable constraints (scope, quality bar, forbidden actions).
4. An owner can maintain it as the platform evolves.

**Do not** create prompts for one-time experiments, temporary hacks, or duplicate coverage of an existing prompt with different wording.

Prefer improving an existing prompt over adding a near-duplicate.

---

## Naming conventions

### Prompts (`prompts/`)

```text
NN_short_snake_case.md
```

| Element | Rule |
| --- | --- |
| `NN` | Zero-padded two-digit sequence reflecting methodology order (`00`, `01`, …) |
| `short_snake_case` | Concise purpose (`repository_foundation`, `architecture_review`) |
| Extension | Always `.md` |

Examples:

- `00_repository_foundation.md`
- `01_architecture_review.md`

Reserved ranges (convention):

| Range | Intent |
| --- | --- |
| `00–09` | Foundation, architecture, governance |
| `10–29` | Module/package scaffolding and boundaries |
| `30–49` | Quality (testing, security, performance reviews) |
| `50–69` | Product composition and vertical concerns |
| `70–89` | Operations, release, incident-oriented prompts |
| `90–99` | Experimental — graduate or delete |

### Rules (`rules/`)

```text
topic_snake_case.md
```

Keep rule files few and stable. Prefer editing `engineering.md` over proliferating overlapping rule files.

---

## Versioning philosophy

Prompts are **living documents**, not frozen product versions.

1. **Evolve in place** for clarifications, stronger constraints, and alignment with new ADRs.
2. **Note material changes** in the file’s header (`Last updated`, brief changelog bullets when helpful).
3. **Do not invent a parallel semver scheme** for prompts unless the team later needs published packages of prompts.
4. **Breaking methodology changes** (e.g., abandoning modular monolith) require an ADR first; then update prompts and rules to match.
5. **Deprecate explicitly** — if a prompt is retired, either delete it in the same PR that removes references, or mark `Status: Deprecated` at the top with a pointer to the replacement.
6. **Quality over quantity** — a small, sharp library beats a large, stale one.

---

## Current inventory

| File | Purpose |
| --- | --- |
| [prompts/00_repository_foundation.md](prompts/00_repository_foundation.md) | Establish or verify repository foundation (structure, docs, workspace config) — no application code |
| [prompts/01_architecture_review.md](prompts/01_architecture_review.md) | Architecture health review across quality dimensions — report only unless implementation is requested |
| [rules/engineering.md](rules/engineering.md) | Standing engineering principles for all NBCP generation and review work |

---

## Relationship to project documentation

| Concern | Authority |
| --- | --- |
| Technology & structural decisions | `docs/adr/` |
| Day-to-day coding/API/DB standards | `docs/standards/` |
| How Cursor sessions should behave | `.cursor/prompts/` and `.cursor/rules/` |
| Product vision & glossary | `docs/vision.md`, `docs/glossary.md` |

If a prompt and an ADR disagree, **the accepted ADR wins**. Update the prompt immediately.

---

## Contribution checklist

Before merging changes to this library:

- [ ] Prompt scope is clear (what to do / what not to do)
- [ ] Language is professional and complete (no TODO stubs)
- [ ] Naming follows conventions
- [ ] Links to docs/ADRs are accurate
- [ ] Rules remain enforceable, not aspirational essays
- [ ] Inventory table in this README is updated when files are added or removed

---

## Status

Phase 0 Prompt Library is intentionally small. Expand only with explicit approval after demonstrated need.
