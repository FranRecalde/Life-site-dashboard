# Technical blueprint
## Existing foundation
React 19 / TypeScript / Tailwind / Express. CalendarPanel currently has a truncated weekly summary. EntranceHallDashboard has decorative completion circles. App owns completion state, confirmations, and refresh. TodoistTaskEditor is shared by dashboard and task workspace. Existing Todoist pagination helper supports the comments read endpoint.
## Proposed design
Add calendar date helpers and a 24-hour weekly grid with native scroll and bounded row-height zoom. Reuse task state in a small shared TaskChecklistRow. Add DailyRundown using active-context due/overdue tasks; reuse existing completion handler and confirmations. Pass full tasks through AppOverlays to task editor for subtask navigation. Fetch paginated comments through an authenticated GET endpoint and ApiClient.
## Decisions and assumptions
- No dependencies or persisted schema changes.
- Rundown uses existing Todoist tasks rather than an independent checklist.
- Week respects firstDayOfWeek and selected calendar date; events use local dates and midnight boundaries.
- Read comments through Todoist API v1 GET /comments?task_id=... (https://developer.todoist.com/api/v1/).
## Verification plan
`npm run lint`, `npm test`, `npm run build`, focused `node --import tsx --test src/components/dailyWorkflow.test.ts`.
Browser exercise on local Vite with isolated mocked API data: calendar grid/zoom, Google link, dashboard completion, daily tab, subtasks and long comments, error/retry, mobile navigation. Mocked UI checks do not prove live Todoist/Google access.
## Delivery environment
Local working tree; run PowerShell `$env:SECRET_PROVIDER='existing'; $env:STORAGE_PROVIDER='local'; npx tsx server.ts` using existing local configuration. No release authorized.
## Material risks and recovery
Completing parents also completes children: preserve existing confirmation. Feature edits can be reverted independently of unrelated user work. Live external mutations are excluded from verification.
