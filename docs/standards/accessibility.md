# Accessibility Standards

## Target

Product-facing UIs aim for **WCAG 2.2 Level AA** as a baseline quality bar.

## Rules

1. Semantic HTML first; ARIA only when necessary.
2. Keyboard operability for all interactive flows.
3. Visible focus states; do not suppress outlines without replacement.
4. Sufficient color contrast via design tokens.
5. Form fields have associated labels and accessible error messages.
6. Images that convey meaning have appropriate alternative text.
7. Do not rely on color alone to communicate state.

## Verification

- Manual keyboard checks for critical flows
- Automated a11y checks in CI when frontend apps exist (e.g., axe-based tooling)

## Status

Policy for future UI work. No frontend pages exist in Phase 0.1.
