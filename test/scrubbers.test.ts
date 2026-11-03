import { describe, expect, it } from 'vitest';
import { scrubStructured } from '../src/legacy/scrubbers.js';

const deleted = ['.claude/hooks/session-start.py', '.cursor/hooks/trellis.py', '.github/copilot/hooks/session-start.py'];

function scrub(path: string, content: unknown) {
  return scrubStructured(path, JSON.stringify(content), deleted);
}

describe('legacy structured scrubbers', () => {
  it.each([
    '.claude/settings.json', '.codex/hooks.json', '.gemini/settings.json',
    '.factory/settings.json', '.codebuddy/settings.json', '.qoder/settings.json',
    '.trae/hooks.json', '.iflow/settings.json',
    '.cursor/hooks.json', '.github/copilot/hooks.json', '.github/hooks/trellis.json',
  ])('preserves user hook and root entries in %s', relative => {
    const flat = relative === '.cursor/hooks.json' || relative.startsWith('.github/');
    const entries = [{ command: 'python .trellis/scripts/task.py' }, { command: 'node user-hook.js' }];
    const input = { userSetting: 'preserved', hooks: { start: flat ? entries : [{ matcher: '*', hooks: entries }] } };
    const result = scrubStructured(relative, JSON.stringify(input), deleted)!;
    const user = [{ command: 'node user-hook.js' }];
    expect(JSON.parse(result.content)).toEqual({ userSetting: 'preserved', hooks: { start: flat ? user : [{ matcher: '*', hooks: user }] } });
    expect(result.fullyEmpty).toBe(false);
  });
  it('scrubs nested hook entries and preserves their user-owned neighbours', () => {
    const result = scrub('.claude/settings.json', { env: { USER: 'yes' }, hooks: { SessionStart: [{ matcher: '.*', hooks: [{ command: 'python .claude/hooks/session-start.py' }, { command: 'node user.js' }] }] } });
    expect(result).toMatchObject({ fullyEmpty: false });
    expect(JSON.parse(result!.content)).toEqual({ env: { USER: 'yes' }, hooks: { SessionStart: [{ matcher: '.*', hooks: [{ command: 'node user.js' }] }] } });
  });

  it('scrubs flat hooks, including Copilot bash commands, without deleting an echo neighbour', () => {
    const result = scrub('.github/hooks/trellis.json', { hooks: { SessionStart: [{ command: 'python .github/copilot/hooks/session-start.py' }, { bash: 'python .github/copilot/hooks/session-start.py' }, { command: 'echo .github/copilot/hooks/session-start.py still useful' }] } });
    expect(JSON.parse(result!.content)).toEqual({ hooks: { SessionStart: [{ command: 'echo .github/copilot/hooks/session-start.py still useful' }] } });
  });

  it('recognizes .trellis commands and removes now-empty hook config', () => {
    expect(scrub('.cursor/hooks.json', { hooks: { start: [{ command: 'python .trellis/scripts/task.py' }] } })).toEqual({ content: '{}\n', fullyEmpty: true });
  });

  it('treats GitHub hook schema metadata as empty after its Trellis hooks are removed', () => {
    expect(scrub('.github/hooks/trellis.json', { version: 1, hooks: { start: [{ command: 'python .trellis/scripts/task.py' }] } })).toEqual({ content: '{}\n', fullyEmpty: true });
  });

  it('removes only the upstream OpenCode dependency', () => {
    const result = scrub('.opencode/package.json', { name: 'mine', dependencies: { '@opencode-ai/plugin': '^1', vitest: '^4' } });
    expect(JSON.parse(result!.content)).toEqual({ name: 'mine', dependencies: { vitest: '^4' } });
    expect(scrub('.opencode/package.json', { dependencies: { '@opencode-ai/plugin': '^1' } })!.fullyEmpty).toBe(true);
  });

  it('removes Pi entries while preserving user entries in every array', () => {
    const result = scrub('.pi/settings.json', { enableSkillCommands: true, extensions: ['./extensions/trellis/index.ts', './mine.ts'], skills: ['./skills', './my-skills'], prompts: ['./prompts', './my-prompts'], packages: ['npm:pi-subagents', 'npm:mine'] });
    expect(JSON.parse(result!.content)).toEqual({ extensions: ['./mine.ts'], skills: ['./my-skills'], prompts: ['./my-prompts'], packages: ['npm:mine'] });
  });

  it('recognizes every legacy structured registry path', () => {
    for (const path of [
      '.claude/settings.json', '.codex/hooks.json', '.gemini/settings.json', '.factory/settings.json', '.codebuddy/settings.json', '.qoder/settings.json', '.trae/hooks.json', '.iflow/settings.json',
      '.cursor/hooks.json', '.github/copilot/hooks.json', '.github/hooks/trellis.json', '.opencode/package.json', '.pi/settings.json', '.codex/config.toml', '.github/copilot-instructions.md',
    ]) expect(scrubStructured(path, path.endsWith('.toml') ? 'user = true\n' : path.endsWith('.md') ? 'user\n' : '{}', deleted)).toBeDefined();
  });

  it('removes Codex-owned TOML and retains user settings', () => {
    const result = scrubStructured('.codex/config.toml', '# Project-scoped Codex defaults for Trellis workflows.\nproject_doc_fallback_filenames = ["AGENTS.md"]\n\n[agents]\nmax_depth = 1\nmodel = "fast"\n\n[ui]\ntheme = "dark"\n', deleted);
    expect(result).toEqual({ content: '[agents]\nmodel = "fast"\n\n[ui]\ntheme = "dark"\n', fullyEmpty: false });
  });

  it('returns malformed structured input intact and ignores unregistered paths', () => {
    expect(scrubStructured('.claude/settings.json', '{broken', deleted)).toEqual({ content: '{broken', fullyEmpty: false });
    expect(scrubStructured('.kiro/agents/trellis.json', '{}', deleted)).toBeUndefined();
  });

  it.each(['.cursor/hooks.json', '.claude/settings.json'])('keeps a byte-identical user-only structured file: %s', relative => {
    const userOnly = '{\n    "hooks": { "start": [{ "command": "node mine.js" }] }\n}\n';
    expect(scrubStructured(relative, userOnly, deleted)).toEqual({ content: userOnly, fullyEmpty: false });
    const nested = '{\n    "hooks": { "start": [{ "hooks": [{ "command": "node mine.js" }] }] }\n}\n';
    expect(scrubStructured(relative, nested, deleted)).toEqual({ content: nested, fullyEmpty: false });
  });

  it('strips only the Copilot guidance block', () => {
    const result = scrubStructured('.github/copilot-instructions.md', 'before\n<!-- TRELLIS:COPILOT-GUIDANCE:START -->\nowned\n<!-- TRELLIS:COPILOT-GUIDANCE:END -->\nafter\n', deleted);
    expect(result).toEqual({ content: 'before\n\nafter\n', fullyEmpty: false });
  });
  it('removes the journal rule from .gitattributes while keeping user attributes', () => {
    expect(scrubStructured('.gitattributes', '*.txt text eol=lf\n.trellis/workspace/*/journal-*.md merge=union\n', deleted)).toEqual({ content: '*.txt text eol=lf\n', fullyEmpty: false });
    expect(scrubStructured('.gitattributes', '*.txt text eol=lf\n', deleted)).toEqual({ content: '*.txt text eol=lf\n', fullyEmpty: false });
  });
  it('scrubs ZCode nested event configs while preserving user hooks and root settings', () => {
    const input = { theme: 'user', hooks: { enabled: true, events: { SessionStart: [{ hooks: [{ command: 'python .zcode/hooks/session-start.py' }, { command: 'node user.js' }] }] } } };
    const paths = ['.zcode/hooks/session-start.py'];
    const result = scrubStructured('.zcode/config.json', JSON.stringify(input), paths)!;
    expect(JSON.parse(result.content)).toEqual({ theme: 'user', hooks: { enabled: true, events: { SessionStart: [{ hooks: [{ command: 'node user.js' }] }] } } });
    input.hooks.events.SessionStart[0]!.hooks.pop();
    expect(JSON.parse(scrubStructured('.zcode/config.json', JSON.stringify(input), paths)!.content)).toEqual({ theme: 'user' });
  });
  it.each(['onSessionStart', 'onUserMessage', 'beforeSubAgentStart'])('scrubs Snow %s hooks with trailing script arguments and keeps user hooks', event => {
    const input = { [event]: [{ hooks: [{ command: 'python -X utf8 .snow/hooks/write-trellis-context.py session' }, { command: 'node user.js' }] }] };
    const result = scrubStructured(`.snow/hooks/${event}.json`, JSON.stringify(input), ['.snow/hooks/write-trellis-context.py'])!;
    expect(JSON.parse(result.content)).toEqual({ [event]: [{ hooks: [{ command: 'node user.js' }] }] });
    const pure = { [event]: [{ hooks: [{ command: 'python -X utf8 .snow/hooks/write-trellis-context.py session' }] }] };
    expect(scrubStructured(`.snow/hooks/${event}.json`, JSON.stringify(pure), ['.snow/hooks/write-trellis-context.py'])!.fullyEmpty).toBe(true);
  });

  it('is idempotent for every registered format', () => {
    const cases: Array<[string, string]> = [
      ['.claude/settings.json', '{"hooks":{"x":[{"hooks":[{"command":"python .claude/hooks/session-start.py"}]}]}}'],
      ['.cursor/hooks.json', '{"hooks":{"x":[{"command":"python .cursor/hooks/trellis.py"}]}}'],
      ['.opencode/package.json', '{"dependencies":{"@opencode-ai/plugin":"1"}}'],
      ['.pi/settings.json', '{"extensions":["./extensions/trellis/index.ts"]}'],
      ['.codex/config.toml', 'project_doc_fallback_filenames = ["AGENTS.md"]\n'],
    ];
    for (const [path, input] of cases) {
      const once = scrubStructured(path, input, deleted)!;
      const twice = scrubStructured(path, once.content, deleted)!;
      expect(twice.content).toBe(once.content);
    }
  });
});
