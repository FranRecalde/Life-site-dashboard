---
name: life-site-safe-release
description: >-
  Safely verify, build, stage, promote, verify, and explicitly roll back the
  Life Site Dashboard from GitHub main to Google Cloud Run without Google AI
  Studio publishing. Use for release, staging deployment, production promotion,
  production verification, or rollback work involving
  FranRecalde/Life-site-dashboard and the life-site-dashboard Cloud Run service.
---

# Life Site Safe Release

Release the Life Site Dashboard through a fail-closed, approval-gated workflow.
Treat GitHub `main`, a zero-normal-traffic staging revision, and the revision
currently serving production as three distinct states. Explain every transition
in plain English.

## Fixed release coordinates

- Repository: `FranRecalde/Life-site-dashboard`
- Authoritative branch: `main`
- Google Cloud project: `gen-lang-client-0802447346`
- Cloud Run region: `europe-west2`
- Cloud Run service: `life-site-dashboard`
- Permanent staging traffic tag: `staging`
- Permanent production URL:
  `https://life-site-dashboard-708819606972.europe-west2.run.app`

## Enforce the safety boundary

- Treat GitHub `main` as the sole authoritative application source.
- Never publish from Google AI Studio.
- Never commit, print, copy, summarize, or otherwise expose passwords, password
  hashes, API tokens, OAuth credentials, `.env` files, Secret Manager values,
  private notes, or runtime data. Report only safe file names and redacted
  findings when a security check requires a report.
- Never inspect secret values merely to complete this workflow.
- Never modify Secret Manager, Firestore, OAuth settings, authentication
  configuration, or environment variables unless the user explicitly requests
  that separate change. Treat such a request as separate from the release.
- Treat a request to prepare a staging deployment as authorization for Phases 1,
  2, and 3 only. Never treat preparation, verification, or build inspection as
  authorization to create a Cloud Run revision.
- Never run a `gcloud` deployment command until the user gives the exact staging
  approval phrase required below.
- Never send normal production traffic to a new revision automatically.
- Treat staging deployment and production promotion as separate approval gates.
  Approval to deploy to staging never authorizes a production traffic change.
- Never hardcode or reuse a rollback revision. Capture it from live traffic
  immediately before each staging deployment.
- Never deploy with unreviewed or uncommitted application changes.
- Stop immediately when any required check is ambiguous or fails. Report the
  failed check without bypassing, suppressing, weakening, or working around it.
- Do not start a later phase until every required check in the current phase
  passes.
- Keep a release record in the task containing only these safe identifiers:
  `DEPLOYED_COMMIT`, `PREVIOUS_PRODUCTION_REVISION`, and
  `STAGING_REVISION_NAME`. Do not invent a missing value.

## Phase 1 — Verify the source

1. Confirm that the working directory is the intended repository. Read the
   `origin` URL without displaying embedded credentials. Accept the normal
   GitHub HTTPS or SSH form only when its owner and repository normalize exactly
   to `FranRecalde/Life-site-dashboard`. Stop if the remote URL contains user
   information, credentials, or an unexpected host.
2. Confirm that the current branch is exactly `main`.
3. Fetch `origin` without changing application files.
4. Resolve local `HEAD` and `origin/main`. Require the two full commit hashes to
   be identical. Do not merge, rebase, pull, reset, or switch revisions to make
   them match.
5. Require `git status --porcelain=v1` to be empty. Treat staged, unstaged, and
   untracked application files as a failure. Ignore only generated files already
   excluded by the repository's committed ignore rules.
6. Set `DEPLOYED_COMMIT` to the exact full hash of the verified `HEAD` and report
   it as the commit that would be deployed.
7. Inspect tracked file names and any changed-file names for likely secret,
   private-note, or runtime-data paths. Use filename-only or redacted output.
   Never print file contents from `.env` files, credential files, private notes,
   runtime stores, or likely secret files.
