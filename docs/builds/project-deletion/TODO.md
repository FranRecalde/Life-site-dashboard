# Project deletion milestones

- [x] Inspect existing integration and instructions; populate scope and design.
- [x] Implement delete route, Todoist adapter, cleanup, confirmation and fixture.
- [x] Verify local regressions and browser workflow.
- [x] Prepare localhost review with verification limitations.
- [ ] Verify deletion against an explicitly approved disposable real Todoist project.
- [ ] Production release (requires user review and explicit approval).

## Amber action log
- 2026-10-26: Authorized feature implementation on existing dirty workspace; preserved unrelated changes. Added authenticated timeline deletion route, Todoist DELETE adapter, permanent-deletion confirmation, and related schedule cleanup. No production actions.
- Saved deletion task ownership before remote deletion so cleanup can recover after storage failure or a lost response, including tasks added after the seed. Inbox and parent projects with subprojects are protected.
- Extended isolated preview using data/project-deletion-verification; no real credentials or external calls. Restored completed Piano fixture after browser deletion so the user can review it.

## Verification evidence
| Check | Actual result | Status |
| --- | --- | --- |
| npm run test:timeline | 14 tests pass; guards, completed project, remote failure, connection failure, pre-delete storage failure, post-delete cleanup retry, dynamic tasks, stale preview, unrelated-state preservation | Pass |
| npm run lint | tsc --noEmit exits 0 | Pass |
| npm test | 201 tests pass, including reading pipeline regressions | Pass |
| npm run build | Vite and server bundle pass; existing large-chunk warning remains | Pass |
| Browser: Cancel and Escape | Dialog closes; Piano stays present | Pass |
| Browser: controlled failure | Error stays inside confirmation; no project removed | Pass |
| Browser: retry | Completed Piano removed; success notice visible | Pass |
| Browser: reload | Piano absent, other project retained, 10 projects remain | Pass |
| Review environment | http://127.0.0.1:3100/?view=projects-timeline; fixture restored to 11 projects, Piano 100%, dialog open | Pass |
| Real Todoist deletion | Adapter implemented; deliberately not executed against real account. Fixture does not prove real integration success. | Not run |
| Production release | No push or deployment performed | Not run |

## Review artifact
.codex-output/project-deletion-review.png shows the named permanent-deletion confirmation on localhost. Browser preview kept open for user review. Run npm run preview:timeline to restart if needed.

## Limitations
Every project means the Projects Timeline from the supplied screenshot; project deletion is also available in its planning settings for deselected projects. Existing general Todoist panels refresh through the dashboard after deletion; they do not gain new delete controls. Projects containing subprojects require moving/deleting those in Todoist first to avoid an implicit cascade. Production release authorized by the user on 2026-10-26. Real-project deletion is not part of deployment verification.


## Release preparation (2026-10-26)
- User explicitly requested live production release after localhost review.
- Prepared codex/project-deletion from origin/main 1f312dd, carrying only the deletion feature. Preserved timeline add-project controls, day/week/month views and drag behavior from main; original dirty workspace untouched.
- Clean install, lint, build and 206 tests pass on the integrated source. npm ci reports 12 pre-existing dependency advisories; no dependency changes in this feature.
- Read-only Cloud Run preflight: staging 00022-vhf and production 00005-srw healthy/ready; all 20 secret-resource policies match expected scoped access; database addresses, runtime identities and secret prefixes remain separate. Only conditional database-user project grants exist for the two runtime identities; no project-level secret grants found.
- No production data deletion or infrastructure/secrets/auth changes authorized by the release itself.
