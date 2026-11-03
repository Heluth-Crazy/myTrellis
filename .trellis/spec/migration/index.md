# Migration from upstream Trellis

## Invariants (tests cover each)

- The backup lives outside the project (`~/.trellis-lite/backups/...` or `--backup-dir`) and is complete
  before the first project file changes. `plan.json` holds paths, modes and hashes; bytes only in `files/`.
- `--restore` validates every hash first and refuses to overwrite a file edited after the migration.
- Never touched: `.git`, `.trellis/spec`, `.trellis/tasks`, `.trellis/workspace`. The one exception is a
  task's `implement.jsonl`/`check.jsonl` whose every line is the upstream `_example` seed.
- Linked folders (symlinks, junctions) are refused: migrate the target project instead.
- `--dry-run` prints the same plan execution would apply; a second migrate finds nothing to do.

## Recognizing upstream files

In order: the project's `.trellis/.template-hashes.json`, then `src/legacy/catalog.json` (every file 15
sampled upstream versions write, hashed after CRLF→LF and `python3 ` → `python ` normalization), then path
patterns. A file whose hash matches none of the originals is "edited": it is removed but listed, and its
copy is in the backup (`--keep-edited` keeps it instead). Unknown files are never removed.

When a new upstream version ships, add it to `scripts/build-legacy-catalog.mjs` and run
`TL_FIXTURES=<cache dir> node scripts/build-legacy-catalog.mjs`, then `TL_FIXTURES=<cache dir> npm test`.

## Learned from real projects

- Generated state (`.developer`, `.runtime/`, `__pycache__`, `*.pyc`, `.version`) is never "edited";
  upstream `trellis update` backups (`.trellis/.backup-*/`) go whole.
- Shared config files are scrubbed, not deleted: only entries Trellis wrote are removed (hook commands that
  point at deleted files, `project_doc_fallback_filenames = ["AGENTS.md"]`, Pi's Trellis extension). A file
  left with nothing else goes.
- Platforms are picked from all evidence (migrated files, platform folders, `CLAUDE.md`, an `AGENTS.md`
  block); a project with only `.trellis/` and an `AGENTS.md` block still gets Codex.
