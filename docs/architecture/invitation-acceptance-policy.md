# Invitation Acceptance Policy

**Status:** Normative  
**Remediates:** Kernel review [K-05](../reviews/kernel-review.md)  
**Last updated:** 2026-07-14  

This document defines how organization invitations are accepted **safely**, binding a Tenancy invitation to an Identity principal without Identity depending on Tenancy, and without Tenancy depending on RBAC.

Related: [tenancy design](../modules/tenancy/design.md), [identity design](../modules/identity/design.md), [tenant-access-model.md](tenant-access-model.md), [event-contracts.md](event-contracts.md).

---

## 1. Problem (K-05)

Tenancy invitations are addressed by **email**, while durable membership must reference only **`PrincipalId`**. Without a strict acceptance policy, an authenticated principal could accept an invitation meant for a different email, or an attacker could exploit ambiguous matching.

---

## 2. Principles

1. Identity remains the source of truth for email on a user account.
2. Tenancy stores invitee email only on the **Invitation** aggregate (not as a membership FK).
3. Acceptance always requires an **authenticated** `PrincipalId` (session required).
4. Tenancy calls Identity **facade only** (`getUserById` / email accessors as exposed) — never the reverse dependency.
5. No new module edges: still `tenancy → identity` only among these two.

---

## 3. Invitation states (reminder)

`pending` → `accepted` | `declined` | `revoked` | `expired`

Only `pending` + unexpired invitations can be accepted.

---

## 4. Acceptance policy (normative)

### 4.1 Preconditions

Caller presents:

- Valid Identity session → `principalId`
- Invitation token (clear token; Tenancy looks up by hash)

### 4.2 Algorithm

```text
1. Load invitation by token hash.
   - If missing / not pending / expired → fail (generic where appropriate).

2. Resolve principal via Identity facade: user = identity.getUserById(principalId)
   - If missing / not authenticatable → fail.

3. Email bind check (REQUIRED for email-targeted invitations):
   Let inviteEmail = normalize(invitation.email)
   Let userEmail    = normalize(user.email)
   If inviteEmail ≠ userEmail → DENY
      reason: invitation_email_mismatch
      (Do not accept; do not create membership)

4. Organization must be active (or pending with explicit policy — default: active only).

5. Create Membership { organizationId, principalId, state: active }
   - If an active/suspended membership already exists → fail conflict or no-op per API rules.
   - Terminal prior membership (left/removed) → allow new membership cycle.

6. Mark invitation accepted (acceptedByPrincipalId = principalId, consumed).

7. Emit tenancy.invitation.accepted + tenancy.membership.activated
   via transactional outbox (ADR-0003).

8. Optional post-accept composition (APP / RBAC consumer — not Tenancy→RBAC):
   If invitation.suggestedRoleKey present:
     rbac.assignRole({ principalId, organizationId, roleKey, locationId: invitation.locationId? })
   Validate roleKey exists; if invalid → log/metric + skip assign (membership still valid)
```

### 4.3 Normalization

Email comparison uses the **same normalization rules as Identity** (case folding / Unicode policy documented in Identity implementation). Tenancy must not invent a second normalization standard — call a shared pure helper in a **technical package** (e.g. future `@nbcp/email-normalize`) with **no module deps**, or duplicate the documented algorithm identically.

### 4.4 Enumeration & errors

- Unauthenticated accept attempts → `401`.
- Email mismatch → `403` with stable machine code `invitation_email_mismatch` (no token leakage).
- Invalid token → `404` or generic `400` (avoid confirming token format specifics publicly).

---

## 5. Allowed invitation targeting modes

| Mode | Invite stores | Accept rule |
| --- | --- | --- |
| **Email invite** (default v1) | `email` | §4 email bind check **required** |
| **Principal invite** (optional later) | `principalId` instead of email | Accept only if session `principalId` equals invite principal; **no email check** |

v1 mandates **email invite** behavior above. Principal-targeted invites require a small Tenancy design addendum when implemented — still no Identity→Tenancy dependency.

---

## 6. Explicit bans

| Ban | Reason |
| --- | --- |
| Accept without session | Account-binding impossible / takeover risk |
| Accept when session email ≠ invite email | K-05 |
| Auto-create Identity user inside Tenancy | Wrong module; breaks Identity ownership |
| Trust client-supplied email at accept instead of Identity facade | Spoofing |
| Tenancy writing Identity email changes to “make match” | Forbidden cross-module write |
| Skipping mismatch check for “convenience” in staging with prod-like data | Defect |

---

## 7. Security notes

1. Invitation tokens: single-use, TTL, hashed at rest (Tenancy design).
2. Rate-limit accept and create-invite endpoints.
3. On password reset / email change in Identity: existing pending invites still keyed to **old invite email**; they will mismatch until re-invited — acceptable; document in UX.
4. If Identity supports multiple emails later, acceptance policy must be amended by ADR (match any verified email).

---

## 8. Audit

`tenancy.invitation.accepted` and failed accepts with `invitation_email_mismatch` (optional but recommended for security monitoring) project to Audit via outbox consumers ([event-contracts.md](event-contracts.md)). Do not put tokens in audit metadata.

---

## 9. Testing expectations (when implemented)

| Case | Expected |
| --- | --- |
| Session email matches invite | Membership active; invitation accepted |
| Session email differs | Deny; no membership |
| Unauthenticated | Deny |
| Token reused | Deny |
| suggestedRoleKey valid | App/RBAC assigns role after accept |
| suggestedRoleKey invalid | Membership ok; role assign skipped + metric |

Boundary: Tenancy package does not import RBAC or Audit.

---

## 10. Related documents

- [tenant-access-model.md](tenant-access-model.md)
- [ADR-0003](../adr/0003-event-contracts-and-outbox.md)
- [Kernel review](../reviews/kernel-review.md)
