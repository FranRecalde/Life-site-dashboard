# Product specification
## Outcome
Make the weekly schedule fully visible and daily tasks actionable from the dashboard and a dedicated Rundown of the Day tab.
## Essential user journey
Open the weekly calendar, inspect all hours and events, adjust zoom, or open Google Calendar. Tick a dashboard task or open its details to inspect subtasks and full comments. Open the daily rundown to complete today's and overdue Todoist items.
## Scope
- R1: Weekly calendar covers 00:00–24:00 with hourly labels, all-day events, every timed event, and zoom controls.
- R2: View on Google Calendar opens the displayed date/view in a new tab.
- R3: Desktop and mobile navigation include Rundown of the Day with a daily checklist.
- R4: Dashboard tasks have separate accessible completion and details controls, with pending/error feedback.
- R5: Task details show subtasks and complete comment text, including loading, empty, error and retry states.
### Out of scope
Deployment, production changes, new credentials, unrelated calendar month redesign, independent checklist storage, comment editing.
## Behavior and quality
Reuse Todoist completion and existing parent-completion confirmation. Disable completion offline or pending. Comments are fetched only for an opened task; preserve line breaks and wrap long text. Show unavailable integration feedback without pretending an empty result.
## Constraints and defaults
Assumption: daily to-dos are today's and overdue Todoist tasks, using the active personal/professional context; no second task store. Subtasks use the full dashboard task snapshot so unlabeled children remain visible. Existing integration/authentication stays in place. No production data is changed during checks.
## Acceptance criteria
| ID | Requirement | Expected result | Verification |
| --- | --- | --- | --- |
| AC1 | R1 | Weekly grid includes all 24 hours, Sunday belongs to correct week, no three-event limit; zoom changes row size. | Unit and browser checks |
| AC2 | R2 | Link opens Google Calendar for current date and view. | Browser check |
| AC3 | R3 | Desktop/mobile tab opens checklist with due/overdue tasks; checking invokes existing completion flow. | Browser check |
| AC4 | R4 | Dashboard completion does not open details; pending and failures are visible. | Browser check |
| AC5 | R5 | Opening task shows child hierarchy and complete comments; errors offer retry. | Unit and browser checks |
## Definition of done
Implementation and applicable checks pass; record real integration limitations separately from mocked UI verification. Deliver locally for one consolidated review.
