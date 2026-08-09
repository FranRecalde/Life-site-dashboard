# Windows Reading Capture bridge

This directory contains the source-only Phase 3 bridge worker. It is
deliberately inert: importing or building it does not start a process, read a
credential, configure Windows, or access an Obsidian vault.

The worker:

- opens the configured Firestore Reading Capture queue using Application Default
  Credentials and a canonical vault root from the approved one-shot launcher;
- requires each destination note to exist beneath `Literature notes/`;
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

The launcher requires explicit Firestore project and database IDs, an absolute
vault path, and the exact capture ID approved for the rehearsal. It uses
Application Default Credentials; no bearer token, secret, or public bridge
endpoint is configured.

For staging, use project `gen-lang-client-0802447346` and database
`life-site-staging`:

```text
node dist/reading-obsidian-bridge.cjs --firestore-project-id gen-lang-client-0802447346 --firestore-database-id life-site-staging --vault-root C:\absolute\disposable-rehearsal-vault --expected-capture-id reading_0123456789abcdef0123456789abcdef
```

Local recovery markers are stored beneath
`%LOCALAPPDATA%\LifeSiteDashboard\reading-bridge`. They are scoped to the
Firestore project/database pair and are deleted only after Firestore confirms
the capture as `done`.

It refuses any capture other than `--expected-capture-id` before resolving or
opening the vault path. Output is limited to fixed outcome/error codes, capture
IDs, and the fixed append outcome. Destination paths, Markdown, and provider
error details are never printed.

An unexpected capture remains pending without being appended or receipted.
Continuous operation, a real-vault run, and Task Scheduler remain separate
approval gates.
