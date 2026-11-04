# Build milestones

## 1. Establish build contract
- [x] Inspect instructions, existing authentication, API integration and layouts.
- [x] Verify official Todoist API v1 and Document PiP documentation.
- [x] Populate SPEC and BLUEPRINT from brief and repository evidence.

## 2. Implement essential workflow
- [x] Authenticated lightweight task/project endpoint reusing server credentials.
- [x] Shared normal/floating card, Today/Inbox selection, links, completion, failure retention.
- [x] Runtime support checks, user-gesture opening, close/logout cleanup, refresh/backoff.
- [x] Reuse existing connect/disconnect settings and sole-user token association.

## 3. Verify and hand over
- [x] Focused model/route tests: 3 passed.
- [x] npm test: 206 passed.
- [x] npm run lint: passed after adding Vite client type declaration.
- [x] npm run build: passed; existing large frontend chunk warning.
- [x] Real Windows Chrome: native floating window opens at requested size; long title wraps; Today/Inbox share state; recurring fixture completion advances; visible above maximized Notepad.
- [x] Real Chrome Return to tab closes; reopen produces one native window with current tasks.
- [x] Completion failure retains task/error and reenables checkbox (fixture). Empty and disconnected feedback observed.
- [x] Browser checks for simulated unsupported API and blocked request show useful fallback. Read-error feedback/recovery observed.
- [x] 320 × 440 viewport: panel is 296 px wide, no horizontal document overflow; task list scrolls.
- [x] Expired session removes panel; real Chrome floating window closes and is absent from native window inventory.
- [x] Screenshot: .codex-output/todoist-floating-card/floating-card.png (test data).
- [ ] Actual policy restriction on managed school computer (simulation is not policy proof).
- [ ] Real connected account reads/writes and connect/disconnect round trip.
- [ ] Managed school computer policy compatibility.
- [ ] Clean merged source and staging/approved production release.

## Amber action log and assumptions
- Added normal feature code only, no dependencies, production mutations, cloud config, secrets, rules or migrations.
- Added synchronous shared App completion lock to prevent same-event duplicate submissions.
- Added connection-change event to existing API client so both panels clear/reload immediately after a connection update.
- Existing one-login, server-only token integration retained instead of adding duplicate OAuth.
- Extensive pre-existing dirty files preserved; new package script added without replacing existing scripts.

## Blockers and remaining work
Live Todoist verification requires the signed-in site and a disposable real task; fixture behavior does not prove it. Managed school computer unavailable. Production forbidden without explicit approval; existing safe release process also requires clean merged main, which this checkout is not.

## Review and setup
Safe running preview: http://localhost:3106/__card. Start with `npx tsx scripts/previewTodoistCard.ts` if stopped. It uses clearly labelled fixture data and never accesses a real Todoist account. Actual website: sign in, Settings → Connections to connect/disconnect existing token, My tasks → Today + overdue or Inbox → Float my tasks. Return to tab puts it away; keep opener tab open.

No OAuth registration/callback/scopes required for this retained integration. Existing hosted server secret and HTTPS are required; no secret values or cloud configuration inspected/changed. Real account read/write and connection round trip not run, rather than assumed passing. Actual unsupported engine/policy and managed school behavior remain unverified beyond simulation.
