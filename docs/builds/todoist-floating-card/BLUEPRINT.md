# Implementation blueprint

## Repository foundation
React 19, Vite, Tailwind, Express, custom server sessions and the existing sole-user Todoist token stored by SecretStore (Secret Manager in hosted deployments). Existing SettingsWorkspace connects/removes the token. Existing completion POST /api/tasks/:id/complete calls Todoist API v1 /tasks/:id/close.

## Smallest design
- Authenticated GET /api/todoist/card reuses existing pagination and normalization; projects enrich task labels and identify Inbox; no-store response and safe upstream errors.
- TodoistFloatingCard mounts once after authentication in App. React portal renders the same state in Document PiP. Shared completion/errors and synchronous lock reuse existing dashboard mutations. Card refresh updates existing dashboard tasks; dashboard changes flow back to card.
- Scoped CSS keeps readable glass styling in both documents without copying the whole application's styles. Only one native PiP window; pagehide/focus listeners removed on teardown, unmount closes window.
- Local day model handles API v1 date-only, floating datetime and offset datetime. UI derives overdue by calendar day, not server midnight.
- Read timeout 20 seconds; visible tab or open PiP polls every 60 seconds; failures back off to 15 minutes. No mutation retry. On focus, refresh if not in failure cooldown. Connection change aborts old read, clears tasks, then refetches.

## Decisions and assumptions
Existing personal, single-user integration is retained as requested; OAuth would duplicate a working secure integration. Do not claim per-user token support for additional site accounts. Task selection is independent of the dashboard personal/professional label filters. Return to tab replaces the impossible browser-level send-behind/desktop-transparency control.

## Verification commands
- npm run test:todoist-card
- npm run lint
- npm test
- npm run build
- npx tsx scripts/previewTodoistCard.ts → http://localhost:3106/__card (test data only, no .env/server.ts/real Todoist)
Reading pipeline unchanged; full npm test includes its tests.

## Official references verified 2026-11-04
- https://developer.todoist.com/api/v1/ — paginated tasks/projects, API v1 due.date datetimes, Inbox identity; /tasks/{id}/close completes regular tasks and advances recurring occurrences.
- https://developer.chrome.com/docs/web-platform/document-picture-in-picture — transient user gesture, requestWindow dimensions, native close/pagehide, always-on-top, cannot position programmatically or outlive opener.
Retrieved official Todoist documentation through agent-reach's Jina reader route and verified official pages with web tools.

## Setup and use
No new OAuth app, callback, scopes or hosting secrets required. Retain TODOIST_API_TOKEN in the existing server SecretStore; connect/disconnect through Settings → Connections. Never put that value in VITE_* variables. HTTPS secure context required for deployed PiP; localhost works for development. School browser policy may disable the API. Keep opener tab open.

PowerShell connected development uses existing project configuration: $env:SECRET_PROVIDER='existing'; $env:STORAGE_PROVIDER='local'; npx tsx server.ts. This can access configured integrations; use the fixture command for safe review.

## Release and recovery
Follow .agents/skills/life-site-safe-release/SKILL.md: release only a clean already-merged main commit, immutable build digest to separate staging service, verification, then explicitly approved production promotion. Current checkout contains extensive pre-existing uncommitted work; do not release the dirty tree or include unrelated changes. No cloud/credential/rules changes performed. Production release remains pending repository guardrail approval. Local recovery: remove only this feature's additions/hunks, preserving unrelated work.