8. Run the repository's configured secret scanner when one exists. Otherwise,
   scan tracked content with a reputable available scanner or filename-only,
   redacted pattern checks. Do not print matching values. Treat every credible
   finding, scanner error, or inability to inspect safely as a failed check.
9. Inspect the filenames that `gcloud` would upload, without deploying. Require
   `.gcloudignore` or equivalent upload exclusions to omit `.git`, `.env` files,
   credentials, private notes, local runtime data, test artifacts containing
   user data, and unrelated local files. Stop if the candidate source bundle is
   ambiguous or unsafe.

Distinguish clearly in the report that `DEPLOYED_COMMIT` is committed code on
GitHub and is not yet a Cloud Run revision.

## Phase 2 — Run the build inspection

Run these commands separately and in this exact order:

```text
npm ci
npm run lint
npm run build
npm test
```

Report pass or fail for each command. Do not claim a command passed unless its
process exits successfully. Stop at the first failure, and do not deploy unless
all four pass.

After all four commands pass, reconfirm that local `HEAD` still equals
`DEPLOYED_COMMIT`, local `HEAD` still equals `origin/main`, and the Git working
tree is still clean. Reinspect candidate upload filenames if the build created
files that could enter the source bundle. Stop if any result changed or is
unsafe.

## Phase 3 — Record the current safe version

1. Inspect only the Cloud Run service's safe traffic fields. Avoid commands or
   output formats that reveal environment variables, secret references, or
   configuration unrelated to traffic.
2. Identify the exact revision currently receiving normal production traffic.
   Distinguish untagged production traffic from traffic-tag URLs. Require one
   unambiguous revision receiving 100 percent of normal production traffic; stop
   and ask the user how to proceed if traffic is split or ambiguous.
3. Set `PREVIOUS_PRODUCTION_REVISION` to that exact revision name for this
   release only. Do not derive it from `LATEST`, the staging tag, a prior task,
   or a hardcoded value.
4. Show the current production revision and the identical per-release rollback
   target to the user before creating a revision.

## Mandatory staging approval gate

A request such as `prepare a staging deployment` may complete Phases 1, 2, and
3 only. After Phase 3, show all of the following:

- The exact `DEPLOYED_COMMIT` verified from GitHub `main`.
- The exact revision currently receiving normal production traffic.
- The exact `PREVIOUS_PRODUCTION_REVISION` captured as the rollback target.
- The exact staging deployment command planned for Phase 4:

```text
gcloud run deploy life-site-dashboard \
  --source . \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --no-traffic \
  --tag staging
```

Then stop and wait. Do not run any `gcloud` deployment command until the user
explicitly says exactly:

```text
Deploy the verified commit to staging
```

Treat similar wording as insufficient. After receiving the exact phrase and
immediately before deploying, repeat the exact `DEPLOYED_COMMIT`, the current
production revision, `PREVIOUS_PRODUCTION_REVISION`, and the exact command shown
above. Reconfirm that the verified commit and current production revision have
not changed. If either changed or any value is missing or ambiguous, stop and
require the preparation phases and staging approval gate to be completed again.

This approval authorizes Phase 4 only. It does not authorize production
promotion or any production traffic change.

## Phase 4 — Deploy to staging only

Enter this phase only after the mandatory staging approval gate has been
satisfied. Reconfirm the clean-tree and exact-commit checks immediately before
deployment. Then run exactly this deployment, preserving all existing service
configuration:

```text
gcloud run deploy life-site-dashboard \
  --source . \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --no-traffic \
  --tag staging
```

After deployment:

1. Query safe revision and traffic fields and identify the exact revision now
   targeted by the `staging` tag. Set it as `STAGING_REVISION_NAME`.
2. Confirm the staging tag resolves to that exact revision.
3. Confirm the new revision receives zero normal production traffic. Explain
   that it remains reachable through its staging-tag URL despite receiving no
   normal production traffic.
