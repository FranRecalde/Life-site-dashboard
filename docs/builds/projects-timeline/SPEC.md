# Projects Timeline — feature specification

## Objective

Add a tab named **Projects Timeline** to my existing live site/board. Turn the timeline designed in this Codex conversation into a useful daily workspace: see projects across dates, understand available work time, see clear visual progress, start work, and complete tasks through the site's existing Todoist API integration.

Use the existing application, navigation, design system, authentication, Todoist connection, and persistence. Inspect the repository and existing integration before implementing. This document defines desired behaviour; it does not prescribe unverified API endpoints or a new technology stack.

## Scope and source of truth

- Include the 11 projects listed below, with their tasks and subtasks.
- Include my **Today tasks** from other projects as a distinctive additional group.
- **Exclude Inbox and all tasks belonging to Inbox**, including tasks due today. Resolve Inbox using Todoist's Inbox flag/identity rather than its display name.
- Todoist remains authoritative for task identity, titles, hierarchy, completion, labels, due dates, deadlines, and supported task fields.
- App persistence owns planning data that Todoist does not provide: multiple work blocks per task, work windows, project targets, explicit grouping-task flags, provisional bookings, and local in-progress status.
- Reuse task/project IDs. Do not recreate projects or duplicate tasks when importing this plan.
- The proposed timetable in this document has **not been approved for writing dates into Todoist**. Import it as a draft, reconcile it against current Todoist data, and show a preview before the user applies it.
- The requested outcome is a working addition to the existing site. Do not build a separate demo or a second Todoist connector.

## Initial project selection

| Project | Todoist project ID | Target |
|---|---|---|
| Downstairs toilet | `6hpVF7Ch8Cp78J8V` | Friday 23 October 2026; Saturday 24 October fallback |
| Piano | `6hpVG7fv8RHP9rVW` | By 31 October 2026 |
| Patio doors | `6hpVGCqPHmj99Wfr` | By 31 October 2026 |
| Top bathroom | `6hpVGWCRxJXVfWjQ` | By 31 October 2026 |
| Catch up with the budget | `6hpVGjXPG9FgcGX7` | By 31 October 2026 |
| Sell the car | `6hpVHM7973FpvpWx` | By 31 October 2026; buyer dependent |
| Half-term work project | `6hpVHM79m7XF72cV` | By 31 October 2026 |
| Setup Kindstack | `6hpVHgmXg2PQXJxf` | By 31 October 2026 |
| Personal life project | `6hpVHgjF8Cv3277q` | By 31 October 2026 |
| Converting the Shed | `6hpVP6crqr9x6jRM` | By 31 October 2026 |
| Teaching my daughter Spanish — this week | `6hpVPpH2QvFQC2X5` | Lessons on 20, 22 and 24 October only |

Setup Kindstack remains a subproject of Start Business; do not import the rest of Start Business automatically. Likewise, do not import the older SYLO, DUA maintenance, App Ideas, dashboard adaptation, or Ideal Week backlogs wholesale. Their individual Today tasks can appear through the Today group.

## Experience and layout

### Tab and overview

- Add **Projects Timeline** beside the site's existing tabs, using its navigation and responsive patterns. Preserve the selected date when leaving and returning.
- Initial draft range: **20–31 October 2026**. After that period, use the current date and existing date-navigation conventions; do not freeze Today to October 2026.
- Use a clear project-by-day timeline with aligned date columns and project lanes. Label weekdays and dates. Show work blocks, daily estimated effort, and project finish targets.
- Keep the priority downstairs toilet lane prominent, with a **Priority** label, Friday finish marker, and Saturday fallback marker.
- Select a date to open that day's timetable and full task details. Select a project to expand all its tasks and work blocks.
- Preserve the useful interaction from the prototype: overview first, then a selected-day schedule, then expandable project task lists.
- Show unscheduled tasks explicitly. Missing estimates must display **Not estimated**, not zero effort or an invented date.

### More visual progress

Make progress feel polished and noticeable while fitting the existing site's appearance.

