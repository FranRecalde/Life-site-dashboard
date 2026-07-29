---
name: life-site-safe-release
description: >-
  Safely verify, build once, deploy, verify, promote, and explicitly roll back
  the Life Site Dashboard through separate staging and production Google Cloud
  Run services. Use for staging releases, production releases, production
  verification, or rollback work involving FranRecalde/Life-site-dashboard,
  life-site-dashboard-staging, and life-site-dashboard.
---

# Life Site Safe Release

Release one verified Git commit as one immutable container image. Deploy that
exact image digest to the separate staging service, verify it, and only then
deploy the same digest to the production service through two production approval
gates. Fail closed whenever identity, provenance, configuration, readiness, or
traffic is missing, unsafe, or ambiguous.

## Fixed identities

- Repository: `FranRecalde/Life-site-dashboard`
- Authoritative branch: `main`
- Google Cloud project: `gen-lang-client-0802447346`
- Cloud Run region: `europe-west2`
- Staging service: `life-site-dashboard-staging`
- Production service: `life-site-dashboard`
- Staging runtime identity:
  `life-site-dashboard-staging@gen-lang-client-0802447346.iam.gserviceaccount.com`
- Production runtime identity:
  `life-site-dashboard-prod@gen-lang-client-0802447346.iam.gserviceaccount.com`
- Staging Firestore project: `gen-lang-client-0802447346`
- Required staging Firestore database ID: `life-site-staging`
- Production Firestore project: `life-dashboard-502020`
- Required production Firestore database ID: `life-site-production`
- Secret Manager project: `gen-lang-client-0802447346`
- Staging secret prefix: `life-site-staging`
- Production secret prefix: `life-site-prod`
- Staging Reading Capture hash secret:
  `life-site-staging-reading-capture-api-token-hash`
- Production Reading Capture hash secret:
  `life-site-prod-reading-capture-api-token-hash`
- Staging Reading Bridge hash secret:
  `life-site-staging-reading-bridge-api-token-hash`
- Production Reading Bridge hash secret:
  `life-site-prod-reading-bridge-api-token-hash`
- Google OAuth callback path: `/api/auth/google/callback`

Treat the two Cloud Run services as separate houses. Never use a traffic tag,
tagged URL, or zero-traffic revision on `life-site-dashboard` as staging. Never
deploy a source tree directly to production, and never rebuild for production.

## Infrastructure boundary

This skill releases application code only after the foundations already exist
and pass read-only preflight. It must not create or modify Cloud Run services,
Firestore databases, backup schedules, APIs, IAM bindings, service accounts,
secrets, environment variables, traffic tags, or Google OAuth configuration.
Database creation, protection, migration, backup, restore, IAM, secrets, and
OAuth registration require separate, explicitly approved infrastructure work.

Do not invoke this release workflow until both services exist and both configured
Firestore connections pass preflight. Stop and identify the missing foundation;
never repair it from this skill.

## Never expose sensitive data

- Never print or summarize secret values, passwords, password hashes, API tokens,
  OAuth client secrets, refresh tokens, session cookies, authorization headers,
  `.env` contents, private habit contents, or personal integration records.
- Inspect only approved environment keys and safe identifiers. Report configured
  booleans, service-account identifiers, environment-key names, Secret Manager
  reference names, revision names, image digests, commit hashes, and traffic.
- Never dump a complete service, revision, environment block, secret resource,
  HTTP response, log stream, or record payload.
- Sanitize health and readiness output to the fields required below.

## Release record

Keep these safe values in the task for one release only. Never reuse them from a
prior release or invent a missing value:

- `DEPLOYED_COMMIT`
- `SOURCE_ARCHIVE`
- `PLANNED_IMAGE_TAG`
- `IMMUTABLE_IMAGE`
- `STAGING_REVISION_NAME`
- `PRODUCTION_CANDIDATE_REVISION`
- `PREVIOUS_PRODUCTION_REVISION`
- `PREVIOUS_PRODUCTION_IMAGE`
- `STAGING_SERVICE_URL`
- `PRODUCTION_SERVICE_URL`
- `STAGING_FIRESTORE_ADDRESS`
- `PRODUCTION_FIRESTORE_ADDRESS`
- `PRODUCTION_SAFE_CONFIG_FINGERPRINT`

