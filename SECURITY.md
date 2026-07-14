# Security Policy

NBCP is a long-lived multi-tenant business platform. Security is a product requirement, not an optional layer.

---

## Supported Versions

| Version | Supported |
| --- | --- |
| `main` (pre-release foundation) | Yes — report issues against current `main` |
| Tagged releases | Will be listed here as versions ship |

---

## Reporting a Vulnerability

**Do not** file public GitHub issues or pull requests for security vulnerabilities.

Please report vulnerabilities privately to the Noventra security contact:

- **Email:** security@noventra.local *(replace with the official Noventra security mailbox)*
- **Subject:** `[NBCP Security] <short title>`

Include, where possible:

1. Description of the issue and potential impact
2. Steps to reproduce or proof of concept
3. Affected components, commits, or configuration
4. Any suggested remediation
5. Whether you are available for follow-up questions

You should receive an acknowledgement within **three business days**. We will keep you informed of triage status and remediation timelines as appropriate.

---

## Safe Harbor

Noventra intends to treat good-faith research that follows this process as authorized. Do not:

- Access or modify data that is not yours
- Disrupt production availability
- Extort or publicly disclose before coordinated resolution

---

## Security Expectations for Contributors

- Never commit secrets, keys, tokens, or production credentials
- Prefer env var / secret-manager patterns (see `.env.example` when introduced)
- Preserve multi-tenant isolation in any data-access path
- Prefer deny-by-default authorization designs
- Flag security-sensitive changes in pull requests

Detailed engineering requirements live in [docs/standards/security.md](docs/standards/security.md).

---

## Disclosure

After a fix is available (or risk is accepted), Noventra may publish a summary via the [CHANGELOG](CHANGELOG.md) and/or security advisories as appropriate. Credit will be given to reporters who wish to be named, unless they prefer anonymity.