- Each project gets a bold percentage, a clear progress ring or substantial progress bar, and a readable **completed / total steps** count.
- Show the next scheduled action and project target alongside progress, without turning every row into a dense dashboard.
- Distinguish **Not started**, **In progress**, **Complete**, and a text-labelled **Past target** state. Do not infer completion from the calendar date or an elapsed work block.
- Completing a task visibly fills the project's progress indicator and updates its count. Use a brief, restrained success animation. Respect reduced-motion preferences.
- A completed project receives an unmistakable completed state, using an icon and text as well as colour.
- Show actual completion as the main indicator. Any optional planned-by-date comparison must be explicitly labelled **Planned**, so planned work cannot look completed.
- Progress measures task counts, not percentage of time worked. Duration estimates are separate.

### Progress counting rules

- Count each actionable Todoist task once, regardless of how many work blocks or views show it.
- Exclude these three explicit grouping tasks from the denominator:
  - Prepare the walls — `6hpVFvVMWCw3HFr3`.
  - Arrange the plumber — `6hpVFvhxR862pFX3`.
  - Create lesson plans for my students and year groups — `6hpVHPQr4CVpfxP3`.
- Their children count. Their displayed group status can be derived from the children; do not automatically write a parent completion to Todoist unless the existing integration already supplies and correctly handles that behaviour.
- **Update the DUA app** remains actionable even though it has a planning subtask. Do not automatically exclude every parent task.
- Initial snapshot: **78 tasks, 75 actionable steps, 11 projects**. Recalculate against live data rather than hardcoding those totals.
- Formula: completed actionable steps / all actionable steps in the selected project × 100. An empty project displays **No tasks**, not 100%.
- Include completed tasks in the denominator after completion. Fetch or retain the necessary completed records; an active-only Todoist response is insufficient for accurate progress.
- Completion outside this tab must eventually update the same progress. If history cannot be obtained, display a truthful unavailable/incomplete-data state rather than a misleading percentage.

## Today tasks

- Compute Today using the user's current local calendar date and the existing user/account ownership rules. Include incomplete tasks due today, including the current occurrence of a recurring task.
- Use the configured user timezone; the initial planning timezone is **Europe/London**.
- Query Today independently of the 11-project selection, then apply the Inbox exclusion.
- Today tasks from a selected project stay in their project lane and receive a prominent **Today** badge. Do not duplicate them in the additional Today group.
- Today tasks from other non-Inbox projects appear in a separate **Today — other projects** lane/section, carrying their original project name.
- Give Today a distinctive accent, icon and text label. It must remain distinguishable without colour.
- Do not silently treat overdue or undated tasks as due today. If the existing site has an overdue section, preserve it separately.
- Completing or starting a Today task uses the same actions and shared task state as a project task.
- A recurring task's completed occurrence should remain visibly acknowledged for today even when Todoist advances its next due date. Do not count the new occurrence as today's unfinished occurrence.
- Today is a live view, not a new Todoist project. Do not move tasks to implement it.

## Task actions and details

Each actionable task should expose:

| Action / field | Behaviour |
|---|---|
| **Start work** | Mark the task In progress in shared app persistence and emphasise its active block. Preserve Todoist due dates and completion. |
| **Complete** / checkbox | Complete the real task through the existing Todoist connection; update all views and project progress after success. |
| **Undo completion** | Reopen through the existing integration where supported. Do not claim success if unsupported or rejected. |
| **Open in Todoist** | Use a verified task URL from the integration or an established link helper. |
| Task details | Title, original project, labels, hierarchy, status, due date/time, deadline, estimates, and all planned work blocks. |
| Schedule editing | Change a work block's date/start/end and estimate, showing conflicts before saving. |

Starting work is an app workflow state, not an invented native Todoist status. It does not execute an app-building task, contact a tradesperson, or automatically start a timer. A timer is outside this feature's scope.

Preserve existing Professional/Personal labels and task descriptions. Do not repurpose labels to store hidden planning state. Display tentative visits and buyer-dependent tasks with a **Provisional** label.

## Work windows, durations and constraints

Use these agreed initial windows; store them as editable user settings:

| Window | Local time | Rule |
|---|---|---|
| Morning | 06:30–09:30 | Computer work |
| Daytime | 09:30–15:30 | Physical work, visits or computer work |
| Evening | 18:00–20:00 | Physical work or computer work; reserve the Spanish lessons |

