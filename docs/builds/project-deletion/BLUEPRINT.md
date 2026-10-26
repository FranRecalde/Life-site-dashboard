# Technical blueprint

## Existing foundation
React ProjectsTimeline, native dialog, ApiClient and authenticated Express timeline router. Settings store holds per-owner TimelinePlan. Todoist API v1 is accessed by existing server credentials. Existing localhost:3100 harness uses isolated files and simulated Todoist data.

## Smallest design
DELETE /api/timeline/projects/:id under existing auth and exclusive mutation queue. Validate plan membership, revision and exact confirmName; fresh Todoist read, protect Inbox and child projects, issue DELETE /api/v1/projects/{id}. Filter plan project and related blocks/started/occurrences, discard stale preview, increment revision. Persist deletionTaskIds before the remote write to retain ownership of tasks added after the seed across cleanup retries. Remote errors preserve visible local project data. Absent remote project allows cleanup retry; failed cleanup returns explicit partial-success error. Seed task IDs retain cleanup coverage when completed history is missing.

Native confirmation dialog states permanent deletion of all project tasks and completed tasks. Buttons disabled while pending; success refreshes timeline and dashboard. Delete control is a sibling of project expand button to avoid nested interactive elements. Planning settings also expose deletion for deselected projects.

## Verification
npm run test:timeline
npm run lint
npm test
npm run build
npm run preview:timeline (Windows: invoke node_modules/.bin/tsx.cmd scripts/previewProjectsTimeline.ts)
Browser: cancel/Escape, failed delete, retry, completed-project deletion, reload, unrelated project preservation, narrow viewport.

## Risks and recovery
Cross-service writes cannot be atomic; remote-first ordering prevents hiding a project whose deletion failed. If remote deletion succeeds but local save fails, retry removes stale schedule without another destructive write. Real deletion is permanent; no live data will be changed before explicit approval. No new dependencies, secrets, auth or infrastructure changes.

## API reference
Todoist official API v1: https://developer.todoist.com/api/v1/#tag/Projects/operation/delete_project_api_v1_projects__project_id__delete (DELETE /api/v1/projects/{project_id}).