4. Obtain and report the exact staging-tag URL from Cloud Run. Do not construct
   or guess the URL.
5. Report the mapping from `DEPLOYED_COMMIT` to `STAGING_REVISION_NAME` and state
   explicitly that production has not changed.
6. Do not promote the revision.

## Phase 5 — Wait for user testing

Give the user the staging URL and this checklist:

- Login
- Google Calendar connection and calendar events
- Todoist tasks and projects
- Obsidian connection, note opening, note creation, and note editing
- Global search
- Logout
- Mobile layout where relevant
- `/api/health`
- `/api/readiness`

Then stop and wait. Do not claim testing passed merely because the deployment or
automated health checks succeeded. Record the user's test result without
exposing account, note, calendar, task, or runtime data.

## Phase 6 — Require production approval

Continue toward production only after the user explicitly says exactly:

```text
Promote staging to production
```

Treat similar wording as insufficient. After receiving the phrase:

1. Requery safe Cloud Run traffic fields and reconfirm that the `staging` tag
   still points to `STAGING_REVISION_NAME`.
2. Reconfirm that `DEPLOYED_COMMIT` is the verified commit associated with that
   staged release.
3. Reconfirm that `PREVIOUS_PRODUCTION_REVISION` is the rollback revision
   captured before this release and that it is still the revision receiving
   normal production traffic.
4. Show these three exact values clearly:
   `STAGING_REVISION_NAME`, `DEPLOYED_COMMIT`, and
   `PREVIOUS_PRODUCTION_REVISION`.
5. Ask for final confirmation to execute the traffic change, then stop and wait.
   Do not treat the earlier promotion phrase as this final confirmation.

Only after the user gives that final confirmation, substitute the exact verified
staging revision name and run:

```text
gcloud run services update-traffic life-site-dashboard \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --to-revisions STAGING_REVISION_NAME=100
```

Never use `LATEST`, a tag name, or a guessed or hardcoded revision in
`--to-revisions`.

## Phase 7 — Verify production

1. Confirm through safe traffic fields that 100 percent of normal production
   traffic reaches `STAGING_REVISION_NAME`.
2. Check `/api/health` and `/api/readiness` on the permanent production URL.
   Report sanitized status and outcome only; do not expose response data that
   could contain sensitive runtime information.
3. Report the permanent production URL, `DEPLOYED_COMMIT`, and the new production
   revision.
4. Preserve `PREVIOUS_PRODUCTION_REVISION` as the immediate rollback target for
   this release. Do not replace it with the newly promoted revision.
5. If verification fails, report the failure and the captured rollback target.
   Do not roll back without explicit user instruction.

## Phase 8 — Roll back only on instruction

Roll back only when the user explicitly instructs a rollback for this release.
Require the in-task `PREVIOUS_PRODUCTION_REVISION` captured before promotion;
stop if it is missing or ambiguous. Reconfirm and show that exact revision before
changing traffic.

After explicit rollback instruction, substitute the captured revision and run:

```text
gcloud run services update-traffic life-site-dashboard \
  --project gen-lang-client-0802447346 \
  --region europe-west2 \
  --to-revisions PREVIOUS_PRODUCTION_REVISION=100
```

Never select a rollback target from a hardcoded example, `LATEST`, or memory of a
previous release. After rollback, confirm that 100 percent of normal production
traffic reaches the captured revision, then check `/api/health` and
`/api/readiness` at the permanent production URL. Report sanitized results and
the exact revision now serving production.

## Report state plainly

At every pause or completion, state which of these is true:

- The code is committed to GitHub `main` but has not been deployed.
- A specific Cloud Run revision contains the verified commit and is reachable
  only through the `staging` traffic-tag URL, with zero normal production
  traffic.
- A specific Cloud Run revision currently receives 100 percent of normal
  production traffic at the permanent production URL.

Never use “deployed,” “live,” or “released” without naming the relevant commit,
revision, and traffic state.