- **20 October:** light day, no work before the current time. The seed contains 90 minutes, including Spanish.
- **26 and 29 October:** computer-only all day. No physical work, shopping trips, tip runs, teaching blocks, or visits to the house may be scheduled on these dates.
- **Downstairs toilet:** physical work on Thursday 22 and Friday 23; aim to finish Friday evening. Hold Saturday 24, 13:00–15:30, as fallback. Wednesday shopping/preparation is allowed.
- **Spanish:** Tuesday 20, Thursday 22 and Saturday 24, 18:00–18:30. These are three one-off lessons for this week, not a new indefinite recurrence.
- Work blocks must not overlap for this user, even across projects. Reserve time for supervising a visit unless explicitly marked as passive waiting.
- Support several work blocks for one task. Completing a block or reaching its end does not complete the task automatically.
- Display active time separately from elapsed drying/curing waits. A 15-minute readiness check does not mean grout cures in 15 minutes.
- Respect task order: preparation before painting; photos before listings; old grout removal before regrouting; grout readiness before resealing.
- The tip is about ten minutes away. Initial one-hour trip estimates include approximately twenty minutes of driving plus loading/unloading/queue allowance; additional loads require extra time.
- Trade bookings, quote turnaround, a car buyer, app scope, and material drying times remain uncertain. Do not show the proposed timetable as confirmed appointments or guaranteed outcomes.
- The draft contains approximately **76 active hours**. Show daily effort and spare capacity, including the heavy 9.5-hour computer day on 26 October.
- A block that exceeds a window, overlaps another block, breaks an order rule, or violates a computer-only date must produce an actionable conflict. Do not silently compress, move, or discard work.
- Project targets belong in app planning metadata. Per-task planned completion dates map to Todoist due dates only when explicitly applied. Hard deadlines remain separate.
- All task completion targets are no later than 31 October; the downstairs toilet has a tighter target. Completing a project earlier is desirable.
- Use timezone-aware local dates. This period crosses the UK clock change on 25 October 2026; do not apply a fixed UTC offset to the whole plan.

## Scheduling and Todoist write policy

1. Load and reconcile the draft against current Todoist tasks. Missing/deleted tasks are flagged, not recreated automatically. New tasks appear unscheduled.
2. Show proposed changes, including each affected task's old/new due date and time, and any deadline changes.
3. Apply only after an explicit **Apply schedule to Todoist** action. A checkbox that merely selects a task or a calendar day must never apply dates.
4. Planned task due time is its **final work block's end time**: the intended completion time. Work-block start/end times remain app planning data.
5. Preserve existing deadlines unless the user approves changing them. If requested, offer the overall 31 October cutoff separately from the tighter downstairs target; do not force an October 31 hard deadline onto every task by default.
6. Do not write the sum of split-block hours as one continuous Todoist duration. Use existing supported duration semantics only where they match; keep block estimates in the app otherwise.
7. Report per-task success/failure. Retry only failed writes. Refresh returned Todoist data and retain the draft for anything not applied.

## Integration and persistence

Before choosing files or endpoints, trace the existing navigation, Todoist read/write service, user timezone handling, caching, storage, and deployment conventions.

Use the smallest extension of those existing layers. Do not introduce a new calendar framework, queue, event bus, service, or database merely for this tab.

Minimum logical app-owned records (adapt to the existing schema):

- Project plan: user/account ID, Todoist project ID, target date, fallback date, priority, selected/hidden state.
- Task plan: user/account ID, Todoist task ID, grouping flag, local work status, provisional/dependency note.
- Work block: stable ID, Todoist task ID or buffer identity, local date, timezone, start/end, work type, estimated active minutes, note.
- User availability: work windows and computer-only date exceptions.

Store these records persistently using the site's current storage, scoped to the signed-in user. Browser memory alone is insufficient. Browser storage may hold view preferences, not authoritative completion or the only copy of the plan.

Integration requirements:

- Keep API credentials on the same trusted side of the existing integration; never embed secrets in client code or this document.
- Reuse authenticated, ownership-checked Todoist reads and mutations. Validate submitted project/task IDs against the current user's accessible data.
- Handle pagination, hierarchy, active tasks and necessary completion history.
- Reuse existing webhook/sync behaviour if present. Otherwise refresh on entry/focus, after mutations, and through a visible Refresh action, with appropriate throttling.
- Do not invent endpoint names or assume reopening, completion-history or duration support. Verify the existing adapter and current supported API before implementation.
- Share normalized task state between the timeline, Today, and other existing task views.
- Deduplicate requests and disable repeated completion submission while it is pending. An optimistic change must roll back if the API fails.
- Surface expired authentication, permission errors, rate limiting and unavailable data with a useful retry/reconnect action. Never show a failed write as completed.
- Refresh before applying a stale schedule; show conflicts when a Todoist date has changed since the preview.

