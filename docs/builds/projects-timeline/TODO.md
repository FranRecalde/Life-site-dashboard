# Projects Timeline milestones

## Scope and implementation
- [x] Read repository instructions, supplied spec, navigation, Todoist adapter and storage.
- [x] Preserve source brief in SPEC.md and record design in BLUEPRINT.md.
- [x] Compile all 78 task references / 75 actionable steps / 11 projects and draft buffers.
- [x] Implement model, authenticated persistent plan routes, reconciliation, progress and conflict checks.
- [x] Implement desktop/mobile navigation and timeline/day/project/task UI.
- [x] Implement persistent start-work and Todoist completion action, with pending/error states.
- [x] Implement draft editing, availability/targets, reviewed date preview and per-task application results.
- [x] Complete focused regression tests and fix findings.
- [x] Run project checks and desktop/mobile browser verification with controlled integration fixtures.
- [x] Record evidence and provide runnable localhost review.
- [ ] Verify reconciliation, completion, external history and scheduling against a real connected account after reconnecting Todoist.
- [ ] Complete live-account acceptance and any separately requested release.

## Amber action log
- 2026-10-20: Added normal feature implementation and planning metadata in existing settings persistence, scoped by authenticated user hash. No production changes or Todoist planning writes performed.
- Preserved pre-existing App/Rundown/calendar-workflow/docs changes.
- Extended existing server adapter callbacks for completion, non-recurring reopen, reviewed due-time writes and fresh completion history. History cache keys distinguish project selections; exclusive history ranges have no one-second gaps.
- Added a labelled port-3100 integration-test harness running the same app/component and timeline routes. All fixture mutations persist only under ignored data/timeline-verification/. No live Todoist writes.

## Verification evidence
| Check | Result | Evidence |
| --- | --- | --- |
| Seed compiler | Pass | 78 task references, 75 non-grouping tasks, 11 projects, 91 blocks including buffers. |
| TypeScript | Pass | `npm run lint`. |
| Focused tests | Pass | `npm run test:timeline`: 11 tests. Covers counting, explicit groups, owner isolation, recurrence, DST/midnight, Inbox, conflicts, completion failure/duplicates/reopen, stale preview, no-op dates, failed-only retries and expired-connection write blocking. |
| Full tests | Pass | `npm test`: 198 passed, zero failures, including existing Reading/Signal/storage/calendar checks. Log: .codex-output/projects-timeline-tests.log. |
| Build | Pass | Vite and server bundles succeed. Client chunk advisory above 500 KB remains (~671 KB uncompressed). |
| AC1: navigation | Pass (fixture) | Desktop/mobile tab beside Projects; existing Rundown renders and selected date survives leaving/returning. |
| AC2/5: IDs / totals | Pass (controlled); Blocked (live) | All 78 seed references inspectable, 11 exact project IDs, dynamic 75-step denominator. Live source returns 401. |
| AC3/4: Inbox / Today | Pass (controlled) | Renamed Inbox excluded by identity; independent Today includes other-project tasks once. Browser confirms Inbox marker absent. |
| AC6/7: completion | Pass (controlled); Blocked (live) | Browser changes downstairs 0/17 to 1/17 (6%); retained after reload. Injected failure leaves task unchecked with error. Concurrent router requests send one mutation. |
| AC8: Start work | Pass (controlled) | Kindstack In progress survives reload without completing the task. Owner isolation tested. |
| AC9/10: blocks / details | Pass (controlled) | October 26 chronological computer-only day and 9h30 active effort. Split DUA task counts once. Downstairs expands to 19 tasks with groups and parent references. |
| AC11/12/13: constraints | Pass | Seed has no overlaps/window/order conflicts. Friday target/Saturday fallback visible. Spanish only 20/22/24 at 18:00–18:30. Editing a visit onto October 26 shows conflicts and disables Save. |
| AC14: timezone | Pass (automated) | London midnight and October 24/25 DST conversions. Minute refresh updates Today. Date defaults continue beyond October. |
| AC15: recurrence | Pass (controlled); Blocked (live) | Browser completion retains a single checked occurrence after next due advances; tests include external completion and midnight. |
| AC16: external progress | Pass (model); Blocked (live) | Fresh active/completed reconciliation; missing records and incomplete history suppress percentages. |
| AC17: scheduling | Pass (controlled); Blocked (live) | Preview sends no writes. Old/new due values shown in London time; deadlines/durations unchanged. Mock batch: 73 initial successes, one failure, one successful failed-only retry. Stale dates/revisions rejected; no-op updates omitted. |
| AC18: responsive / accessibility | Pass (browser/code); Partial (OS motion) | Desktop and 390x844 tested. Page width 384 within 390 viewport; 1260px timeline scrolls within 336px region. Native labelled dialogs, Escape and opener focus restoration verified. Theme token inheritance verified; reduced-motion CSS inspected, OS preference not emulated. |
| Authentication | Pass | Unauthenticated GET localhost:3000/api/timeline returns 401. |
| Real Todoist | Blocked | Existing local saved token returns HTTP 401 Unauthorized. User asked to sign in and reconnect via Settings → Connections. |

## Remaining work / limitations
- Live completion and schedule apply must not mutate personal Todoist data merely to prove tests. Use controlled integration fixtures; report this distinction.
- Verified non-recurring reopen support against official API reference and added Undo completion. Recurring occurrence Undo directs users to Todoist to preserve recurrence semantics.
- Release is not performed by local implementation.
- No production changes, real task completions or real scheduling writes. The attached spec does not bypass release guardrails or approve applying draft dates.
- Europe/London planning. Elapsed draft blocks remain visible and flagged, never silently moved/completed. New edited work cannot be in the past; applying passed due times reports per-task conflicts.
- Hidden project reservations still consume capacity. Missing tasks/projects/history never produce invented completion percentages.
- Existing global .dark CSS shares the light palette; timeline inherits existing tokens without redesigning the theme.
- Settings storage retains the existing single-user concurrency/storage behavior; no distributed transaction system added.
- Normal app: http://localhost:3000/?view=projects-timeline (usual login; reconnect Todoist). Controlled review: http://localhost:3100/?view=projects-timeline (`npm run preview:timeline`). A fixture preview does not satisfy live-account acceptance.

## Project picker and drag revision — active

- [x] Inspect current code and preserve unrelated work in the original checkout.
- [x] Add accessible Todoist project picker and selected-project history coverage.
- [x] Add individual pointer-draggable blocks with existing conflict/revision checks.
- [x] Targeted tests: 13/13 pass; TypeScript passes.
- [x] Background browser: add Other project; drag paint-colour block from Oct 20 to Oct 23; reload retains project and move; attempted move to occupied Oct 21 rejects and preserves Oct 23. Controlled fixture only, no real Todoist writes.
- [ ] Full merged-source lint/build/tests and production preflight.
- [ ] Direct production immutable release and health/readiness/frontend/traffic verification.

Amber log: normal feature changes in isolated clean checkout; no new dependency/schema/credential; local fixture uses independent port/data directory. Assumptions: add means include existing Todoist projects; dragging preserves time; target defaults to visible range end. Production application deployment explicitly authorized by user; staging prohibited. Live authenticated Todoist actions remain unavailable to automation without user login.

Feature verification: Pass — npm run lint; npm run build; npm test (200/200). Existing bundle-size advisory only. Background browser confirmed picker, pointer drag, persistence and conflict rejection. A transient development hot-reload error occurred between sequential edits and was resolved before verification; final TypeScript and production build pass.
