# Identity Module — Design

| Field | Value |
| --- | --- |
| **Module** | `identity` (`modules/identity` — future implementation) |
| **Layer** | Core Platform ([ADR-0002](../../adr/0002-domain-map.md)) |
| **Stack** | NestJS + Prisma ([ADR-0001](../../adr/0001-platform-technology-foundation.md)) |
| **Structure** | [Module standard](../../architecture/module-standard.md) |
| **Status** | Design only — no implementation in this document |
| **Last updated** | 2026-07-14 |

**Normative companion:** [Event contracts & outbox](../../architecture/event-contracts.md) ([ADR-0003](../../adr/0003-event-contracts-and-outbox.md)) — Identity security events must use transactional outbox; Identity still imports no other modules

---

## 1. Purpose

The **Identity** module owns authentication of **principals** (human users first; service principals later), their credentials, sessions, and account lifecycle controls.

It answers: *Who is this actor, how do they prove it, and are they allowed to authenticate right now?*

It does **not** answer: *Which organization do they belong to?* (`tenancy`) or *What may they do inside a tenant?* (`rbac`).

### In scope

- Local authentication (email/username + password)
- SSO-ready model (external identity links + federation ports — providers later)
- User lifecycle (register, verify, activate, suspend, deactivate, soft-delete)
- Sessions (issue, refresh strategy hooks, revoke, revoke-all)
- Password reset (token challenge + consume)
- Account lockout (failed-attempt tracking and temporary lock)

### Explicit non-goals

- Organization / membership / location (→ `tenancy`)
- Roles and permission evaluation (→ `rbac`)
- Party / customer CRM profiles (→ `parties`)
- Full MFA product UI (hooks/ports allowed; complete MFA flows may be a follow-on ADR)
- Choosing a concrete IdP product (Auth0, Keycloak, etc. — future ADR); this design stays provider-agnostic
- Platform SaaS billing entitlements (→ `billing`)

---

## 2. Ubiquitous language

| Term | Meaning in Identity |
| --- | --- |
| **User** | Human principal aggregate; globally unique identity subject |
| **PrincipalId** | Opaque id of a user (or future service principal) referenced by other modules |
| **Credential** | Proof material or link used to authenticate (local password or external IdP subject) |
| **Session** | Server-side authenticated session bound to a principal |
| **Local authentication** | Password verification against a stored password hash |
| **External identity** | Link from a User to an SSO/IdP subject (`issuer` + `subject`) |
| **Lockout** | Temporary ban on authentication after repeated failures |
| **Password reset challenge** | Single-use, time-bounded token authorizing a password change while unauthenticated |

Other modules must reference users only by **PrincipalId** (or `UserId`) via the public facade — never by email as a foreign key.

---

## 3. Bounded context & aggregates

Recommended aggregate roots:

| Aggregate | Responsibility |
| --- | --- |
| **User** | Lifecycle, credentials (local + external links), lockout state, email verification state |
| **Session** | Independent auth session lifecycle (create, touch/rotate, revoke) |
| **PasswordResetChallenge** | Short-lived reset token lifecycle (request, consume, expire) |

`LoginFailureTracker` state lives **on User** (or a tightly owned child entity) to keep lockout invariants colocated with credentials.

```text
User (AR)
├── LocalPasswordCredential (entity)     — optional until password set / SSO-only users
├── ExternalIdentityLink[] (entities)    — SSO-ready
└── lockout / verification fields

Session (AR)
└── bound to principalId

PasswordResetChallenge (AR)
└── bound to principalId + token hash
```

---

## 4. Aggregates (detail)

### 4.1 User

**Invariants (normative intent):**

1. Email (normalized) is unique among non-deleted users.
2. A user always has a `status` in a known set.
3. Local password, when present, stores only a **password hash** — never plaintext.
4. While `lockedUntil` is in the future, local (and by policy SSO) authentication must fail with a lockout signal.
5. Suspended / deactivated / deleted users cannot obtain new sessions.
6. At most one active `LocalPasswordCredential` per user.
7. `(issuer, subject)` on external links is unique platform-wide.

**Lifecycle statuses:**

| Status | Meaning |
| --- | --- |
| `pending_verification` | Registered; email not verified (policy may still allow limited login — product decision via config) |
| `active` | May authenticate (subject to lockout) |
| `suspended` | Admin/policy freeze; no new sessions |
| `deactivated` | User- or admin-initiated close; no new sessions |
| `deleted` | Soft-deleted; unique email may be released or retained hashed per privacy ADR |