## Visual and accessibility direction

- Aim for an energetic, polished extension of the current board: stronger progress graphics, decisive hierarchy and useful colour, without clutter or a redesign of the entire site.
- Make the downstairs priority, Today tasks, active work and completed work easy to identify at a glance.
- Use the site's light/dark theme, typography and spacing. Keep labels legible and contrast accessible.
- Desktop: aligned project timeline plus selected-day detail. Mobile: readable project/date summaries and stacked task details; contain any timeline scrolling within its own region.
- All task actions must work with keyboard and touch. Use native buttons/checkboxes, labelled controls, visible focus, and accessible progress values.
- Keep full task names and timings available without hover. Do not shrink the timeline until labels become unreadable.
- Include loading, empty, unscheduled, disconnected, partial-data and failed-mutation states.
- Avoid celebratory animations that block work. Respect reduced motion.

## Acceptance criteria

1. Projects Timeline is available as a real tab in the existing site, and other tabs continue to work.
2. The initial selection resolves the 11 exact project IDs and imports no duplicate Todoist tasks.
3. No Inbox task appears anywhere in the tab, even if due today.
4. A Today task from another non-Inbox project appears once in the distinctive Today group. A Today task already in a selected project appears once with a Today badge.
5. All 78 seed tasks are inspectable; the initial progress denominator is 75 after the three explicit grouping exclusions. Totals change correctly when live data changes.
6. Completing a task writes to Todoist, updates all occurrences of the task, and increments the relevant project's actual progress. Refreshing does not lose completion.
7. A failed completion rolls back and shows an error. Repeated clicks do not submit duplicate mutations.
8. Start work persists the In progress state across refreshes without claiming Todoist-native support or marking the task completed.
9. Multiple blocks belong to one task; the task counts once and is not automatically completed when a block ends.
10. Selecting a date shows chronological blocks with start/end times, durations, work type and original project. Selecting a project reveals every task and work block.
11. The downstairs physical plan targets 22–23 October, with the 24 October fallback visible. No physical blocks or house visits appear on 26 or 29 October.
12. The three Spanish lessons appear only on 20, 22 and 24 October at 18:00–18:30.
13. The seed has no overlapping active blocks, fits the agreed windows, and distinguishes passive waits from effort. Edits that violate constraints show conflicts.
14. Today is correct across midnight, and October 25's timezone change does not shift local work times.
15. A recurring Today task is handled by occurrence; completing it does not immediately produce a duplicate unfinished task for today.
16. Actual project progress remains correct after completion outside this tab; active-only task counts never masquerade as complete history.
17. Draft scheduling cannot mutate Todoist dates until the user applies a reviewed preview. Partial application reports exactly which writes failed.
18. The feature works in the site's supported desktop/mobile layouts, light/dark modes, with keyboard controls and reduced motion.

## Implementation handoff

Implement and validate in the existing repository. Start by locating the current task board and Todoist integration, then identify the smallest set of changes needed. Follow repository instructions and the site's established staging/release process. This document is a build specification, not permission to bypass those release rules.

Use focused tests for counting/deduplication, Inbox exclusion, recurrence, schedule conflicts, timezone boundaries, and Todoist mutation success/failure. Verify the complete user journey with a real connected account or the repository's established integration test setup. Return a concise implementation summary and any unresolved API or scope limitations.

The appendix below is a self-contained planning seed. Its task IDs link to the existing Todoist tasks. Its times are estimates and remain a draft.

## Appendix A — initial task and work-block seed

All dates are October 2026 in Europe/London. One task may have multiple blocks. Group rows summarize children and do not add effort. The API should supply current titles and completion state; the snapshot below documents the intended initial plan.