`IMMUTABLE_IMAGE` must be a registry reference ending in `@sha256:...`, never a
mutable tag. The commit-provenance label key is `life_site_commit` and its value
must be the full `DEPLOYED_COMMIT`.

## Phase 1 - Verify the source

1. Confirm the working directory is the intended repository. Read only the
   credential-free `origin` identity and require it to normalize exactly to
   `FranRecalde/Life-site-dashboard` on GitHub. Stop on embedded credentials,
   another host, owner, or repository.
2. Report the current branch and full local `HEAD`. Require the branch to be
   exactly `main` for a release.
3. Fetch `origin` without merging, rebasing, pulling, resetting, or switching.
4. Require `git status --porcelain=v1` to be empty, including staged, unstaged,
   and untracked application files. Ignore only generated paths already covered
   by committed ignore rules.
5. Resolve full local `HEAD` and `origin/main`. Require them to match. This proves
   the commit exists remotely. If the intended local commit is absent from the
   remote, stop and ask the user to push or merge it separately; never push it.
6. Set `DEPLOYED_COMMIT` to the verified full hash. Reconfirm the commit after
   every approval and immediately before every build or deployment.
7. Inspect upload filenames, committed ignore rules, and tracked filenames for
   secrets, credentials, private notes, runtime data, or unsafe build inputs.
   Use filename-only or redacted checks and stop on any credible finding.
8. Run the repository's configured secret scanner when present. Never print a
   match value.
9. Require committed `package.json` and `package-lock.json`. Parse only
   `package.json` script metadata and require nonblank `scripts.build` and
   `scripts.start` values. Do not print other package metadata unnecessarily.
10. Use Google Cloud Buildpacks for this repository. `Dockerfile` and
    `.dockerignore` are not required and must not be generated by this skill.
    Stop if the installed `gcloud builds submit --help` does not support
    `--pack=[builder=BUILDER],[env=ENV],[image=IMAGE]` with a required `image`
    value.

The verified Git commit is source provenance; it is not yet an image or a Cloud
Run revision.

## Phase 2 - Validate the verified commit

Run separately and stop at the first failure:

```text
npm ci
npm run lint
npm run build
npm test
```

Afterward, require the same `DEPLOYED_COMMIT`, exact equality with `origin/main`,
a clean tree, and a safe build context. Create `SOURCE_ARCHIVE` outside the
repository with `git archive` from exactly `DEPLOYED_COMMIT`. Require the archive
to contain committed files only, including `package.json` and
`package-lock.json`; exclude `.git`, `.env` files, runtime data, secret payloads,
and every untracked or ignored local file. Verify its member list without
extracting it into the repository. Do not build a cloud image yet.

## Phase 3 - Read-only service and data preflight

Inspect only narrowly selected safe fields. Never print complete service or
revision configuration.

1. Require both exact service names to exist in the fixed project and region:
   `life-site-dashboard-staging` and `life-site-dashboard`. Require two distinct
   service resources and two distinct permanent service URLs. Stop if either is
   missing or one is substituted for the other.
2. For each service, select only these literal environment values:
   `NODE_ENV`, `STORAGE_PROVIDER`, `GOOGLE_CLOUD_PROJECT`,
   `FIRESTORE_DATABASE_ID`, `SECRET_PROVIDER`, `SECRET_MANAGER_PROJECT_ID`, and
   `SECRET_NAME_PREFIX`. Report only those seven approved values. Require:
   - `NODE_ENV=production`
   - `STORAGE_PROVIDER=firestore`
   - nonblank `GOOGLE_CLOUD_PROJECT`
   - nonblank `FIRESTORE_DATABASE_ID`
   - `SECRET_PROVIDER=secretmanager`
   - `SECRET_MANAGER_PROJECT_ID=gen-lang-client-0802447346`
   - nonblank `SECRET_NAME_PREFIX`
3. Require staging `GOOGLE_CLOUD_PROJECT=gen-lang-client-0802447346`,
   `FIRESTORE_DATABASE_ID=life-site-staging`, and
   `SECRET_NAME_PREFIX=life-site-staging` exactly.
   Set `STAGING_FIRESTORE_ADDRESS` to its explicit project/database pair.
