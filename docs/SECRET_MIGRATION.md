# Environment-aware Secret Manager operations

Life Site uses Google Secret Manager directly in deployed production and staging.
Secret storage is independent from Firestore storage: `GOOGLE_CLOUD_PROJECT`
selects the Firestore data project, while `SECRET_MANAGER_PROJECT_ID` selects the
project that owns secrets.

Infrastructure creation, secret population, IAM, Cloud Run configuration, and
deployment are separate approval-gated operations. The application reads
existing secret resources and appends versions to approved mutable resources; it
never creates a secret or grants IAM.

## Deployed configuration

Production:

```env
SECRET_PROVIDER=secretmanager
SECRET_MANAGER_PROJECT_ID=gen-lang-client-0802447346
SECRET_NAME_PREFIX=life-site-prod
GOOGLE_CLOUD_PROJECT=gen-lang-client-0802447346
FIRESTORE_DATABASE_ID=life-site-production
```

Staging:

```env
SECRET_PROVIDER=secretmanager
SECRET_MANAGER_PROJECT_ID=gen-lang-client-0802447346
SECRET_NAME_PREFIX=life-site-staging
GOOGLE_CLOUD_PROJECT=gen-lang-client-0802447346
FIRESTORE_DATABASE_ID=life-site-staging
```

Missing, unknown, or unsafe deployed secret configuration fails closed. A
deployed service must never use `SECRET_PROVIDER=existing` or revision-local
`data/secrets.json` as a fallback. Local development may deliberately use
`SECRET_PROVIDER=existing` without Google Cloud.

## Explicit logical-key mapping

The provider accepts only these logical keys:

| Logical key | Secret ID |
|---|---|
| `LIFE_SITE_USERNAME` | `<prefix>-username` |
| `LIFE_SITE_PASSWORD_HASH` | `<prefix>-password-hash` |
| `SESSION_SECRET` | `<prefix>-session-secret` |
| `TODOIST_API_TOKEN` | `<prefix>-todoist-token` |
| `GOOGLE_CLIENT_ID` | `<prefix>-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | `<prefix>-google-client-secret` |
| `GOOGLE_REFRESH_TOKEN` | `<prefix>-google-refresh-token` |
| `GOOGLE_WRITE_AUTHORIZED` | `<prefix>-google-write-authorized` |

Prefixes may contain only lowercase letters, numbers, and hyphens. Unknown
logical keys are rejected rather than transformed into a secret name.

## Runtime permissions

Each Cloud Run service uses its dedicated runtime identity. Grant read access
only to that environment's eight exact secrets. Grant version-adding permission
only where the application must update a mutable value, including Todoist and
Google connection settings, the durable Google refresh token, and the Google
write-authorization state.

Do not grant project-wide Secret Accessor, Owner, Editor, Datastore Owner,
Service Account Token Creator, or service-account keys. Verify the exact
secret-resource IAM bindings through a separate approved infrastructure process.

## OAuth durability

After successful Google authorization, a returned refresh token is appended as
a new version of the environment's `GOOGLE_REFRESH_TOKEN` secret. The write-state
marker is appended to the environment's `GOOGLE_WRITE_AUTHORIZED` secret. If
Google omits a new refresh token, the existing durable token is preserved. If no
old or new refresh token exists, or either required write fails, authorization
is not reported as saved.

Access tokens and expiry remain in process memory. They are regenerated from the
durable refresh token and do not create Secret Manager versions.

## Safe verification and recovery

Readiness exposes only provider, configuration booleans, required-secret
availability booleans, OAuth-writability configuration, and safe reason codes.
It does not expose secret IDs, payloads, lengths, usernames, hashes, or tokens.
Required login/session secrets must load before a deployed revision is ready;
optional Todoist and Google integrations may remain disconnected.

If Secret Manager is unavailable, keep the candidate revision out of traffic or
use the release workflow's captured known-good rollback target. Do not move
deployed secrets to the Cloud Run filesystem, environment literals, or
`data/secrets.json` as an emergency fallback.
