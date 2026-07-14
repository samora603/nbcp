# NBCP Documentation

This directory is the source of truth for how NBCP is designed, decided, operated, and evolved.

Documentation is reviewed in pull requests like code. Prefer accurate living documents over encyclopedic staleness. Deep rationale belongs in [ADRs](adr/README.md).

---

## Map

| Path | Purpose |
| --- | --- |
| [vision.md](vision.md) | Platform vision and non-goals |
| [glossary.md](glossary.md) | Ubiquitous language |
| [architecture/](architecture/README.md) | Architecture guides |
| [reference/event-catalog.md](reference/event-catalog.md) | Canonical platform event inventory |
| [adr/](adr/README.md) | Architecture Decision Records |
| [standards/](standards/README.md) | Engineering standards |
| [runbooks/](runbooks/README.md) | Operational procedures |
| [product/](product/README.md) | Vertical product composition notes |
| [rfc/](rfc/README.md) | Design proposals prior to ADRs |

---

## Writing guidelines

1. Write for the next engineer joining in five years.
2. Link ADRs for irreversible decisions; keep overviews concise.
3. Update the glossary when introducing domain terms.
4. Mark draft or Phase-dependent content explicitly.
5. Never document secrets or production credentials.
