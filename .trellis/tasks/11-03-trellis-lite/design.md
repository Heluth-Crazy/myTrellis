# Trellis Lite design

## Repository layout (after phase 1)

A single npm package at the repo root. No pnpm, no monorepo, no Python.

```
bin/trellis.js            # #!/usr/bin/env node, imports dist/cli.js
src/                      # TypeScript, ESM, Node >= 18, no runtime dependencies (node:util parseArgs)
templates/                # block.md, skills/<name>/SKILL.md, task-prd.md, spec-index.md (already written)
test/                     # vitest
scripts/                  # dev-only scripts (legacy catalog generator, phase 2)
package.json              # name "trellis-lite", private, bin { trellis }, AGPL-3.0
```

Delete: `packages/`, `docs-site` and `marketplace` submodules (and `.gitmodules`), `pnpm-*.yaml`,
`pyrightconfig.json`, `.husky/`, `.lintstagedrc`, `drafts/`, README_CN.md, CONTRIBUTING_CN.md. Rewrite
README.md and CONTRIBUTING.md (short). Update `.github/workflows` to `npm ci && npm test` on
windows-latest and ubuntu-latest, or delete workflows that only make sense upstream (release, docs).
Leave the repo's own upstream Trellis install alone for now (`.trellis/`, `.agents/`, `.claude/`,
`.codex/`, `.cursor/`, `.omp/`, `.opencode/`, `.pi/`, the TRELLIS block in AGENTS.md); phase 3 migrates
it with the new `trellis migrate`.

## Targets

Platforms map to two targets:

| Platform flag | Target | Files |
| --- | --- | --- |
| `--claude` | claude | CLAUDE.md block, `.claude/skills/trellis-*/SKILL.md` |
| `--codex`, `--kimi`, `--pi`, `--opencode` | agents | AGENTS.md block, `.agents/skills/trellis-*/SKILL.md` |

Skill files are byte-identical in both locations (OpenCode reads both). Write LF line endings.

If CLAUDE.md contains a line that is exactly `@AGENTS.md`, it already imports AGENTS.md: write the block to
AGENTS.md only, even for the claude target.

## Managed block

Markers: `<!-- TRELLIS:START -->` and `<!-- TRELLIS:END -->` (same as upstream, so migrate replaces upstream
blocks in place). Content: `templates/block.md`. Insert at the top of the file when no block exists; create
the file when missing. Never touch text outside the markers.

## Manifest

`.trellis/manifest.json`, committed with the project:

```json
{
  "tool": "trellis-lite",
  "version": "1.0.0-alpha.0",
  "platforms": ["claude", "codex"],
  "files": { ".claude/skills/trellis-plan/SKILL.md": "<sha256 of written bytes>" },
  "blocks": { "AGENTS.md": "<sha256 of block content between markers>" }
}
```

A file or block is "edited" when its current hash differs from the manifest hash.

## Commands

All commands: `--help`; exit code 1 with a one-line error on failure; run from the git root or any
subfolder (resolve the project root as the nearest ancestor with `.git` or `.trellis`); refuse to run in the
home directory. Output is short and plain; no colors needed.

- `trellis init [--claude] [--codex] [--kimi] [--pi] [--opencode] [--force]`
  - No flags: detect from existing dirs (`.claude`, `.codex`, `.kimi-code`, `.pi`, `.opencode`); if none,
    all five. Print the platforms chosen and how to change them.
  - Re-running adds platforms (union with the manifest).
  - Existing unmanaged file at a managed path: keep it and report, unless `--force`.
  - Creates `.trellis/spec/index.md` (from `templates/spec-index.md`) only if `.trellis/spec/` has no
    `index.md`; creates `.trellis/tasks/`.
  - If an upstream install is detected (`.trellis/.version` or `.trellis/scripts/` or `.trellis/workflow.md`
    without a Lite manifest), stop and tell the user to run `trellis migrate`.
  - Pi selected: print one line that Pi loads project skills only after the folder is trusted.
- `trellis update [--force] [--dry-run]`: write current templates for the manifest's platforms. Unedited or
  missing → write. Edited → keep and report (replace with `--force`). Files the manifest lists that the
  current version no longer ships → delete if unedited. Update manifest hashes and version.
- `trellis uninstall [--purge] [--force] [--yes]`: delete managed files (edited ones only with `--force`),
  remove empty parent dirs it created, strip blocks (delete AGENTS.md/CLAUDE.md if empty afterwards),
  delete the manifest. Keep `spec/` and `tasks/`; `--purge` deletes `.trellis/` too and needs `--yes`.
- `trellis task new <slug> [--title <text>]`: slug `[a-z0-9][a-z0-9-]*`; folder
  `.trellis/tasks/<MM-DD>-<slug>` (local date); error if it exists; writes `prd.md` from
  `templates/task-prd.md` with `{{TITLE}}` (default: slug with dashes as spaces); prints the relative path.
- `trellis task list [--all]`: active task folders (not `archive/`), newest first, one line each:
  name, title (first `# ` heading of prd.md, else upstream `task.json` title, else slug), last-modified
  date, and a size note when the folder is over 5 MB. `--all` adds archived folders.