### 4.2 Session

**Invariants:**

1. Session is bound to exactly one `principalId`.
2. Opaque session identifier returned to clients is **not** stored raw — store a hash (or use refresh-token rotation stores).
3. Expired or revoked sessions cannot be used to resolve a principal.
4. `revokeAllForPrincipal` invalidates every active session for that user (password change, lockout, compromise response).

### 4.3 PasswordResetChallenge

**Invariants:**

1. Token stored as hash only.
2. Single successful consume; further consumes fail.
3. Expires after configured TTL.
4. Requesting a reset for unknown emails must not leak existence at the HTTP layer (application returns generic success; domain may no-op).

---

## 5. Entities

| Entity | Parent | Role |
| --- | --- | --- |
| **LocalPasswordCredential** | User | `passwordHash`, `algorithm`, `rotatedAt`, optional `mustChangeOnNextLogin` |
| **ExternalIdentityLink** | User | `issuer`, `subject`, `emailAtIssuer?`, `linkedAt`, `lastLoginAt` — SSO readiness |
| **Session** | (AR) | `principalId`, `tokenHash`, `createdAt`, `expiresAt`, `revokedAt?`, `ipHash?`, `userAgentClass?` |
| **PasswordResetChallenge** | (AR) | `principalId`, `tokenHash`, `expiresAt`, `consumedAt?`, `requestedIpHash?` |

Optional (implementation choice — keep out of User if volume is high):

| Entity | Role |
| --- | --- |
| **AuthAuditHint** | Local correlation ids for auth attempts; prefer emitting to `audit` module via events rather than duplicating a full audit store here |

---

## 6. Value objects

| Value object | Description |
| --- | --- |
| **UserId / PrincipalId** | Opaque branded id |
| **EmailAddress** | Normalized (case/folding rules documented); validated format |
| **PasswordHash** | Algorithm id + hash bytes/string; constructed only via hashing port |
| **PlainPassword** | Transient VO in application/domain command path — never persisted, never logged |
| **UserStatus** | Enum-like VO for lifecycle |
| **LockoutState** | `{ failedAttemptCount, lockedUntil?, lastFailedAt? }` |
| **SessionId** | Opaque id |
| **SessionToken** | Transient clear token at issuance; only hash stored |
| **ResetToken** | Transient clear token at issuance; only hash stored |
| **ExternalIssuer** | IdP issuer identifier (URL or stable key) |
| **ExternalSubject** | Subject identifier at issuer |
| **AuthFailureReason** | Domain-safe reasons (`invalid_credentials`, `locked`, `suspended`, …) — mapped carefully at API |

Password **policy** (length, complexity) is enforced in application/domain via a `PasswordPolicy` port or pure policy object — configurable, not hard-coded restaurant rules.

---

## 7. Domain events

Events are part of Identity’s public language. Consumers must be idempotent. Prefer outbox when reliability is required.

| Event | When | Typical consumers |
| --- | --- | --- |
| `identity.user.registered` | User created | notifications (verify email), audit, tenancy (optional invite flows) |
| `identity.user.email_verified` | Email verified | audit |
| `identity.user.activated` | Status → active | audit |
| `identity.user.suspended` | Status → suspended | session revoke workers, audit, tenancy |
| `identity.user.deactivated` | Status → deactivated | session revoke, audit |
| `identity.user.deleted` | Soft-deleted | session revoke, tenancy membership cleanup (via tenancy handlers) |
| `identity.user.password_changed` | Password updated | revoke sessions, audit, notifications |
| `identity.user.locked_out` | Lockout engaged | audit, notifications (optional) |
| `identity.user.unlock` | Lockout cleared (time or admin) | audit |
| `identity.external_identity.linked` | SSO link added | audit |
| `identity.external_identity.unlinked` | SSO link removed | audit |
| `identity.session.issued` | Session created | audit (optional, high volume — sample/policy) |
| `identity.session.revoked` | Session revoked | audit |
| `identity.password_reset.requested` | Challenge created | notifications (send email via port) |
| `identity.password_reset.completed` | Challenge consumed + password set | session revoke, audit |

Payloads carry `principalId`, timestamps, and minimal PII. Prefer ids over email in event payloads when possible; if email is required for notifications, treat as sensitive.

---

## 8. Public APIs (module facade)

