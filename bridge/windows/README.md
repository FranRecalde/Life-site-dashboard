# Windows Reading Capture bridge

This directory contains the source-only Phase 3 bridge worker. It is
deliberately inert: importing or building it does not start a process, read a
credential, configure Windows, or access an Obsidian vault.

The worker:

- opens the configured Firestore Reading Capture queue using Application Default
  Credentials and a canonical vault root from the approved one-shot launcher;
- creates a missing destination note beneath `Literature notes/` only when its parent folder already exists; a missing parent folder is refused;
- rejects absolute paths, traversal, and canonical paths outside the vault;
- renders each entry from the queued capture ID and capture timestamp, hashes
  LF-normalized complete entry blocks, and compares only the final 100 entries;
- appends and flushes once, then creates an exclusive, flushed local
  capture-ID marker before confirming the capture as `done` in Firestore;
- reconciles leftover local markers before selecting a new capture, retaining a
  marker until Firestore confirmation succeeds;
- reports only fixed, sanitized failure codes;
- leaves locked or sync-conflicted notes pending for the next bridge retry, and uses
  an OS-owned single-instance lock released after normal completion or crash.

Task Scheduler configuration, real-vault selection, continuous service startup,
staging configuration, and deployment are
intentionally excluded. They require separate explicit approval.

## One-shot staging rehearsal launcher

Gate 1 adds a fail-closed launcher for a later approved one-shot rehearsal. It
does not create credentials, select or inspect a vault, start a continuous
worker, or configure Task Scheduler.

Build it with:

```text
npm.cmd run build:reading-bridge
```

The launcher requires explicit Firestore project and database IDs and an
absolute vault path. `--expected-capture-id` is optional: when present it
delivers only that first undelivered capture; when absent it delivers all
pending captures oldest first. It uses Application Default Credentials; no
bearer token, secret, or public bridge endpoint is configured.

For staging, use project `gen-lang-client-0802447346` and database
`life-site-staging`:

```text
node dist/reading-obsidian-bridge.cjs --firestore-project-id gen-lang-client-0802447346 --firestore-database-id life-site-staging --vault-root C:\absolute\disposable-rehearsal-vault
```

The runner derives a local marker base path beneath
`%LOCALAPPDATA%\LifeSiteDashboard\reading-bridge`. They are scoped to the
Firestore project/database pair and are deleted only after Firestore confirms
the capture as `done`.

When `--expected-capture-id` is supplied, it refuses any other first
undelivered capture before resolving or opening the vault path. Output is
limited to fixed outcome/error codes, delivered capture IDs and count, and the
fixed append outcome. Destination paths, Markdown, and provider error details
are never printed.

An unexpected capture remains pending without being appended or receipted.
Each drained capture is appended, marked, confirmed, and then has its marker
deleted before the next starts; a failure stops the drain. Continuous
operation, a real-vault run, and Task Scheduler remain separate approval gates.

## Double-click launcher

`run-reading-bridge.cmd` starts the built bridge against the production Reading
Capture queue and the configured local vault. It finds the repository root from
its own location, writes the bridge JSON output and exit code to
`%LOCALAPPDATA%\LifeSiteDashboard\reading-bridge\launcher.log`, and pauses when
opened by double click. Build the bundle first with `npm.cmd run
build:reading-bridge`; a scheduled task will call the launcher with `--quiet`
so it does not pause.
