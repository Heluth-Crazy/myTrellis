# Trellis Lite

Trellis Lite is a small, zero-runtime-dependency CLI for installing and maintaining Trellis project guidance for coding agents. It requires Node.js 18 or newer and is currently private (it is not published to npm).

## Install and run

```bash
npm ci
npm run build
node bin/trellis.js init --claude --codex
```

Supported platform flags are `--claude`, `--codex`, `--kimi`, `--pi`, and `--opencode`. With no flags, `init` detects existing platform directories or selects all five when none are present.

Claude uses `CLAUDE.md` and `.claude/skills/`; the other four use `AGENTS.md` and `.agents/skills/`. If `CLAUDE.md` imports `@AGENTS.md` on its own line, the managed block goes in `AGENTS.md`. Pi requires project trust before loading project skills.

## Commands

```text
trellis init [flags] [--force]
trellis update [--force] [--dry-run]
trellis uninstall [--purge] [--force] [--yes]
trellis task new <slug> [--title <text>]
trellis task list [--all]
trellis task archive <name>
trellis migrate [--dry-run] [--yes]       (phase 2 stub)
trellis --version
trellis --help
```

Run the CLI from the repository with `node bin/trellis.js`; phase 1 does not publish a package or provide migration yet.

Commands resolve the project root from any subfolder. `update` preserves edited managed files and blocks unless forced. `uninstall` keeps specs and tasks; deleting `.trellis/` requires `--purge --yes`. Existing upstream installations must wait for phase 2 migration.

## Development

```bash
npm ci
npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
