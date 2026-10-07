# Build milestones
## 1. Establish the build contract
- [x] Inspect applicable instructions and implementation.
- [x] Populate specification and blueprint from repository evidence.
## 2. Complete the essential workflow
- [x] Implement full-day weekly calendar, zoom and Google link.
- [x] Add dashboard completion and daily rundown checklist.
- [x] Add subtasks and full comments in task details.
## 3. Verify and hand over
- [x] Run focused and project checks.
- [x] Exercise interactive workflows in browser with isolated API fixtures.
- [x] Record results and deliver review location.
## Amber-lane action log
- Authorized normal feature work: calendar UI, navigation, task checklist and read-only comments endpoint. No production, secret, authentication or infrastructure changes.
## Verification evidence
| Criterion or check | Evidence | Result |
| --- | --- | --- |
| AC1 | Three focused tests cover selected-week boundaries, Sunday/year rollover, multi-day/all-day events and daily filtering. Browser verifies 24 hours, >3 events, late events, zoom changes and lower bound. | Pass |
| AC2 | Browser checks Google Calendar link contains displayed view/date route and opens a new tab. External Google destination not exercised. | Pass (local link); live destination Not run |
| AC3 | Browser navigates desktop/mobile rundown; excludes future tasks, completes an item, disables completion offline. | Pass (isolated API fixtures) |
| AC4 | Browser checks dashboard completion invokes completion without opening details; parent confirmation cancels without mutation; failure remains visible and retry succeeds. | Pass (isolated API fixtures) |
| AC5 | Browser checks unlabeled and nested subtasks, full long multiline comment equality, failure/retry, no page errors. Actual Express HTTP route checks auth, two-page upstream pagination, full normalized text/attachments, 401 handling and safe 500 errors. | Pass (isolated upstream fixtures) |
| `npm run lint` | TypeScript noEmit, exit 0. | Pass |
| `npm test` | 186 tests, zero failures (includes reading pipeline and three new workflow tests). | Pass |
| `npm run build` | Vite and esbuild exit 0; existing >500 kB bundle advisory remains. | Pass |
| `git diff --check` | No whitespace errors. | Pass |
| Live Google/Todoist | No real account reads, task mutations, or external destination browser checks performed. | Not run |

Reproducible local verification artifacts:
- `.codex-output/calendar-tasks-daily-rundown/browser-check.cjs` (requires local Vite on 5179, bundled Playwright and installed Edge).
- `.codex-output/calendar-tasks-daily-rundown/comments-runtime-check.mjs` (runs actual Express on 5181 with isolated local storage and mocked upstream; no real credentials).
- Screenshots in the same artifact directory: `task-details.png`, `calendar-full-day.png`, `calendar.png`, `rundown-mobile.png`.

## Delivery
Source changes are in the current working tree; no commit or release requested. Run the existing application locally from PowerShell:
```powershell
$env:SECRET_PROVIDER='existing'
$env:STORAGE_PROVIDER='local'
npx tsx server.ts
```
Review at `http://localhost:3000` with existing local login/configuration. The standalone Vite verification server has no real API backend. The daily checklist follows existing Todoist active-task refresh behavior; completed items leave the checklist after refresh rather than creating a second completion history.

## Blockers and remaining work
No implementation blockers. Live integration behavior remains unverified; sample-data checks prove UI wiring and actual server request handling, not account access. Production deployment is outside this authorization.
