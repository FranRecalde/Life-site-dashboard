# Life Site Dashboard

Private dashboard. One user, one Windows machine, low volume, low failure
cost. Build for that, not for production scale.

## Commands
- Scoped tests, reading pipeline: `npm run test:reading`
- Full suite: `npm test` (once, before merge, never after each step)
- Lint and build before merge

## Reading capture pipeline
- The Windows Reading bridge has no authentication by design. It runs as the logged-in user on one private machine and relies on Windows file permissions and Application Default Credentials. Do not propose tokens, endpoints, or extra auth layers for it.
- A read-only session must never commit, push, stage, or create a branch. If it finds a needed change, it stops and reports it.
- Any PR touching the Reading Capture pipeline must report the full `npm.cmd test` count, not the `npm run test:reading` subset.
- `package.json` lists every test file individually. A new test file omitted from that list never runs even when the suite passes; any PR adding one must add it and confirm the suite count increased.

## Risk tiers

GREEN: UI, styling, copy, docs.
- Just do it. Test only changed files.

AMBER: business logic, new routes, state shape with no live data at risk,
and any change that REMOVES complexity while keeping the same guarantees.
- One paragraph of intent first. Scoped tests only.
- When removing something, state in one line what guarantee it protected
  and what protects it now.

RED: adding or weakening authentication, permissions or write paths;
migrating live data; anything touching the Obsidian append path.
- Plan of 300 words or less, no code. Wait for my go ahead.
- Scoped tests plus anything reading the same data. Full suite once
  before merge.
- Ceiling 25,000 tokens. Stop and report if you will exceed it.

If a tier feels wrong for the actual blast radius, say so and propose the
one you think fits. Do not silently apply the heavier one.

## Never
- Re run tests that passed on code you have not since touched.
- Re verify a result you already verified this session.
- Split work into more than two pull requests without asking.
- Load the safe release skill for feature work.
- Write a document explaining your caution. Write three bullets.

## Non goals
Multi user support, concurrency handling, caching, feature flags,
staged rollout machinery, abstraction layers with one implementation.
