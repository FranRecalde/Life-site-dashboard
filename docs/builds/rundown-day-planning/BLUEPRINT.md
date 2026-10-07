# Technical blueprint
## Existing foundation
App owns filtered context tasks, authenticated ApiClient, refresh, task editor overlay and completion confirmation. DailyRundown renders shared checklist rows. TodoistTaskEditor already edits date/title/description/priority/project and shows comments and nested subtasks.
## Proposed design
DailyRundown owns selected local date, Upcoming toggle and add draft. App passes active-context tasks and generation-guarded create/refresh callback. rundownTasks selects active top-level dated tasks. Reuse overlays without duplicating editing.
## Decisions and assumptions
Use native date input and local noon arithmetic for DST-safe next/previous. Today includes overdue; future/past days exact date. Existing Todoist server routes own persistence. No credential modifications.
## Verification plan
npm run lint; node --import tsx --test src/components/dailyWorkflow.test.ts; npm test; npm run build; git diff --check. Browser fixtures on localhost:3000 test navigation, creation payload, failure/retry, details/comments/subtasks, completion and mobile/offline. Read live page for connection state; no real task mutations during tests.
## Delivery environment
http://localhost:3000, running existing local Express/Vite process.
## Material risks and recovery
Existing saved Todoist credential may be unauthorized. Real sync requires a valid connection in Settings. No deployment performed.
