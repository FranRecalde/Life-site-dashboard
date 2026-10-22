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

## Timeline usability revision — 22 October 2026

- [x] Inspect released implementation and distinguish original workspace from released source.
- [x] Identify gesture conflict: all block content used touch-action:none; sticky phone column consumed 210px of the viewport.
- [x] Add day/week/two-week/month views and date navigation using calendar arithmetic.
- [x] Separate touch swipe from grip dragging, add scroll controls and clarify waiting/buffer reservations.
- [x] Verify targeted tests, TypeScript, full tests and production build.
- [x] Verify desktop and phone browser workflows with controlled local fixture; record results.

Amber action log: normal UI feature/fix implementation in the existing released checkout. Original workspace preserved. No production, credential, authentication, infrastructure or personal Todoist changes. Historical release authorization above applies to that earlier release, not this revision.

Verification (22 October 2026):
- Pass: `npm run test:timeline` (14 tests), `npm test` (201 tests), `npm run lint`, `npm run build`, `git diff --check`.
- Pass: headless installed Edge at 1440x1100 and touch-emulated 390x844. Day/week/fortnight/month counts; October/November navigation; view reload persistence; date selection; visible horizontal scroll buttons; mouse drag and persisted time/date; rejected overlap retains saved plan and displays reason; click-to-edit; native touch swipe on card content without rescheduling; first tap after swipe; touch grip drag; waiting explanation; no browser runtime errors.
- Pass: mobile page width 390px for a 390px viewport; timeline width 342px; sticky project width 131px. Reviewed desktop/mobile screenshots.
- Evidence: `.codex-output/verify-timeline.cjs`, `.codex-output/timeline-browser-results.txt`, `.codex-output/timeline-desktop.png`, `.codex-output/timeline-mobile.png` in the released-source checkout.
- Review: `http://localhost:3102/?view=projects-timeline`; `TIMELINE_PREVIEW_PORT=3102 npm run preview:timeline` (set environment variable using the current shell). This is a clearly labelled local fixture with isolated persistence, not live Todoist.
- Not run: physical phone/Safari and live personal-account mutations. No deployment performed. Existing build chunk-size advisory remains.

## Clip-reported drag failure — 22 October 2026

- [x] Inspect supplied 5.6-second recording and reproduce the exact plumber block drag from Friday 23 to Sunday 25.
- [x] Identify actual rejection: Sunday exceeds the downstairs target/fallback and 14:00–15:30 overlaps Empty the sheds (13:00–15:30). The old error was above the user's visible viewport, and no card followed the cursor.
- [x] Add a pointer-transparent card preview following the drag. Rejected drops open the existing editor with the attempted destination, human-readable conflict task names and unchanged saved data. Server-rejected moves also open the editor.
- [x] Expose the existing project target in the editor so the user can explicitly correct a late move along with date/time. No automatic target extension or silent conflict override. Successful editor saves select the destination date.
- [x] Exact-clip browser regression: cursor preview and Sunday destination; visible overlap/target conflicts; blocked Save; original Friday persisted; corrected date and target save to 3 November; reload confirms persistence. Restore only fixture block/target changed by this check.
- [x] Existing desktop/touch browser regression passes, including native swipe, grip drag, invalid overlap, click-to-edit, date navigation and persistence. TypeScript, 14 timeline tests, 201 full tests, build and diff whitespace checks pass.

Amber action log: narrow UI feedback/correction change, reusing the existing plan endpoint and constraints. No backend/schema/dependency, production or real Todoist changes. Evidence: `.codex-output/verify-clip-drop.cjs`, `clip-drop-results.txt`, `clip-drag-preview.png`, `clip-drop-conflicts.png`, plus the rerun `timeline-browser-results.txt`. Preview remains port 3102. Physical phone/Safari and live-account writes remain Not run.

## Second clip — direct draft placement, 22 October 2026

