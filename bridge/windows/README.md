# Windows Reading Capture bridge

This directory contains the source-only Phase 3 bridge worker. It is
deliberately inert: importing or building it does not start a process, read a
credential, configure Windows, or access an Obsidian vault.

The worker:

- opens the local Reading Capture queue and a canonical vault root from the
  approved one-shot launcher;
- requires each destination note to exist beneath `Literature notes/`;
- rejects absolute paths, traversal, and canonical paths outside the vault;
- renders each entry from the queued capture ID and capture timestamp, hashes
  LF-normalized complete entry blocks, and compares only the final 100 entries;
- appends and flushes once, then confirms delivery;
- reports only fixed, sanitized failure codes;
- leaves locked or sync-conflicted notes claimed for stale-claim retry, and uses
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

The launcher requires absolute queue and vault paths and the exact capture ID
approved for the rehearsal:

```text
node dist/reading-obsidian-bridge.cjs --queue-file C:\absolute\reading.json --vault-root C:\absolute\disposable-rehearsal-vault --expected-capture-id reading_0123456789abcdef0123456789abcdef
```

It refuses any capture other than `--expected-capture-id` before resolving or
opening the vault path. Output is limited to fixed outcome/error codes, capture
IDs, and the fixed append outcome. Destination paths, Markdown, and provider
error details are never printed.

An unexpected capture remains claimed without being appended or acknowledged.
After the five-minute stale timeout it can be retried. Continuous operation, a
real-vault run, and Task Scheduler remain separate approval gates.
