# Project deletion

## Outcome and essential journey
Every Projects Timeline project offers Delete project beside its status. User confirms the named project; the app deletes it in Todoist and removes the saved timeline project, tasks, blocks and acknowledgements. It stays removed on reload.

## Required scope
- R1: Delete available for active and completed timeline projects, including deselected projects through planning settings.
- R2: Explicit permanent-deletion confirmation; Cancel and Escape leave data unchanged; pending actions prevent duplicate submissions.
- R3: Todoist deletion must succeed before local removal. Show failures and permit safe retry, including a failed local save after remote deletion.
- R4: Reuse authentication, validate membership, confirmation and revision; protect Inbox and projects containing subprojects.

## Constraints and assumptions
User requested localhost review before approving production. No deployment, production writes, or real-project deletion during verification. Assumption: every project refers to the Projects Timeline shown in the supplied screenshot. General Todoist project panels reflect removal on refresh through existing dashboard reload. Use an isolated fixture for destructive browser tests; disclose that real Todoist deletion remains unverified.

## Acceptance criteria
- AC1: Each timeline project has a named accessible delete button; cancel makes no request.
- AC2: Confirm removes the project and related local state; reload retains removal and unrelated projects.
- AC3: Failed remote deletion keeps project and schedule; retry works. Local-save failure reports partial success and retries cleanup.
- AC4: Foreign project, Inbox, subprojects, stale revision or incorrect confirmation cannot delete.
- AC5: Typecheck, timeline tests, full suite and build pass; browser verifies local workflow.
- AC6: Real Todoist integration verification requires an explicitly approved disposable live project; not covered by fixtures.

## Out of scope
Production release, bulk deletion, undo/trash, replacing Todoist integration, deleting subprojects implicitly.