- [x] Inspect all 16.8 seconds of the second recording. It shows the new conflict modal after paint is dropped onto Saturday; Save remains disabled. The previous editor-only fix did not meet the requested behavior.
- [x] Change manual draft scheduling conflicts into visible warnings. Dragging now saves the chosen date without requiring a conflict-resolution modal or silently changing time, duration, targets or other blocks. Editing a draft can also save with schedule warnings.
- [x] Preserve hard record validation, task ownership, stale revision and past-work guards. Keep full scheduling checks at Todoist preview/apply boundaries.
- [x] Restart the port-3102 fixture backend after route/model changes; Vite HMR does not reload Express routes.
- [x] Use the actual existing in-app browser tab and native pointer drag, matching the second clip: Paint the walls, Friday 23 at 09:30–10:30, moved onto occupied Saturday 24. Actual UI reports saved, shows the card in Saturday and has no dialog. Reload confirms the Saturday block persists; opening its editor confirms draft Save is enabled despite warnings; cancel returns to the moved card.
- [x] Add route regression coverage for exact paint-to-Saturday and plumber-to-Sunday moves, preserved block fields, reload persistence, no Todoist commands, and strict preview refusal. Existing stale revision/foreign ID/invalid estimate/duplicate ID checks remain covered.
- [x] Pass: 15 timeline tests, 202 full tests, TypeScript, production build and diff whitespace checks. Actual in-app native pointer/reload verification passes.

Amber log: normal local behavior correction under the user's request to move boxes freely. No production deployment, schema, credential, authentication or real Todoist changes. A preview-fixture paint block is deliberately left on Saturday, the destination shown in the user's clip. Source spec and blueprint record the superseded draft constraint behavior. Evidence: `.codex-output/direct-placement-tests.log`, `.codex-output/in-app-drag-saved.png`, `server/timeline/timelineRoutes.test.ts`.

Not run for this correction: physical phone/Safari, repeat touch emulation, and live account mutations. Pointer/touch handlers are unchanged; earlier gesture checks remain historical evidence, not a fresh run of this correction. Prior browser scripts expecting conflict-blocking modals describe superseded behavior.

## Keep viewport still during drag — 22 October 2026

- [x] Inspect the third recording. A visible-date drop changed the selected day, and the selected-date effect aligned its column to the left, shifting the horizontal bar.
- [x] Replace unconditional alignment with minimal reveal: keep the current horizontal offset when the date is fully visible; reveal only the clipped portion for an offscreen date. Narrow drag edge-scroll activation from 45px to 16px.
- [x] Add a runnable viewport regression covering visible dates, nonzero offsets, the sticky project column, clipped dates and phone widths.
- [x] Actual existing in-app browser: normal Saturday-to-Sunday move retains scrollLeft=0, scrollTop=17, page scrollY=682 and timeline viewport top=265.5px before and after save. Friday-to-Saturday also retains horizontal scroll and visual timeline top; browser anchoring compensates for the first success notice.
- [x] Actual in-app browser: drag to the partially visible Monday at the far right reveals only 50px. Returning the test block to its original Friday preserves that 50px offset. Saved date/time remain correct, and no modal appears.
- [x] Focused checks: 16 timeline tests and TypeScript pass.
- [x] Final checks: 203 full tests, production build and diff whitespace check pass. Existing bundle-size advisory only. Log: `.codex-output/stable-scroll-tests.log`.

Amber log: narrow local UI behavior fix; no production, backend, schema, credential or live Todoist changes. The Sand down the walls fixture block was returned to Friday, its date at the start of verification. Evidence: `.codex-output/timeline-scroll-fixed.png`, `src/timeline/view.test.ts`, actual in-app pointer/DOM measurements above. Physical phone/Safari not rerun; phone viewport arithmetic covered by the regression.

## Production release authorization — 22 October 2026

The user explicitly requested pushing the completed timeline changes to live production. Scope: day/week/two-week/month views; phone scrolling and grip drag; direct draft placement with schedule warnings; waiting/buffer explanations; stable viewport with edge-only reveal. Release through a feature PR, clean merged-source checks, one immutable image, separate staging verification and promotion of that same image to production. This authorization covers application release and traffic promotion; no credentials, authentication configuration, infrastructure foundations or data migrations are included.

Release evidence is kept outside the source checkout under C:/Users/Admin/.codex/release-artifacts/timeline-usability-20261022/. A separately clean release checkout is used so local fixture files and media are never uploaded. No production task completion or schedule application is part of release verification.
