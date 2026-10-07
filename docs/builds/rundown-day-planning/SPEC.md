# Product specification
## Outcome
Plan daily Todoist work directly from Rundown of the Day on localhost.
## Essential user journey
Choose a day using previous/next, Today or date input; view upcoming work; add a task due on the selected day; open tasks to edit or reschedule and read comments/subtasks; complete using existing confirmation flow.
## Scope
R1: Day navigation and upcoming dated tasks across projects, respecting context.
R2: Add title, description, priority and context through existing Todoist create API.
R3: Existing task details, comments, subtasks, editing and completion remain available.
## Behavior and quality
Today includes overdue active top-level tasks. Other days show exact due dates; Upcoming includes selected date onward, sorted by due date. Failed saves retain drafts and show feedback. Offline saves disabled. Native accessible controls and responsive layout.
## Constraints and defaults
Assumption: reuse top-level Today list rules; children remain in task details. Upcoming excludes undated tasks. No production deployment, credential changes, new dependencies or data model. Comments are read-only as in existing editor; no new comment/subtask creation API requested explicitly.
## Acceptance criteria
AC1: Previous/next/date/Today and Upcoming show correct tasks including non-Inbox projects.
AC2: Add posts selected due date, context, description and priority; refresh displays created task; failure retains draft.
AC3: Task detail opens comments/subtasks; edit and completion use existing API handlers.
AC4: Mobile controls usable; offline saving blocked; localhost serves changes.
## Definition of done
Applicable checks and isolated browser workflows pass; live integration verification reported separately. Todoist authorization failure may block real sync.