- `trellis task archive <name>`: name is the folder name or a unique suffix/slug match; moves it to
  `.trellis/tasks/archive/<YYYY-MM>/`; warns when the folder is over 5 MB and names the largest subfolders.
- `trellis migrate [--dry-run] [--yes] [--backup-dir <path>]` and `trellis migrate --restore <backup>`:
  phase 2, below.

## Migration (phase 2)

Input: a project with an upstream install (0.3 to 0.7). Default prints the plan and asks to confirm on a
TTY; without a TTY it requires `--yes`; `--dry-run` only prints.

1. Inventory upstream-written files from three sources, in order:
   1. `.trellis/.template-hashes.json` when present: authoritative path list plus original hashes.
   2. The legacy catalog shipped with the package (`src/legacy/catalog.json`): every path any sampled
      upstream version writes, with all known hashes (hash after CRLF→LF and `python3 `→`python `).
      Generated by `scripts/build-legacy-catalog.mjs`, which runs `npx @mindfoldhq/trellis@<v> init -y`
      with every platform flag that version supports, in temp dirs. Sample: latest 0.3.x, 0.4.x, 0.5.x;
      0.6.0-beta.0/.10/.23; 0.6.0, 0.6.5, 0.6.10, 0.6.17; 0.7.0-beta.0 through the newest. Commit the
      catalog and the generator; never the temp dirs.
   3. Patterns, for paths neither source knows: `trellis-*` entries or `trellis/` subfolders in platform
      skill, agent, command, prompt and workflow folders; hook scripts referenced by Trellis hook entries.
   A path matched only by pattern is removed only if it sits in a known upstream platform folder.
   Files that match nothing are never touched.
2. Structured config files: strip only Trellis entries, keep the user's, delete the file if nothing is left.
   Port the upstream scrubbers (`packages/cli/src/utils/uninstall-scrubbers.ts`, `managed-removal.ts` in
   the upstream checkout) for `.claude/settings.json`, `.codex/hooks.json`, `.codex/config.toml`,
   `.pi/settings.json`, `.opencode/package.json`, and the other platforms' hooks/settings files. A hook
   entry is Trellis's when its command references `.trellis/` or a catalog hook path.
3. `.trellis/` internals:
   - Remove: `scripts/`, `workflow.md`, `config.yaml`, `agents/`, `worktree.yaml`, `.runtime/`,
     `.developer`, `.current-task`, `.version`, `.template-hashes.json`, `.gitignore`, `.ralph-state.json`,
     `__pycache__/` anywhere under `.trellis/`.
   - Keep byte-identical: `spec/`, `tasks/` (including `archive/` and `task.json` files), `workspace/`, and
     anything else not listed.
   - In task folders, delete `implement.jsonl` / `check.jsonl` whose non-empty lines all contain `_example`.
4. Blocks: replace the upstream TRELLIS block in AGENTS.md (and any other file upstream managed with those
   markers, e.g. `.github/copilot-instructions.md`, which is stripped, not replaced) with the Lite block.
5. Install Lite for the platforms detected among the five (claude if upstream had Claude files; codex, kimi,
   pi, opencode from theirs). Other upstream platforms: report "removed, not supported by Trellis Lite".
6. Edited upstream files (hash differs from every known hash): removed like the rest, listed separately in
   the report as "you had edited these; copies are in the backup". `--keep-edited` leaves them in place.
7. Backup: outside the project, default `~/.trellis-lite/backups/<project-dirname>-<8-char path hash>/<UTC
   timestamp>/`, containing the original bytes of every removed or changed file and `plan.json` (removed,
   changed, created paths). `--restore <dir>` deletes created files, restores originals, verifies hashes.
8. Report: counts and paths by group (removed, scrubbed, edited-and-removed, kept, created), the backup
   path, unsupported platforms, and a final scan for leftover references to `.trellis/scripts`,
   `task.py`, `add_session.py` and removed hook paths in the project's agent config folders.
9. Idempotent: a project with a Lite manifest and no upstream inventory reports "nothing to migrate".

Safety: never follow symlinks or junctions out of the project; refuse paths outside the root; never delete
outside the plan; dry-run output equals the plan that `--yes` executes.

## Tests

- Unit: block insert/replace/strip, manifest hashing, edited detection, slug and date handling, path
  resolution on Windows (`D:\x`, `/d/x`), scrubbers.
- Integration (temp dirs): init per platform and combined; update with edited files; uninstall and purge;
  task new/list/archive.
- Migration fixtures: generated by running upstream versions (cache under the OS temp dir, not in the
  repo) plus small hand-written fixtures in `test/fixtures/` for edge cases (edited files, user hook
  entries next to Trellis ones, missing hash file, CLAUDE.md with `@AGENTS.md`). Assert the PRD criteria.

## Phases

1. Package, templates wiring, init/update/uninstall/task, tests, repo cleanup.
2. Legacy catalog, migrate and restore, fixtures and tests.
3. Claude: run migrate on copies of the nine local projects, then on the real ones with backup and
   restore; headless experience runs with all five CLIs; dogfood migrate on this repo; README.