Other modules and the API host **must** use this facade (or HTTP API backed by the same use cases). No deep imports into Identity infrastructure.

### 8.1 Commands (write)

| API | Behavior |
| --- | --- |
| `registerLocalUser({ email, password, displayName? })` | Create user + local credential; emit `registered`; may start in `pending_verification` |
| `verifyEmail({ principalId, token })` | Confirm email verification challenge (token design may mirror reset or separate VO) |
| `authenticateLocal({ email, password, sessionContext })` | Verify password; apply lockout; on success reset failures + issue session; on failure increment/lock |
| `beginSsoLogin({ issuer, authorizationParams })` | **Port/stub** — returns redirect/challenge data; full OIDC later |
| `completeSsoLogin({ issuer, assertions, sessionContext })` | Resolve/link `ExternalIdentityLink`; issue session — SSO-ready path |
| `linkExternalIdentity({ principalId, issuer, subject, … })` | Attach SSO subject to existing user (authenticated) |
| `unlinkExternalIdentity({ principalId, issuer, subject })` | Remove link if policy allows |
| `requestPasswordReset({ email })` | Create challenge; publish event / send mail via port; always generic result at transport |
| `resetPassword({ token, newPassword })` | Consume challenge; set password; emit `password_changed`; revoke sessions |
| `changePassword({ principalId, currentPassword, newPassword })` | Authenticated change; revoke other sessions |
| `lockUser({ principalId, until?, reason })` | Admin/system lock |
| `unlockUser({ principalId })` | Clear lockout |
| `suspendUser({ principalId, reason })` | Lifecycle suspend + revoke sessions |
| `activateUser({ principalId })` | Activate when allowed |
| `deactivateUser({ principalId })` | Deactivate + revoke sessions |
| `deleteUser({ principalId })` | Soft-delete + revoke sessions |
| `revokeSession({ sessionId })` | Revoke one |
| `revokeAllSessions({ principalId })` | Revoke all for principal |

### 8.2 Queries (read)

| API | Behavior |
| --- | --- |
| `getUserById(principalId)` | Public profile fields needed by peers (no password hash) |
| `findUserByEmail(email)` | Internal/admin; careful with anti-enumeration at HTTP edge |
| `resolveSession(token)` | Returns principal + session metadata or invalid |
| `listExternalIdentities(principalId)` | Linked issuers (no secrets) |
| `isAuthenticationAllowed(principalId)` | Status + lockout check |

### 8.3 HTTP surface (app-mounted, illustrative)

Transport lives under `src/api` when implemented. Suggested resource groups:

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `POST /v1/auth/password/forgot`
- `POST /v1/auth/password/reset`
- `POST /v1/auth/sso/{issuer}/start` (future)
- `POST /v1/auth/sso/{issuer}/callback` (future)
- `GET /v1/users/me`
- Admin user lifecycle routes (guarded later by `rbac`)

Exact OpenAPI is deferred to implementation; contracts must follow [api-strategy](../../architecture/api-strategy.md).

---

## 9. Dependencies

### 9.1 Module dependencies (domain map)

| Direction | Module | Notes |
| --- | --- | --- |
| Depends on | **None** (kernel) | Per ADR-0002 / domain map |
| Used by | `tenancy`, `rbac`, `audit`, all higher domains | Via `PrincipalId` + facade queries |

Identity must **not** import `tenancy` or `rbac`. Membership binding is tenancy’s job after a user exists.

### 9.2 Technical packages & ports

| Port / package | Purpose |
| --- | --- |
| `PasswordHasher` | Hash/verify (e.g. Argon2id) |
| `TokenGenerator` | Secure random session/reset tokens |
| `Clock` | Time for expiry/lockout (testable) |
| `IdGenerator` | User/session ids |
| `EventPublisher` / outbox | Domain events |
| `EmailSender` (port) | Verification & reset emails without hard dependency on `notifications` module at kernel bootstrap; later adapter may call notifications |
| `SsoProvider` (port) | Future OIDC/SAML adapters behind interface |
| Logger / telemetry | Cross-cutting |

### 9.3 Collaboration pattern with tenancy & rbac

```text
registerLocalUser → UserCreated
       ↓ (product/app flow)
tenancy.createMembership(principalId, organizationId)
       ↓
rbac.assignRole(...)
```

Identity never writes membership or role tables.

---

## 10. Authentication flows (design intent)

### 10.1 Local login