### Downstairs toilet

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Decide on a paint colour<br>`6hpVFvV55Fgf7443` | 20 Oct 10:30–10:45 (Computer) | 15m |
| Gather all decorating equipment<br>`6hpVFvQQjQRFfPf3` | 21 Oct 10:30–11:00 (In person) | 30m |
| Move the little cabinet upstairs<br>`6hpVFvWHFX2vC56V` | 22 Oct 09:30–09:45 (In person) | 15m |
| Prepare the walls<br>`6hpVFvVMWCw3HFr3` | Group target: 22 Oct, 13:45 | Group — no extra effort |
| Get a sander<br>`6hpVFwMG8WgvCx8V` | 21 Oct 10:10–10:30 (In person) | 20m |
| Fill holes and cracks in the walls<br>`6hpVFwHH3XM9j7xV` | 22 Oct 09:45–10:30 (In person) | 45m |
| Sand down the walls<br>`6hpVFwHJhxPgRH7V` | 22 Oct 12:45–13:45 (In person) | 1h |
| Paint the walls<br>`6hpVFvV7hhgVV6cV` | 22 Oct 14:00–15:30 (In person)<br>23 Oct 09:30–10:30 (In person) | 2h 30m |
| Allow the paint to dry<br>`6hpVFvf2Qmh88HfV` | 23 Oct 13:45–14:00 (In person) | 15m |
| Buy a new sink<br>`6hpVFvg9WHWGfjqV` | 21 Oct 09:30–10:10 (In person) | 40m |
| Buy new paintings for the downstairs toilet<br>`6hpVFvgWgx68V993` | 21 Oct 11:00–11:20 (In person) | 20m |
| Buy a toilet roll holder<br>`6hpVFvmP3GQVR7WV` | 21 Oct 11:20–11:30 (In person) | 10m |
| Buy a towel holder<br>`6hpVFvh7MgPw9CgV` | 21 Oct 11:30–11:40 (In person) | 10m |
| Arrange the plumber<br>`6hpVFvhxR862pFX3` | Group target: 23 Oct, 15:30 | Group — no extra effort |
| Find a plumber<br>`6hpVFwJ6rPHP8MC3` | 21 Oct 06:30–06:40 (Computer) | 10m |
| Get plumbing quotes<br>`6hpVFwM3WggCjFmV` | 21 Oct 06:40–07:00 (Computer) | 20m |
| Choose a plumber and book a day<br>`6hpVFwMMfHV2M4pV` | 21 Oct 09:10–09:25 (Computer) | 15m |
| Have the plumber carry out the work<br>`6hpVFwP6HVQQWgc3` | 23 Oct 14:00–15:30 (Visit) | 1h 30m |
| Fit the cabinet<br>`6hpVFvr2pVHx8H83` | 23 Oct 18:00–19:30 (In person) | 1h 30m |

### Piano

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Get piano removal quote 1<br>`6hpVG84j556xRJ6W` | 21 Oct 07:00–07:10 (Computer) | 10m |
| Get piano removal quote 2<br>`6hpVG856mjP2jQhW` | 21 Oct 07:10–07:20 (Computer) | 10m |
| Get piano removal quote 3<br>`6hpVG86vwFjHxXrW` | 21 Oct 07:20–07:30 (Computer) | 10m |
| Get the piano out of the room<br>`6hpVG878Rcj4XVPW` | 28 Oct 13:00–14:00 (Visit) | 1h |

### Patio doors

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Find locksmiths who repair patio doors<br>`6hpVGFPp842vx4xr` | 21 Oct 07:30–07:40 (Computer) | 10m |
| Get patio door repair quote 1<br>`6hpVGFQMPJv2hfvr` | 21 Oct 07:40–07:50 (Computer) | 10m |
| Get patio door repair quote 2<br>`6hpVGFW3XxPvP7Gr` | 21 Oct 07:50–08:00 (Computer) | 10m |
| Get patio door repair quote 3<br>`6hpVGFWf9Xm3QGXJ` | 21 Oct 08:00–08:10 (Computer) | 10m |
| Choose a locksmith and agree a price<br>`6hpVGFgqG625gQ3J` | 22 Oct 09:00–09:15 (Computer) | 15m |
| Book the locksmith to come in<br>`6hpVGFqfxF5qRvpJ` | 22 Oct 09:15–09:30 (Computer) | 15m |
| Have the patio door repaired<br>`6hpVGFp6W2Mwx74J` | 28 Oct 14:00–15:30 (Visit) | 1h 30m |