4. Require production `GOOGLE_CLOUD_PROJECT=life-dashboard-502020`,
   `FIRESTORE_DATABASE_ID=life-site-production`, and
   `SECRET_NAME_PREFIX=life-site-prod` exactly. Set
   `PRODUCTION_FIRESTORE_ADDRESS` to that explicit pair. Require the complete
   staging and production project/database pairs and secret prefixes to differ.
5. Require each service to use its exact fixed runtime identity. From the
   verified source's explicit logical-key mapping, derive the ten exact
   environment-prefixed secret identifiers. Inspect metadata only and never
   access a payload.
   - Before staging deployment, require every staging-prefixed secret resource
     and an enabled version to exist in the fixed Secret Manager project,
     including exact secret
     `life-site-staging-reading-capture-api-token-hash`. Require the staging
     runtime identity to have `roles/secretmanager.secretAccessor` on that exact
     secret resource. It must not have a write, administrative, version-adding,
     project-wide, production-family, or cross-environment grant for this
     Reading Capture hash secret.
   - Also require exact staging secret
     `life-site-staging-reading-bridge-api-token-hash`, an enabled version, and
     `roles/secretmanager.secretAccessor` for the staging runtime identity on
     that exact secret resource. Apply the same no-write, no-administration,
     no-version-adding, no-project-wide, no-production-family, and
     no-cross-environment restrictions.
   - Continue to require the existing approved secret-specific read and
     version-adding permissions for the other staging secrets according to their
     existing application write requirements, with no access to the production
     family.
   - Before staging acceptance, inspect the production family under the existing
     rules except for the exact production Reading Capture and Reading Bridge
     hash secrets `life-site-prod-reading-capture-api-token-hash` and
     `life-site-prod-reading-bridge-api-token-hash`. Do not require those
     secrets, enabled versions, or production accessor bindings yet. These are
     the only pre-staging production-secret exceptions; do not infer that any
     other production foundation may be absent.
   Stop on a literal secret environment value, Cloud Run secret binding that
   bypasses the native provider, missing resource/version required at the
   current gate, mixed prefix, unexpected identity, broader secret role,
   cross-environment access, or ambiguous result.
6. Retrieve each permanent service URL from Cloud Run; never construct or guess
   it. Set `STAGING_SERVICE_URL` and `PRODUCTION_SERVICE_URL`.
7. Request each service's `/api/health` and `/api/readiness` using safe GETs.
   Require health HTTP 200. Require readiness HTTP 200, `status=ready`,
   `firestoreReachable=true`, `persistentStorageReady=true`, configuration valid,
   project/database configured booleans true, `secretProvider=secretmanager`,
   `secretManagerProjectConfigured=true`, `secretNamePrefixConfigured=true`,
   `secretConfigurationValid=true`, `requiredLoginSecretsAvailable=true`,
   `writableOAuthSecretConfigurationReady=true`. Optional Todoist or Google
   connection availability may be false.
   - Before staging deployment, allow the currently deployed staging revision to
     omit both `readingCaptureApiTokenHashAvailable` and
     `readingCaptureApiCredentialReady` because it may predate Reading Capture.
     If either field is present, require both to be present and exactly `true`;
     stop on a partial, false, malformed, or ambiguous value.
     Independently allow the current revision to omit both
     `readingBridgeApiTokenHashAvailable` and
     `readingBridgeApiCredentialReady` because it may predate the bridge. If
     either bridge field is present, require both to be present and exactly
     `true`; stop on a partial, false, malformed, or ambiguous value.
   - Before staging acceptance, apply the same paired-field rule to the currently
     deployed production revision. Do not treat omitted credential-readiness
     fields as evidence that deferred production secrets or IAM bindings exist.
   Stop if any other required safe field is absent, false, or ambiguous. Do not
   print other response content.
8. Inspect the verified OAuth origin allowlist in application source. Require its
   exact production hostname to equal `PRODUCTION_SERVICE_URL` and its exact
   staging hostname to equal `STAGING_SERVICE_URL`. Require the corresponding
   callback URLs to use the fixed callback path. Stop if either origin is stale,
   tagged, ambiguous, or points to the wrong service. Require read-only evidence
   or explicit operator confirmation that both exact callbacks are registered in
   Google OAuth. Never open or modify OAuth settings automatically.
