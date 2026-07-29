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

Windows Credential Manager integration, Task Scheduler configuration, vault
selection, credential creation, service startup, staging configuration, and
deployment are intentionally excluded. They require separate explicit approval.