### Top bathroom

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Watch YouTube videos on regrouting and resealing a bathroom<br>`6hpVGWpvvPrJQHVx` | 20 Oct 10:45–11:15 (Computer) | 30m |
| Make a list of the equipment and materials needed<br>`6hpVGWqMRhG257Vx` | 20 Oct 11:15–11:30 (Computer) | 15m |
| Buy the equipment and materials<br>`6hpVGWrcWvVhR2QQ` | 21 Oct 12:00–12:30 (In person) | 30m |
| Remove the old sealant<br>`6hpVGWrXFW86m2MQ` | 27 Oct 09:30–10:30 (In person) | 1h |
| Remove the old grout<br>`6hpVGWxfPQ4hVrCQ` | 27 Oct 10:30–12:30 (In person) | 2h |
| Clean and prepare the surfaces<br>`6hpVGX23fWg6m5cx` | 27 Oct 13:00–13:30 (In person) | 30m |
| Regrout the bathroom<br>`6hpVGWxxQP66gPRx` | 27 Oct 13:30–15:30 (In person) | 2h |
| Allow the grout to cure according to the product instructions<br>`6hpVGX5hm65CM3GQ` | 30 Oct 12:45–13:00 (In person) | 15m |
| Reseal the bathroom<br>`6hpVGX4grGp6Pf2Q` | 30 Oct 13:00–14:00 (In person) | 1h |
| Allow the sealant to cure before using the bathroom<br>`6hpVGX3qmRP9pFcQ` | 31 Oct 14:00–14:15 (In person) | 15m |

### Catch up with the budget

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Download expenses from the last two and a half weeks<br>`6hpVGjxrwvPQc89f` | 24 Oct 06:30–06:45 (Computer) | 15m |
| Print the expenses<br>`6hpVGm3hXH63xR37` | 24 Oct 10:00–10:15 (In person) | 15m |
| Label the expenses<br>`6hpVGm6xmqwXPQM7` | 24 Oct 18:30–19:15 (In person) | 45m |
| Ask Codex to upload the labelled expenses<br>`6hpVGm6v8HGr3RVf` | 26 Oct 08:30–09:00 (Computer) | 30m |

### Sell the car

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Find someone who can clean the car interior<br>`6hpVHPMj3VwG7mxx` | 21 Oct 08:10–08:20 (Computer) | 10m |
| Get quotes for cleaning the car interior<br>`6hpVHPMpH3p8vxMQ` | 21 Oct 08:20–08:40 (Computer) | 20m |
| Gather all documentation for the Kia<br>`6hpVHPQj6cGHqV6Q` | 24 Oct 09:30–10:00 (In person) | 30m |
| Have the car cleaned<br>`6hpVHPWpc4jXVwhQ` | 24 Oct 10:15–12:15 (Visit) | 2h |
| Take photos of the car<br>`6hpVHPcVWmq6c7QQ` | 24 Oct 12:15–12:45 (In person) | 30m |
| List the car on AutoTrader<br>`6hpVHPXF5QR5VmMx` | 25 Oct 06:30–07:00 (Computer) | 30m |
| List the car on Facebook<br>`6hpVHPfGCv6HxWXQ` | 25 Oct 07:00–07:20 (Computer) | 20m |
| Sell the car<br>`6hpVHPfPqj4CmWpQ` | 31 Oct 10:00–11:00 (In person) | 1h |

### Half-term work project

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Update the DUA app<br>`6hpVHPPfqR6pGFR3` | 24 Oct 06:45–09:30 (Computer)<br>26 Oct 09:30–12:00 (Computer)<br>26 Oct 12:45–14:15 (Computer) | 6h 45m |
| List all the updates and tasks I want for the DUA app<br>`6hpVHQ89W2797M73` | 22 Oct 06:30–07:00 (Computer) | 30m |
| Upload the morning meeting slides<br>`6hpVHPMQVqC3fPgV` | 22 Oct 07:30–08:00 (Computer) | 30m |
| Create lesson plans for my students and year groups<br>`6hpVHPQr4CVpfxP3` | Group target: 29 Oct, 10:30 | Group — no extra effort |
| Identify the students and year groups needing lesson plans<br>`6hpVHQ85XH9CmgmV` | 22 Oct 07:00–07:30 (Computer) | 30m |
| Write lesson plans for each year group<br>`6hpVHQ9MXwwwWcJ3` | 29 Oct 06:30–09:30 (Computer)<br>29 Oct 09:30–10:30 (Computer) | 4h |
| Fix the intervention planning app so it is ready to use<br>`6hpVHPWfXCQ8Q6j3` | 26 Oct 14:15–15:30 (Computer)<br>26 Oct 18:00–19:45 (Computer) | 3h |
| Take risk with Robin?<br>`6hpVHPcpmrC3756V` | 29 Oct 18:00–18:15 (Computer) | 15m |
| Recreate the revision app<br>`6hpVHPXXMF3hgRPV` | 29 Oct 10:30–12:00 (Computer)<br>29 Oct 12:45–15:30 (Computer)<br>30 Oct 06:30–08:15 (Computer) | 6h |