9. Identify the exact production revision receiving normal traffic. Require one
   revision at 100 percent; stop on split or ambiguous traffic. Set it as
   `PREVIOUS_PRODUCTION_REVISION` and record its immutable image digest as
   `PREVIOUS_PRODUCTION_IMAGE`.
10. Record a safe production baseline containing traffic, revision, the seven
    approved environment values, service-account identifier, required secret
    resource identifiers, and permanent URL. Hash or compare that safe set as
    `PRODUCTION_SAFE_CONFIG_FINGERPRINT` without including secret values.
11. Resolve an existing Artifact Registry image repository suitable for this
    service. Do not create one. Stop if its project, location, permissions, or
    identity are missing or ambiguous. Set `PLANNED_IMAGE_TAG` to an existing
    repository path tagged with the full `DEPLOYED_COMMIT`.

## Mandatory staging approval gate

Before requesting approval, display:

- full `DEPLOYED_COMMIT`;
- exact `SOURCE_ARCHIVE` path and its committed-source verification result;
- `PLANNED_IMAGE_TAG`, or `IMMUTABLE_IMAGE` if already proven;
- staging service `life-site-dashboard-staging`;
- staging database ID `life-site-staging`;
- the planned one-time build command;
- the planned staging deployment command below with placeholders resolved as far
  as possible;
- a statement that production service, configuration, and traffic will not be
  changed.

The planned commands must follow this shape:

```text
gcloud.cmd builds submit SOURCE_ARCHIVE `
  --project=gen-lang-client-0802447346 `
  --pack="image=PLANNED_IMAGE_TAG" `
  --async

gcloud run deploy life-site-dashboard-staging \
  --image IMMUTABLE_IMAGE \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --update-labels life_site_commit=DEPLOYED_COMMIT \
  --async
