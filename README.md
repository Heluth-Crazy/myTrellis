# Trellis Lite

A small Trellis for current coding agents: one short instruction block, four skills, and plain folders for
specs and tasks. No hooks, no injected context, no Python, no runtime dependencies. It supports Claude Code,
Codex, Kimi Code, Pi and OpenCode, and migrates projects set up with upstream Trellis.

## What it installs

| Path | Purpose |
|---|---|
| Block in `AGENTS.md` / `CLAUDE.md` | How to work: when to plan, check, hand off and record knowledge |
| `.agents/skills/`, `.claude/skills/` | `trellis-plan`, `trellis-check`, `trellis-handoff`, `trellis-spec` |
| `.trellis/spec/` | What the code can't tell you: decisions, contracts, pitfalls |
| `.trellis/tasks/<MM-DD-slug>/` | One folder per larger piece of work: `prd.md`, plus short notes and briefs |
| `.trellis/manifest.json` | Hashes of managed files, so `update` and `uninstall` leave your edits alone |

Claude Code reads `CLAUDE.md` and `.claude/skills/`; Codex, Kimi, Pi and OpenCode read `AGENTS.md` and
`.agents/skills/`. If `CLAUDE.md` has an `@AGENTS.md` line, the block goes in `AGENTS.md` only. Pi loads
project skills only in folders you trust.

## Install

Trellis Lite isn't published to npm. Build it from this repository:

```bash
npm ci
npm run build
node bin/trellis.js --version
```

Run it as `node /path/to/myTrellis/bin/trellis.js`, or install the checkout globally with
`npm install -g /path/to/myTrellis`. The command is `trellis`, the same as upstream: remove upstream first
(`npm rm -g @mindfoldhq/trellis`) once your projects are migrated.

## Commands

```text
trellis init [--claude] [--codex] [--kimi] [--pi] [--opencode] [--force]
trellis update [--force] [--dry-run]
trellis uninstall [--purge] [--force] [--yes]
trellis task new <slug> [--title <text>]
trellis task list [--all]
trellis task archive <name>
trellis migrate [--dry-run] [--yes] [--keep-edited] [--backup-dir <path>]
trellis migrate --restore <backup>
```

- `init` without flags picks the platforms whose folders exist, or all five.
- `update` rewrites managed files from the current templates and keeps files you edited (`--force` overwrites).
- `uninstall` removes the block, skills and manifest; specs and tasks stay unless `--purge --yes`.
- `task archive` moves a task to `.trellis/tasks/archive/YYYY-MM/`.

Commands work from any subfolder of the project.

## Migrating from upstream Trellis

```bash
cd your-project
trellis migrate --dry-run   # see what would change
trellis migrate             # asks before applying; --yes for scripts
```

Migrate removes upstream's scripts, hooks, commands, agents and generated state, including what it wrote for
platforms Lite doesn't support. It also strips Trellis entries from shared config files (`.claude/settings.json`,
`.codex/config.toml`, `.pi/settings.json`, `.opencode/package.json` and others) and keeps your own entries. Then
it installs Lite for the platforms the project uses.

- **Kept untouched:** `.trellis/spec/`, `.trellis/tasks/`, `.trellis/workspace/`, and any file it doesn't
  recognize as upstream's. Old task folders keep working: agents read `prd.md` and the other notes.
- **Files you edited:** removed but listed, with copies in the backup. Use `--keep-edited` to keep them.
- **Backup:** written outside the project before anything changes, in
  `~/.trellis-lite/backups/<project>-<id>/<time>/` or under `--backup-dir`.
- **Undo:** `trellis migrate --restore <backup>` puts every file back byte for byte. It refuses to overwrite
  files you changed after migrating.
- **Linked folders:** if `.trellis` or an agent folder is a symlink or junction into another project, migrate
  that project instead.

Running migrate again is safe: it reports "Nothing to migrate."

## Development

```bash
npm ci
npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md), including how to run the migration tests against real upstream
installs.
