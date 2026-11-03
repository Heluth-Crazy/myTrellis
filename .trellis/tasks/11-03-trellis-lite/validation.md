# Validation (2026-11-03, Windows 10, Node 24)

## Automated

- `npm run build && npm test`: 91 passed, 1 skipped (fixture group), about 7s.
- `TL_FIXTURES=<cache> npm test`: 103 passed, about 92s. Full migrate/restore round trips on 3 upstream
  versions, plan checks on all 15 (0.3.10 to 0.7.0-beta.4), every platform flag each version supports.
- CI (Ubuntu and Windows) not run yet: the branch isn't pushed.

## Migration on copies of the nine local projects

- Eight migrated; ThreadTerm-vscode refused as intended (its `.trellis` and `.agents` are junctions into
  ThreadTerm).
- For each of the eight: migrate, second run "Nothing to migrate.", `update` "Up to date." with no file
  changes, `--restore` byte-identical to the original (sha256 of every file and the directory list),
  re-migrate identical to the first. Backups 0.8 to 4.1 MB.
- `spec/`, `tasks/`, `workspace/`: the only changes are removed `_example`-only seed jsonl files.
- Leftover references to `.trellis/scripts` or removed hooks: 0 in all eight.
- Remaining non-Lite files are the user's own (GitNexus skills, `.trellis/prompts`, helper scripts, a custom
  Codex agent, a plugin marketplace file, `.claude/settings.json` env).
- Read-only dry runs on the real folders match the copies, plus `.opencode/node_modules` (removed with the
  upstream plugin package).

## Agent CLIs (headless)

- Fresh Lite repo: all five see the block and four skills (Pi with `--approve`). Small fix: 5/5 without a
  task folder. Planning: 4/5 wrote a PRD first (Pi asked first; template since changed). Handoff: 4/4
  implemented from a brief with passing tests.
- Migrated codex2OtherAgent-plugin clone:
  - Resume a legacy task: 5/5 found it and reported its state correctly; none ran deleted scripts.
  - Plan a change: 5/5 wrote `prd.md` with proposed decisions (OpenCode on a second run; the first headless
    run ended while its sub-agents were still working).

## Dogfood

- `trellis migrate` on this repository's own upstream install, then `--restore` (git status clean), then
  migrate again. Found and fixed: version-only Cursor hooks file, blank lines left in `.gitattributes`,
  orphan OpenCode lockfile.

## Linked folders

- Final `npm run build` passed. `npm test`: 96 passed, 1 skipped (external fixture cache not selected).
  With `TL_FIXTURES=D:/project/myTrellis-scratch/cache`, `npm test`: 111 passed, 1 skipped; all 7 test
  files passed, covering 15 upstream versions. `git diff --check` and LF checks passed.
- Reviewed the brief, README, migration/platform specs, and full change against the seven behavior criteria.
- Regression tests cover shared `.trellis` and agent folders, a target without a Lite manifest, nested-link
  refusal, skipped shared destinations and manifest writes, idempotence, and exact restore. CLI tests cover
  block-only update (including dry-run), init/uninstall refusal, and shared task new/list/archive.
- Copied ThreadTerm-vscode's own entries (excluding `node_modules`, `dist`, `.trellis`, `.agents`) to
  `D:/project/myTrellis-scratch/linked/vscode/`; copied ThreadTerm's `.trellis` and `.agents` to the sibling
  `ThreadTerm/` and created junctions to those copies. Neither real project was modified.
- Copy migration succeeded; second migration reported "Nothing to migrate." Restore recovered all 145
  changed files byte for byte. SHA-256 snapshots also confirmed the complete file/directory list and both
  junction targets were identical, and the shared copy stayed unchanged through migration and restore.
  Backup: `D:/project/myTrellis-scratch/linked/backups/2026-11-03T23-42-09-969Z-46868/`.
- Read-only `node D:/project/myTrellis/bin/trellis.js migrate --dry-run` in real ThreadTerm-vscode succeeded:
  platforms kimi/opencode; shared `.trellis` and `.agents` point into `D:/project/ThreadTerm/ThreadTerm/`;
  removed 140 (.cursor 42, .grok 48, .kimi-code 6, .opencode 44), scrubbed 2 (.cursor 1, root 1),
  edited-and-removed 3, kept 0, created 0, leftover references 0. Cursor and Grok are unsupported.
  The edited files are `.cursor/skills/trellis-meta/references/local-architecture/workspace-memory.md`,
  `.grok/skills/trellis-channel/references/command-reference.md`, and
  `.opencode/skills/trellis-meta/references/local-architecture/workspace-memory.md`.
- Templates unchanged; no global installs or commits. Windows checks only; POSIX CI was not run locally.