```

Do not run either command until the user says exactly:

```text
Deploy the verified commit to staging
```

Similar wording is insufficient. This phrase authorizes exactly one image build
from `DEPLOYED_COMMIT` and deployment of the resulting digest only to
`life-site-dashboard-staging`. It authorizes no production action.

## Phase 4 - Build once and deploy only to staging

Immediately after staging approval, repeat Phases 1-3 read-only invariants. Stop
if anything changed.

1. Reconfirm that `SOURCE_ARCHIVE` still contains only the exact committed tree
   for `DEPLOYED_COMMIT`, then submit exactly one Buildpacks build from that
   archive using `--pack="image=PLANNED_IMAGE_TAG"`. Record the build ID, builder
   identity where safely available, and start time. Never retry automatically
   after timeout, interruption, or failure; reconcile the submitted build with
   bounded read-only polling.
2. Require the build to finish successfully. Resolve `PLANNED_IMAGE_TAG` through
   Artifact Registry to one digest and set `IMMUTABLE_IMAGE` to the exact
   `...@sha256:...` reference. Stop if absent, mutable, multiple, or ambiguous.
3. Reconfirm the built source provenance corresponds to `DEPLOYED_COMMIT`. Treat
   build metadata as supporting evidence, not a substitute for source and digest
   checks.
4. Deploy `IMMUTABLE_IMAGE`, never the tag or source tree, to
   `life-site-dashboard-staging` with the exact full commit-provenance label.
   Do not pass environment, secret, IAM, traffic-tag, or production flags.
5. Reconcile asynchronously with bounded read-only polling. Identify exactly one
   new ready staging revision created after the recorded start. Set it as
   `STAGING_REVISION_NAME` only when its image digest equals `IMMUTABLE_IMAGE` and
   its `life_site_commit` label equals `DEPLOYED_COMMIT`.
6. Requery production and require its revision, traffic, safe configuration, and
   `PRODUCTION_SAFE_CONFIG_FINGERPRINT` to be unchanged.
7. Delete `SOURCE_ARCHIVE` only after the build ID, source provenance, immutable
   digest, and staging deployment result have been recorded. Never rebuild the
   image for production; reuse the same `IMMUTABLE_IMAGE` digest.

## Phase 5 - Verify staging and stop

Require automated evidence:

- exact `STAGING_REVISION_NAME`;
- exact `IMMUTABLE_IMAGE` digest;
- exact full commit-provenance label;
- staging `/api/health` HTTP 200;
- staging `/api/readiness` HTTP 200 and `status=ready`;
- safe readiness fields proving Firestore reachable and persistent storage ready;
- staging project and database configured booleans true;
- safe secret readiness fields proving the explicit Secret Manager project,
  staging prefix, required login secrets, and writable OAuth configuration
  ready;
- `readingCaptureApiTokenHashAvailable` and
  `readingCaptureApiCredentialReady` are both present and exactly `true`; an
  omitted, false, malformed, partial, or ambiguous value is a staging failure;
- `readingBridgeApiTokenHashAvailable` and
  `readingBridgeApiCredentialReady` are both present and exactly `true`; an
  omitted, false, malformed, partial, or ambiguous value is a staging failure;
- production revision, configuration, and traffic unchanged.

Give the user the permanent staging-service URL and require this browser checklist
against staging data only:

- login and logout;
- dashboard and mobile layout where relevant;
- create, read, update, and archive a staging-only habit;
- Google Calendar OAuth callback on the permanent staging-service hostname and
  calendar read/write behavior appropriate to the release;
- Todoist connectivity and task/project smoke checks where configured;
- Obsidian connectivity and note smoke checks where configured;
- global search and other release-specific critical paths.

Never print credentials, private records, habit contents, calendar contents,
Todoist contents, or Obsidian contents. Stop after staging verification and wait
for the user's test report. Do not infer browser success from automated checks.

## Production credential preflight

Run this read-only gate only after all automated staging evidence and the user's
staging test report pass, and before displaying or accepting the first production
approval phrase.

1. Reconfirm the exact production runtime identity. Derive the exact production
   Reading Capture and Reading Bridge hash secrets from the verified source
   mapping and require them to be
   `life-site-prod-reading-capture-api-token-hash` and
   `life-site-prod-reading-bridge-api-token-hash` in Secret Manager project
   `gen-lang-client-0802447346`.
2. Inspect metadata only. Require both exact secret resources and enabled
   versions to exist. Never access or display their payloads.
3. Require
   `life-site-dashboard-prod@gen-lang-client-0802447346.iam.gserviceaccount.com`
   to have `roles/secretmanager.secretAccessor` on both exact secret resources.
   Stop on a write, administrative, version-adding, project-wide,
   staging-family, cross-environment, broader, inherited, or ambiguous grant for
   either Reading Capture or Reading Bridge hash secret.
4. Reconfirm there is no literal Reading Capture or Reading Bridge token or hash
   environment value and no Cloud Run secret binding that bypasses the native
   provider.
5. Request the current production revision's `/api/health` and
   `/api/readiness`. Require all existing production health and readiness fields
   from Phase 3. The current revision may omit both
   `readingCaptureApiTokenHashAvailable` and
   `readingCaptureApiCredentialReady` because it may predate Reading Capture. If
   either field is present, require both to be present and exactly `true`; stop
   on a partial, false, malformed, or ambiguous value. Omission is permitted only
   until production traffic is promoted to the verified candidate.
   Independently allow the current revision to omit both
   `readingBridgeApiTokenHashAvailable` and
   `readingBridgeApiCredentialReady` because it may predate the bridge. If
   either bridge field is present, require both to be present and exactly
   `true`; stop on a partial, false, malformed, or ambiguous value. Omission is
   permitted only until production traffic is promoted to the verified
   candidate.

Repeat this production credential preflight after the first production approval
and immediately before deploying the no-traffic production candidate. Stop if
any result changed or became ambiguous. This gate authorizes no secret, IAM,
environment, service, revision, or traffic mutation.

## First production approval gate

Continue only after staging evidence and the user's report both pass. Display:

- `DEPLOYED_COMMIT`;
- exact staging-proven `IMMUTABLE_IMAGE`;
- `STAGING_REVISION_NAME`;
- current `PREVIOUS_PRODUCTION_REVISION` and `PREVIOUS_PRODUCTION_IMAGE`;
- explicit production Firestore database ID;
- the planned no-traffic production deployment command;
- a statement that the exact staging-tested digest will be used without rebuild.

Then stop until the user says exactly:

```text
Promote the verified staging image to production
```

Similar wording is insufficient. Reconfirm all source, staging, production, and
digest evidence after approval. Never rebuild. This phrase authorizes creation
of one no-traffic production candidate revision using this command shape:

```text
gcloud run deploy life-site-dashboard \
  --image IMMUTABLE_IMAGE \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --no-traffic \
  --update-labels life_site_commit=DEPLOYED_COMMIT \
  --async