### Setup Kindstack

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Create my Kindstack site<br>`6hVP696FQFJJHJ7X` | 23 Oct 06:30–09:30 (Computer)<br>26 Oct 06:30–08:30 (Computer) | 5h |
| Agree on an overall plan for Kindstack<br>`6hpVHhVJjJ88Xv4f` | 22 Oct 08:00–09:00 (Computer) | 1h |
| Create a content strategy<br>`6hpVHhXR6FRC3fff` | 27 Oct 06:30–07:30 (Computer) | 1h |
| Create a business timeline<br>`6hpVHhXRqXgXx9H7` | 27 Oct 07:30–08:15 (Computer) | 45m |

### Personal life project

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Adapt my ideal week<br>`6hpVHhWJxMV8QgCq` | 27 Oct 08:15–09:30 (Computer) | 1h 15m |
| Fit my projects into my ideal week<br>`6hpVHhVRH9prr68H` | 30 Oct 08:15–09:30 (Computer) | 1h 15m |

### Converting the Shed

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Empty the cellar<br>`6hpVP7FfM4qwR79M` | 25 Oct 09:30–11:30 (In person) | 2h |
| Take rubbish from the cellar to the tip<br>`6hpVP7McR2j5Gq6v` | 25 Oct 11:30–12:30 (In person) | 1h |
| Empty the sheds<br>`6hpVP7JVFqQgG84v` | 25 Oct 13:00–15:30 (In person) | 2h 30m |
| Take rubbish from the sheds to the tip<br>`6hpVP7HHPrXXG7vM` | 28 Oct 09:30–10:30 (In person) | 1h |
| Move items to keep from the sheds into the cellar<br>`6hpVP7P49PRwCVhM` | 28 Oct 10:30–12:00 (In person) | 1h 30m |
| List unwanted items on Facebook for free<br>`6hpVP7PXJRgFJJXM` | 25 Oct 18:00–18:20 (In person)<br>28 Oct 06:30–07:00 (Computer) | 50m |
| List approximately 12 items for sale on Facebook<br>`6hpVP7QjP7rqWGgM` | 25 Oct 18:20–19:00 (In person)<br>28 Oct 07:00–09:30 (Computer) | 3h 10m |
| Buy a portable light<br>`6hpVP7RqCRqCRx5M` | 21 Oct 11:40–12:00 (In person) | 20m |

### Teaching my daughter Spanish — this week

| Task / existing Todoist ID | Draft work blocks | Active estimate |
|---|---|---|
| Teach my daughter Spanish — Tuesday 20 October<br>`6hpVPrjQcCjx69W5` | 20 Oct 18:00–18:30 (Teaching) | 30m |
| Teach my daughter Spanish — Thursday 22 October<br>`6hpVPrjgXxG5C2p5` | 22 Oct 18:00–18:30 (Teaching) | 30m |
| Teach my daughter Spanish — Saturday 24 October<br>`6hpVPrgpfMwFHPhX` | 24 Oct 18:00–18:30 (Teaching) | 30m |

## Appendix B — reserved buffers and waits

| Date | Time | Reservation |
|---|---|---|
| 21 Oct 2026 | 13:00–14:00 | Quote replies / booking follow-up |
| 22 Oct 2026 | 10:30–12:45 | Filler drying + break |
| 24 Oct 2026 | 13:00–15:30 | Downstairs toilet fallback |
| 30 Oct 2026 | 09:30–12:00 | Catch-up / collections buffer |
| 31 Oct 2026 | 09:30–10:00 | Final project checks |
| 31 Oct 2026 | 11:00–13:00 | Final catch-up buffer |

Unallocated time is available time, not a requirement to fill every window. Buffer blocks do not count toward task progress or the 76 active-hour estimate.
