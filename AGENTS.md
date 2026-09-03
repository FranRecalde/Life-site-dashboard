# Life Site Dashboard Guardrails

## Risk lanes

### Green

Read-only investigation, documentation, tests, local development-only work, and isolated UI or validation changes that do not affect production credentials, authentication, Firestore rules, infrastructure, or persisted production data.

### Amber

Proceed without asking, but log what you did.

- Adding a new scoped credential for this personal, single-user project.
- Removing complexity while preserving the same guarantees.
- Normal feature implementation.
- Adding Firestore collections in a safe development environment.

### Red

Stop and request explicit approval before:

- Changing production authentication.
- Changing production Firebase security rules.
- Changing production secrets.
- Performing destructive migrations or deletions.
- Changing production infrastructure.
- Replacing a major working integration.
- Taking an irreversible production action.

Apply the higher-risk lane only to the specific files that touch it, not to the whole task. One approval covers the entire approved plan; do not re-ask for each step.

## Tests

Use `npm run test:reading` for the scoped reading-capture pipeline.

## Non-goals

- No production changes without explicit approval.
- No destructive Firestore actions without approval.