```

Do not include environment, secret, IAM, or traffic-tag changes. Reconcile with
bounded read-only polling and set `PRODUCTION_CANDIDATE_REVISION` only when one
new ready revision has the exact digest and commit label. Require existing
production traffic and `PRODUCTION_SAFE_CONFIG_FINGERPRINT` to remain unchanged.

## Final production traffic gate

Display the exact candidate revision, digest, commit, current production revision,
rollback revision, and planned traffic command. Then stop until the user says
exactly:

```text
Confirm production traffic change
```

Only after both production phrases have been received and every invariant still
passes, move 100 percent of normal production traffic to the exact candidate:

```text
gcloud run services update-traffic life-site-dashboard \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --to-revisions PRODUCTION_CANDIDATE_REVISION=100
```

Never target `LATEST`, a tag, an image tag, a guessed revision, or the staging
service.

## Phase 6 - Verify production

Require and report only safe evidence:

- production revision equals `PRODUCTION_CANDIDATE_REVISION`;
- production image digest equals staging-proven `IMMUTABLE_IMAGE`;
- commit-provenance label equals full `DEPLOYED_COMMIT`;
- normal production traffic is exactly 100 percent on that revision;
- `/api/health` is HTTP 200;
- `/api/readiness` is HTTP 200 with `status=ready`;
- persistent storage ready and Firestore reachable are true;
- project and database configured booleans are true;
- Secret Manager project/prefix configuration, required login secrets, Reading
  Capture and Reading Bridge API credential hashes, and writable OAuth
  configuration are ready;
- `readingCaptureApiTokenHashAvailable` and
  `readingCaptureApiCredentialReady` are both present and exactly `true`; an
  omitted, false, malformed, partial, or ambiguous value is a production
  failure;
- `readingBridgeApiTokenHashAvailable` and
  `readingBridgeApiCredentialReady` are both present and exactly `true`; an
  omitted, false, malformed, partial, or ambiguous value is a production
  failure;
- login, dashboard, habits, Calendar, Todoist, and Obsidian checks pass where
  configured;
- safe record counts before and after match when a separately approved migration
  or data-sensitive release plan requires counts.

Do not expose record contents. If any verification fails, stop, preserve safe
evidence, report current traffic, and propose the exact rollback command. Never
roll back automatically.

## Rollback gate

Rollback may target only the `PREVIOUS_PRODUCTION_REVISION` captured for this
release. It must be a known-good revision of `life-site-dashboard`, never a
revision or image from `life-site-dashboard-staging`. Reconfirm its recorded
image digest, availability, and readiness before requesting approval.

Require the user to type the release-specific phrase with both placeholders
resolved exactly:

```text
Rollback production release DEPLOYED_COMMIT to PREVIOUS_PRODUCTION_REVISION
```

Only then run:

```text
gcloud run services update-traffic life-site-dashboard \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --to-revisions PREVIOUS_PRODUCTION_REVISION=100
```

After rollback, require 100 percent production traffic on the recorded revision,
verify `/api/health` and `/api/readiness`, and report final traffic allocation.
If the recorded revision or image proof is missing, stop and require a separate
rollback plan; never substitute staging or guess.

## Report state precisely

At every pause, name the full commit, immutable digest when available, service,
revision, and traffic state. Distinguish clearly among:

- commit verified remotely but no image built;
- one immutable image built but not deployed;
- exact digest verified on the separate staging service;
- exact same digest present as a no-traffic production candidate;
- exact production revision receiving 100 percent traffic;
- production rolled back to the recorded known-good revision.

Never say "staging" when referring to a production traffic tag or production
revision. Never say "promoted" unless the exact staging-tested digest is proven
on the production revision and the final traffic gate was satisfied.
