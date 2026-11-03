# Connections credential safety

Amber action log, 2026-11-03. Scope: local implementation and pull request; no deployment or production secret changes.

- Disable browser autocomplete hints for every credential field and the credentials form.
- Validate nonblank Google client IDs in the browser and server before persistence. Reject malformed values with a clear error; trim accepted IDs. Blank/omitted IDs preserve the existing value when saving other credentials.
- Return only the first 12 characters of the saved server-side client ID as `googleClientIdPrefix` and display `Saved ID: 397169406918…`. No client secret, refresh token, or full ID is included in the summary.
- Display Token saved / No token saved rather than claiming the Google connection has been tested.
- Add focused validation, summary-redaction, and rendered-component tests to the normal test command.

Repository isolation:

- Original folder: `C:/Users/Admin/Documents/Codex/2026-07-17/life-site-dashboard-fresh`.
- Clean worktree: `C:/Users/Admin/.codex/worktrees/settings-credential-safety/life-site-dashboard-fresh`.
- Branch: `codex/settings-credential-safety`, created from freshly fetched `origin/main` at `40996c665898455645d492c18290b8d83007ace1`.
- GitHub reports PR #12 already merged into main. This change adds no reading-queue changes, nor any unrelated dirty-tree changes.

Verification commands (results recorded before commit):

- Pass: `npm.cmd test` — 211 passed, 0 failed.
- Pass: `npm.cmd run lint` — TypeScript checking passed.
- Pass: `npm.cmd run build` — frontend and server built; Vite reports a JavaScript chunk larger than 500 kB.
- Pass: `git diff --check`; scoped diff contains no reading-queue or unrelated working-tree changes.
- Prior local browser fixture: the actual settings component blocked Francisco with the explicit validation text and accepted a valid ID with outer whitespace. It used dummy data and a stub submit handler, not production persistence.

Unverified: live Google authorization, deployed authenticated persistence, and whether each browser/password manager honors autocomplete hints. Process-local credential-cache refresh behavior remains unchanged.

Production touched: n. No deploy, merge, credentials, or infrastructure mutations authorized or performed.
