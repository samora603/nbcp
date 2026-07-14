# NBCP Engineering Rules

| Field | Value |
| --- | --- |
| **Status** | Active |
| **Last updated** | 2026-07-14 |
| **Authority** | Standing rules for all NBCP design and code generation |
| **Superseded by** | Accepted ADRs when a rule and ADR conflict — then update this file |

These rules guide humans and AI assistants working in this repository. They apply to architecture, documentation, configuration, and future application code.

---

## 1. Think before coding

- Restate the goal, constraints, and non-goals before changing the tree.
- Prefer a short design note or ADR/RFC when the change is structural.
- If requirements are ambiguous, ask or document assumptions explicitly — do not invent product scope silently.
- Match the current phase: foundation work stays foundation; feature work requires an intentional phase shift.

## 2. Never violate Clean Architecture

- Keep domain logic free of NestJS, Next.js, Prisma, HTTP, and queue framework imports.
- Dependencies point inward: infrastructure and transport adapt to the domain/application layers — not the reverse.
- Controllers, pages, and workers remain thin orchestration at the edges.
- Persistence models are not domain models; map deliberately at boundaries.

## 3. Keep modules independent

- Modules expose a deliberate public facade; other packages must not import infrastructure internals.
- No circular dependencies between modules.
- Cross-module collaboration prefers application APIs or domain events — not shared mutable shortcuts.
- Product-specific rules belong in `products/` (or product modules), not smuggled into the platform kernel.

## 4. Optimize for maintainability

- Clarity beats cleverness. Optimize for the engineer reading this in five years.
- Small, reviewable changes outperform sprawling “fix while here” diffs unless explicitly tasked.
- Name things using `docs/glossary.md`.
- Delete or avoid speculative abstractions that lack a second real use case.

## 5. Security by design

- Deny by default for authorization when authz exists.
- Enforce multi-tenant isolation below the UI — organization scope is a platform invariant.
- Never commit secrets; use examples and secret managers only.
- Validate untrusted input at trust boundaries.
- Call out security and tenancy impact in PRs and design notes for sensitive changes.
- Follow `SECURITY.md` for vulnerability handling — no public disclosure of exploits.

## 6. Production quality only

- No prototype-quality paths intended to “clean up later” without an explicit debt record and owner.
- Prefer tested, observable, and reversible changes.
- CI and docs are part of the product, not optional accessories.
- Shortcuts require documented acceptance criteria for removal.

## 7. Never introduce unnecessary complexity

- Modular monolith first; do not introduce microservices, brokers, or multi-region topology without an ADR and clear extraction criteria.
- Do not dual-stack public API styles (e.g., REST + GraphQL) without a demonstrated need.
- Prefer the simplest design that meets security, tenancy, and multi-product reuse goals.
- Complexity must buy a measurable property (isolation, scale, compliance, clarity).

## 8. Follow NBCP documentation standards

- Significant decisions become ADRs; proposals that need debate start as RFCs.
- Update docs in the same change set when behavior or structure changes.
- Keep README phase status honest.
- Do not leave empty documentation stubs; write complete guidance or do not add the file.
- Engineering prompts under `.cursor/` are documentation — keep them consistent with ADRs.
- New domain modules must follow [`docs/architecture/module-standard.md`](../docs/architecture/module-standard.md) and the template under `modules/_templates/domain-module/`.

## 9. Prefer reusable solutions over one-off implementations

- Shared capabilities belong in `modules/` or `packages/`; vertical one-offs stay in `products/`.
- Before adding a third copy of a pattern, extract a shared primitive or generator.
- Design APIs, events, and UI primitives for multi-product reuse unless the requirement is explicitly single-vertical.
- Avoid forking the platform per customer or per product.

## 10. Explain trade-offs before major architectural changes

- For boundary moves, new shared kernels, data-store changes, or hosting model shifts: present options, consequences, and recommendation before implementing.
- Record the choice in an ADR when accepted.
- Do not implement major architecture changes inside an unrelated feature PR.
- When recommending a change that conflicts with ADR-0001 or other accepted ADRs, treat it as an ADR amendment proposal.

---

## Additional standing constraints

### Technology baseline

Respect ADR-0001 unless superseded: TypeScript, NestJS, Next.js, PostgreSQL (Supabase), Prisma, Redis, BullMQ, pnpm, Turborepo, modular monolith.

### Repository shape

Honor the monorepo layout and dependency direction described in `docs/architecture/`. Use generators (when they exist) rather than inventing divergent module skeletons.

### AI-assisted work

- Obey task prompts in `.cursor/prompts/` when they are attached for a session.
- Do not install dependencies or scaffold frameworks unless the active task explicitly allows it.
- Prefer evidence from the repository over assumptions from training data.
- End foundation or review tasks with a summary and wait for approval when the prompt requires a gate.

---

## Quick self-check before finishing work

- [ ] Did I stay within the requested phase and prompt boundaries?
- [ ] Did I preserve module/package dependency direction?
- [ ] Did I avoid secrets and tenant-unsafe patterns?
- [ ] Did I update or cite the right docs/ADRs?
- [ ] Did I introduce only justified complexity?
- [ ] Are trade-offs stated for any architectural recommendation?

If any box fails, revise before presenting the work as complete.
