# Brief: Trellis Lite phase 2 (migrate)

You are implementing `trellis migrate` and `trellis migrate --restore` in `D:/project/myTrellis`, branch
`lite`. Phase 1 (init/update/uninstall/task) is committed; build on it.

## Read first

- `.trellis/tasks/11-03-trellis-lite/prd.md`: the migrate acceptance criteria.
- `.trellis/tasks/11-03-trellis-lite/design.md`, section "Migration (phase 2)": the rules.
- Upstream source, read-only: `D:/project/myTrellis-upstream`. The scrubbers to port are in
  `packages/cli/src/utils/uninstall-scrubbers.ts` and `managed-removal.ts`. `configurators/*.ts` and
  `src/migrations/manifests/*.json` show which paths each platform and version writes (manifests list
  renames and deletes, so they also name old paths).

As in phase 1, ignore this repo's own upstream Trellis install (`.trellis/workflow.md`, `.claude/`,
`.codex/`, ...). Don't run its scripts and don't edit those files.

## Fixtures already generated

`D:/project/myTrellis-scratch/cache/` (outside the repo; not in the OS temp folder, because an unknown
cleaner on this machine deletes folders there):
- `pkgs/<version>/`: npm installs of upstream versions 0.3.10, 0.4.0, 0.5.19, 0.6.0-beta.0/.10/.23,
  0.6.0, 0.6.5, 0.6.10, 0.6.17, 0.7.0-beta.0 to beta.4.
- `fixtures/<version>/`: a git repo where that version ran `init -y -u tester` with every platform flag it
  supports. `<version>.init.log` beside each.
- Generator: `D:/project/myTrellis-scratch/gen-fixtures.mjs`. Turn it into `scripts/build-legacy-catalog.mjs`,
  which builds the fixtures if missing (cache location from `TL_FIXTURES`, default under the OS temp dir for
  other machines) and writes `src/legacy/catalog.json`. Fixture-based tests read the cache location from
  `TL_FIXTURES` too and skip when it is unset or missing.

## Rules to get exactly right

- Catalog: walk each fixture's files, including gitignored ones and excluding `.git/`. Exclude
  `.trellis/spec/**`, `.trellis/tasks/**` and `.trellis/workspace/**`: those are user content once `init` has
  run. Exclude AGENTS.md and other files with a TRELLIS block: blocks are handled separately. Store
  `{ versions, paths: { "<posix path>": ["<normalized sha256>", ...] } }`, with hashes taken after CRLF→LF and
  replacing `python3 ` with `python `. Keep the JSON reasonably small (sorted, no pretty-printed hashes).
- Protected paths are never removed or changed, whatever an inventory source says: `.trellis/spec/**`,
  `.trellis/tasks/**` (except seed-only jsonl, per the design), `.trellis/workspace/**`, `.git/**`.
  Upstream `.template-hashes.json` lists AGENTS.md as a whole file. Only its block is replaced; never delete
  AGENTS.md.
- Structured files: only Trellis entries go. The fixtures show the shapes: `.claude/settings.json`,
  `.codex/hooks.json`, `.codex/config.toml`, `.gemini/settings.json`, `.cursor/hooks.json`,
  `.github/copilot/hooks.json`, `.github/hooks/trellis.json`, `.qoder/settings.json`,
  `.codebuddy/settings.json`, `.factory/settings.json`, `.pi/settings.json`, `.opencode/package.json`, and
  others in newer versions. Add a user-owned entry next to the Trellis ones in your tests and assert that it
  survives.
- `.opencode/node_modules/` and lock files that upstream's plugin install created: remove them only when
  `.opencode/package.json` ends up deleted (nothing of the user's left).
- Remove directories left empty by the migration, but never one that held user files.
- No symlink or junction following, no paths outside the project root. Real case on this machine:
  `D:/project/ThreadTerm/ThreadTerm-vscode/.trellis` and `.agents` are junctions to
  `D:/project/ThreadTerm/ThreadTerm/`. If `.trellis` or a platform folder in the plan is a link, stop before
  changing anything. Say which folder links where and that the target project should be migrated instead
  (or the link replaced). Test this with a symlink or junction fixture (junction on Windows, symlink on POSIX).
- Backup outside the project (`~/.trellis-lite/backups/...`, overridable with `--backup-dir`, and tests
  must override it). `--restore` must give back byte-identical files and delete what migrate created.
  Test that.
- Dry-run prints exactly the plan that `--yes` executes; reuse one plan object.
- Report: the groups listed in the design. Keep it readable: counts per platform folder, full paths only for
  edited files, unsupported platforms and leftovers.

## Tests

- Unit tests for each scrubber and for classification (catalog hit, hash-file hit, pattern hit, unknown).
- Integration over every cached fixture version when `$TL_FIXTURES/fixtures` exists. Otherwise
  skip with a clear message, since CI has no network fixtures:
  1. migrate --yes;
  2. no upstream file left, no reference to `.trellis/scripts`, `task.py` or `add_session.py` in the agent
     config folders;
  3. spec/tasks/workspace byte-identical;
  4. Lite installed for the detected platforms among the five;
  5. a second migrate reports nothing to do;
  6. restore matches the original tree byte for byte.
- Hand-written fixtures in `test/fixtures/` for: no hash file, edited upstream skill, user hook entries next
  to Trellis ones, CLAUDE.md that imports `@AGENTS.md`, seed-only and curated jsonl, an already-Lite project.

## Constraints

Same as phase 1: npm only, no runtime dependencies, no global installs or `npm link`, don't commit, never
kill processes by image name, keep artifacts bounded (no logs or fixtures in the repo; small hand-written
fixtures only), LF endings, Windows paths. Don't modify the real projects under `D:/project/` and don't
write to the fixture cache except through the generator. Time budget about 2 hours.

## Verify

```
TL_FIXTURES=D:/project/myTrellis-scratch/cache node scripts/build-legacy-catalog.mjs
npm run build && npm test
```
Then by hand: copy `D:/project/myTrellis-scratch/cache/fixtures/0.6.0-beta.23` to a new folder under `D:/project/myTrellis-scratch/`, run `node <repo>/bin/trellis.js
migrate --dry-run`, then `--yes`, then `--restore`. Paste the dry-run summary (trimmed) into your report.

## Report back (at most 30 lines)

What you built, catalog size (paths and versions), test count and results, the trimmed dry-run summary,
deviations from the design and why, and open questions.
