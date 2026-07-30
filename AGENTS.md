# Life Site Dashboard

Private dashboard. One user, one Windows machine, low volume, low failure
cost. Build for that, not for production scale.

## Commands
- Scoped tests, reading pipeline: `npm run test:reading`
- Full suite: `npm test` (once, before merge, never after each step)
- Lint and build before merge

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
