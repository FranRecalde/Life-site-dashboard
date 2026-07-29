# Windows Reading Capture bridge

This directory contains the source-only Phase 3 bridge worker. It is
deliberately inert: importing or building it does not start a process, read a
credential, configure Windows, or access an Obsidian vault.

The worker:

- accepts a bridge API client, an in-memory credential, a stable owner ID, and a
  canonical vault root from a future approved launcher;
- requires each destination note to exist beneath `Literature notes/`;
- rejects absolute paths, traversal, and canonical paths outside the vault;
- checks the stable capture marker and exact Markdown before appending;
- appends and flushes once, then confirms delivery;
- reports only fixed, sanitized failure codes;
- supports same-owner expired-lease recovery and a caller-provided
  OS-owned single-instance lock that is released after normal completion or an
  unexpected process crash.

Credential creation, Task Scheduler configuration, real-vault selection,
continuous service startup, staging configuration, and deployment are
intentionally excluded. They require separate explicit approval.

## One-shot staging rehearsal launcher

Gate 1 adds a fail-closed launcher for a later approved one-shot rehearsal. It
does not create credentials, select or inspect a vault, start a continuous
worker, or configure Task Scheduler.

Build it with:

```text
npm.cmd run build:reading-bridge
```

The launcher requires an absolute JSON configuration path and the exact capture
ID approved for the rehearsal:

```text
node dist/reading-obsidian-bridge.cjs --config C:\absolute\staging.json --expected-capture-id reading_0123456789abcdef0123456789abcdef
```

The configuration accepts exactly four non-secret fields:

```json
{
  "baseUrl": "https://permanent-staging-service-url.example",
  "vaultRoot": "C:\\absolute\\disposable-rehearsal-vault",
  "ownerId": "windows-bridge-staging-rehearsal",
  "credentialTarget": "LifeSiteDashboard/ReadingBridge/Staging"
}
```

The bearer token must exist as UTF-8 bytes in the named generic Windows
Credential Manager entry. The launcher retrieves it through a hidden,
non-interactive PowerShell process and never accepts it through JSON, command
arguments, environment variables, files, or console input.

Before claiming, the launcher recovers expired leases for the configured owner.
It then refuses any capture other than `--expected-capture-id` before resolving
or opening the vault path. Output is limited to fixed outcome/error codes,
capture IDs, and the fixed append outcome. Destination paths, Markdown, tokens,
and provider error details are never printed.

An unexpected capture remains leased without being appended or acknowledged.
After the five-minute lease expires, the same owner can recover it. Continuous
operation, credential creation, a real-vault run, and Task Scheduler remain
separate approval gates.