1. Normalize email; load user.
2. If missing → same timing-safe failure as bad password (anti-enumeration).
3. If status not authenticatable → fail with appropriate reason (careful at HTTP).
4. If lockout active → fail `locked`.
5. Verify password hash.
6. On failure → increment failures; maybe set `lockedUntil`; emit `locked_out` if threshold crossed.
7. On success → clear failures; issue Session; emit `session.issued` (policy).

### 10.2 Password reset

1. `requestPasswordReset` creates `PasswordResetChallenge` when user exists.
2. Send link/token via `EmailSender`.
3. `resetPassword` validates token, sets new `LocalPasswordCredential`, consumes challenge, `revokeAllSessions`, emit events.

### 10.3 Account lockout

Configurable policy (defaults to be set at implementation):

- Threshold (e.g. N failures)
- Window (optional sliding)
- Lock duration
- Admin unlock and/or automatic expiry of `lockedUntil`

Lockout applies to local auth; SSO policy may honor the same `LockoutState` so a locked account cannot bypass via IdP (recommended default).

### 10.4 SSO-ready (future)

- Persist `ExternalIdentityLink` without requiring full OIDC yet.
- `SsoProvider` port: `buildAuthorizationRequest`, `exchangeCallback`.
- First login: create user or match by verified email per policy ADR.
- Link/unlink requires authenticated user and audit events.

---

## 11. Database ownership

Identity owns all `identity_*` tables. No other module may write them ([module-standard](../../architecture/module-standard.md)).

### 11.1 Proposed tables

| Table | Contents |
| --- | --- |
| `identity_users` | id, email_normalized, email_display, status, display_name, failed_attempt_count, locked_until, email_verified_at, created_at, updated_at, deleted_at |
| `identity_password_credentials` | user_id (PK/FK), password_hash, algorithm, rotated_at, must_change_on_next_login |
| `identity_external_identities` | id, user_id, issuer, subject, email_at_issuer, linked_at, last_login_at; UNIQUE(issuer, subject) |
| `identity_sessions` | id, user_id, token_hash, created_at, expires_at, revoked_at, ip_hash, user_agent_class |
| `identity_password_reset_challenges` | id, user_id, token_hash, expires_at, consumed_at, created_at |
| `identity_email_verification_challenges` | (optional separate) id, user_id, token_hash, expires_at, consumed_at |

### 11.2 Multi-tenancy note

Users are **global principals**, not org-scoped rows. Tenant isolation for business data is enforced in other modules via `organization_id`. Optional future: platform operators vs tenant-scoped directory — out of scope unless ADR amends this.

### 11.3 Secrets & columns

- Never store plaintext passwords or raw session/reset tokens.
- Prefer hashing tokens at rest (SHA-256 of random is minimum; document choice in implementation ADR).
- Indexes: unique `email_normalized` (filtered where `deleted_at IS NULL`), unique `(issuer, subject)`, session `token_hash`, reset `token_hash`.

---

## 12. Security & compliance controls

1. Constant-time password verify; generic login errors at public HTTP where appropriate.
2. Rate-limit login and reset endpoints (edge / application middleware — not optional in production).
3. Emit security-relevant events for `audit` consumption.
4. Session fixation: new session id on login; revoke on password change.
5. TLS and secure cookie/header transport for session tokens (app concern).
6. PII minimization in logs (no passwords, no full tokens, careful with emails).

---

## 13. Testing requirements (when implemented)

| Layer | Focus |
| --- | --- |
| Unit | User lockout transitions; password change invariants; challenge consume-once |
| Integration | Unique email; session resolve; reset flow with hasher/clock fakes |
| Security | Enumeration-resistant register/login/reset behaviors at API |
| Isolation N/A for user table tenancy | Document global user model; ensure no org_id false assumptions |

---

## 14. Implementation roadmap (non-binding)

1. User + local credential + session + lockout + password reset
2. Email verification challenges
3. External identity link schema + stub SSO ports
4. Concrete OIDC provider ADR + adapter
5. MFA design ADR

---

## 15. Related documents

- [Domain map — identity](../../architecture/domain-map.md)
- [ADR-0001](../../adr/0001-platform-technology-foundation.md) / [ADR-0002](../../adr/0002-domain-map.md)
- [Module standard](../../architecture/module-standard.md)
- [Tenancy model](../../architecture/tenancy-model.md)
- [Authz model](../../architecture/authz-model.md)
- [Eventing](../../architecture/eventing.md)
- [Security standards](../../standards/security.md)
