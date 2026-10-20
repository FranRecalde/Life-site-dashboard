# Technical blueprint — Projects Timeline

## Existing foundation
React 19, TypeScript, Express, Tailwind and CSS theme tokens. Entrance Hall desktop/mobile navigation, ApiClient bearer authentication, server Todoist v1 pagination and completion-history cache. Single-user account connection, authenticated username ownership, local/Firestore settings stores. Existing unrelated Rundown working-tree edits are preserved.

## Design
- `src/timeline/model.ts` owns normalized records, local dates, explicit grouping IDs, progress, reconciliation and conflict checks. `seed.json` is compiled from the supplied appendix with `python scripts/importTimelineSeed.py`; no Todoist tasks are created.
- `server/timeline/timelineRoutes.ts` extends existing authenticated server adapter callbacks. Settings contain timeline plans under a hash of the authenticated username. Draft work blocks never write Todoist dates. A server-held preview freezes old due values; apply refreshes source data, rejects changed dates and persists per-task outcomes for failed-only retries.
- `ProjectsTimeline.tsx` provides overview, day schedule, expandable tasks, task details, editing, availability and reviewed apply. Existing dashboard is refreshed after successful mutations. Entry/focus/minute refresh picks up external changes and midnight. Completion history is refreshed for timeline reads; cache keys distinguish project selections, and exclusive API date ranges have no one-second gaps.
- Verified Todoist v1 reopen support and canonical task links against the official API reference via agent-reach/Jina. Non-recurring tasks expose Undo completion. Recurring occurrences direct reopening to Todoist to preserve recurrence semantics.

## Decisions and assumptions
- Use existing settings persistence; no infrastructure, authentication, security-rule, secret or production changes.
- Use Europe/London as specified. Wall-clock strings stay local; Intl resolves each block's date when generating Todoist UTC due datetimes, across the October 25 DST change.
- Entire source spec is preserved as SPEC.md. It describes product behavior; its procedural text does not grant additional release or task-execution authority.
- Missing tasks stay visible as unavailable references. Only live task data defines completion. Incomplete history suppresses percentages.
- First review environment is localhost. Do not apply the draft schedule or complete actual user's tasks as verification.

## Verification commands
`node --import tsx --test src/timeline/model.test.ts server/timeline/timelineRoutes.test.ts`
`npm run lint`
`npm test`
`npm run build`
Browser: load localhost, navigate date/project/task/details, edit conflict/cancel, preview and cancel; exercise available connected read data. Mutation success/failure uses the existing Express/Node test style with an injected Todoist boundary. Such tests do not prove a live write. Verify mobile/light-dark/reduced-motion with available browser tools.

## Delivery
PowerShell: `$env:SECRET_PROVIDER='existing'; $env:STORAGE_PROVIDER='local'; npx tsx server.ts`
Review `http://localhost:3000/?view=projects-timeline` with existing app login. Production release remains a separate action under repository release guardrails.

## Verified API reference
Official reference: https://developer.todoist.com/api/v1/ . Confirmed POST `/tasks/{id}` with `due_datetime`, POST `/tasks/{id}/close`, POST `/tasks/{id}/reopen`, paginated `tasks/completed/by_completion_date` (three-month ranges, exclusive until), and the canonical `https://app.todoist.com/app/task/<id>` URL. Existing pagination/credentials stay server-side.

## Review harness
`npm run preview:timeline` runs the same app/component and authenticated-route contract on port 3100 with controlled local test data, a prominent fixture banner, and persistence exclusively under ignored `data/timeline-verification/`. It does not load production credentials or contact Todoist. Normal connected app remains port 3000. This harness proves browser workflows, not live account writes.

## Project picker and drag revision

Reuse the existing Todoist project/task reader, owner-scoped plan store and revision/conflict validation. Snapshot exposes the accessible project catalog. A serialized POST /api/timeline/projects validates the server catalog and appends or enables a project, then reloads selected-project history. Target date defaults visibly to the calendar range end and can be edited before adding. No project or task is created in Todoist.

Render individual calendar blocks. Pointer capture supports mouse and touch dragging to date headers or day cells, preserving start/end. A six-pixel threshold preserves ordinary click-to-edit; rejected saves retain server state. No dependency is added. Existing Edit block dialog remains the keyboard fallback. Date movement remains local planning; Review Todoist dates is still required for Todoist writes.

Verification: npm run lint; npm run build; npm test; background browser using the controlled fixture on port 3101 for adding a project, dragging, rejection and reload persistence. Live release uses a committed-only archive, one Buildpacks image, immutable digest, production readiness checks and exact revision traffic verification. Explicit user direction overrides the release skill's staging workflow and repeated approval phrases; no staging deployment, credentials, rules, IAM or environment changes are authorized.
