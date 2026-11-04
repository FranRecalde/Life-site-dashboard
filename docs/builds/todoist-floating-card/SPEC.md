# Product specification

## Outcome
A private task companion in both existing Life Site layouts, usable alongside other desktop apps without installation.

## Essential user journey
Sign into the existing single-user site; connect Todoist in Settings → Connections; open My tasks; select Today + overdue or Inbox; click Float my tasks. Complete tasks or open Todoist for more. Return to tab closes the floating card. Refresh and resume reconcile external changes.

## Scope
- R1: Reuse existing server-only Todoist token, authentication, connect/disconnect settings and API v1 completion.
- R2: Today/overdue and Inbox selection shared between the normal panel and Document Picture-in-Picture portal; task title, checkbox, due date/time, project and task links.
- R3: One user-triggered floating window initially 340 × 440; native move/resize; cleanup on close, logout and navigation; useful unsupported/blocked fallback.
- R4: Failed completion retains the task with its error. Prevent duplicate clicks, refresh after mutations/focus, poll about once a minute with capped retry backoff.
- R5: Loading, disconnected, empty, expired-session and error states; long titles and narrow windows; browser timezone for date boundaries.

## Out of scope
Task creation/editing, notifications, advanced filters, new OAuth integration, automatic startup/placement, desktop transparency and changing PiP always-on-top. Browser APIs cannot supply the last two controls; Return to tab provides a way to put the card away.

## Constraints and defaults
No production changes or real Todoist mutations for verification. Preserve unrelated checkout changes. No dependencies added. Existing integration belongs to the sole configured site login; this is not a multi-user service. Browser timezone follows the computer the user is working on. View choice lasts for the current signed-in component session.

## Acceptance criteria
| ID | Observable result | Proof |
| --- | --- | --- |
| AC1 | Card endpoint requires existing session; access token stays server-only; connection uses existing controls. | Route tests, integration inspection; signed-in real-account check remains required. |
| AC2 | Today includes overdue, Inbox includes undated/future tasks, dates follow browser timezone. | Model tests and browser fixture. |
| AC3 | Completion reconciles both views and recurring tasks advance; failures retain task and error. | Browser fixture; real Todoist write remains required. |
| AC4 | Card remains visible over another app, closes/reopens once, shares selection. | Real Windows Chrome browser. |
| AC5 | Empty/disconnected/errors/session expiry, narrow layouts and unsupported/blocked floating retain useful feedback. | Browser fixture and focused tests; managed-school policy check remains required. |

## Definition of done
Implementation and local checks pass. Live account, school policy and deployment acceptance stay explicitly open until verified. Mocked data does not prove live account integration.
