# Platforms

## Discovery (verified 2026-11-03 by running each CLI headless)

| CLI | Instructions | Project skills |
|---|---|---|
| Claude Code | `CLAUDE.md` | `.claude/skills` |
| Codex | `AGENTS.md` | `.agents/skills` |
| Kimi Code | `AGENTS.md` | `.agents/skills`, `.kimi-code/skills` |
| Pi | `AGENTS.md` | `.agents/skills`, `.pi/skills` |
| OpenCode | `AGENTS.md` | `.agents/skills`, `.claude/skills`, `.opencode/skills` |

So Lite writes two targets only: the block in `AGENTS.md` plus `.agents/skills`, and the block in `CLAUDE.md`
plus `.claude/skills`. When `CLAUDE.md` has an exact `@AGENTS.md` line, Claude already reads `AGENTS.md`, so
the block goes there only.

## Pitfalls

- Pi loads project skills only in folders the user trusts. Headless runs need `--approve`; without it the
  skills are silently missing.
- Git with `core.autocrlf=true` checks managed files out with CRLF. Manifest hashes are taken on CRLF→LF
  normalized text, otherwise every checkout looks edited.
- Agents run `trellis` from PowerShell, cmd and POSIX shells. Skills must also work without the CLI
  (`trellis-plan` says how to create the folder by hand).

## Decisions

- No hooks, no injected context, no Python. Current models read the block and the skills on their own; hooks
  were the main source of per-platform breakage upstream.
- Skills are byte-identical in both skill folders, so an agent sees the same instructions whichever it reads.
