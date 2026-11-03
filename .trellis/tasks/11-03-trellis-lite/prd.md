# Trellis Lite

## Goal

Replace the fork's Trellis (23 platforms, Python hooks, phase state machine, ~60k lines) with a small,
pull-based Trellis for five agent CLIs: Claude Code, Codex, Kimi, Pi and OpenCode. Projects that use
upstream Trellis (0.3 to 0.7) move to it with one command, without losing specs, tasks or user edits.

## Acceptance criteria

- [x] `trellis init` in an empty git repo writes only: the managed block in AGENTS.md and/or CLAUDE.md,
      4 skills in `.agents/skills/` and/or `.claude/skills/`, `.trellis/spec/index.md`, `.trellis/tasks/`,
      `.trellis/manifest.json`. No hooks, no Python, no settings files.
- [x] Each of the five CLIs, run headless in a freshly initialized repo, sees the block and the four
      `trellis-*` skills (Pi with project trust).
- [x] `trellis update` refreshes unedited managed files and blocks, keeps edited ones and reports them.
- [x] `trellis uninstall` removes managed files and blocks and keeps `spec/` and `tasks/` unless `--purge`.
- [x] `trellis task new|list|archive` work on Windows and POSIX paths.
- [x] `trellis migrate` on copies of all nine local projects that use upstream Trellis:
      - removes every upstream hook, agent, command, skill, extension, plugin and script, for all 23 upstream
        platforms, including Cursor and others that Lite doesn't support;
      - removes only the Trellis entries from settings.json, hooks.json, config.toml, package.json and
        Pi settings, and keeps the user's own entries;
      - leaves `spec/`, `tasks/` (including archive) and `workspace/` byte-identical, except jsonl files that
        only hold the `_example` seed line;
      - backs up everything it removes or changes outside the project, and `trellis migrate --restore` puts
        the project back byte for byte;
      - a second run reports nothing to do.
- [x] After migration, no file in the project references `.trellis/scripts/` or a removed hook.
- [x] The test suite passes on Windows (`npm test`) and covers init, update, uninstall, task and migrate
      against fixtures from several upstream versions.
- [x] A short README explains install, the five platforms, the commands and migration.

## Out of scope

- channel, mem, ablate/restore, workflow variants, statusline, sub-agent definitions, spec templates from a
  registry, monorepo package scoping, Linear sync, journals.
- Platforms other than the five (their old Trellis files are removed by migrate, not supported).
- Publishing to npm.

## Decisions

- 2026-11-03: approach approved by the user. Codex implements; Claude orchestrates, reviews, verifies with
  the five CLIs and commits.
- Defaults taken where the user did not choose: drop channel/mem/sub-agents; zero hooks; command name stays
  `trellis`; package not published yet (`private: true`).
- Discovery verified on this machine (2026-11-03): Claude Code reads CLAUDE.md + `.claude/skills`; Codex,
  Kimi, Pi and OpenCode read AGENTS.md + `.agents/skills`. OpenCode also reads `.claude/skills`, so both
  copies must be byte-identical. Pi loads project skills only for trusted folders.

## Notes

- Upstream reference checkout: `D:/project/myTrellis-upstream` (detached at f089cb32). Read-only.
- License stays AGPL-3.0; keep COPYRIGHT and LICENSE.
