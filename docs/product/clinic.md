# Clinic Management System (Product Notes)

## Intent

Compose NBCP modules for clinic scheduling, patient party records, and compliant operational workflows.

## Planned kernel dependencies

- identity, tenancy, rbac, audit
- crm/parties, scheduling, files (when available)

## Product-specific contexts (future)

- Encounters / clinical notes (regulated handling)
- Practitioner schedules
- Insurance / billing variants as applicable

## Notes

Health data may impose stricter compliance requirements. Prefer pluggable audit, encryption, and retention designs in the kernel rather than rushing vertical specifics into shared modules.

## Status

Placeholder — no product application code in Phase 0.1. Folder: `products/clinic/`.
