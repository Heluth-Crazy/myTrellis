import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { blockContent, putBlock, stripBlock } from '../src/blocks.js';
import { hash } from '../src/manifest.js';
import { normalizePath, projectPath, projectRoot } from '../src/project.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(repository, 'bin', 'trellis.js');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-lite-test-'));
  mkdirSync(path.join(root, '.git'));
  roots.push(root);
  return root;
}

function run(root: string, args: string[], expectFailure = false): string {
  const options: ExecFileSyncOptionsWithStringEncoding = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    const output = execFileSync(process.execPath, [binary, ...args], options);
    if (expectFailure) throw new Error(`Expected command to fail: trellis ${args.join(' ')}`);
    return output;
  } catch (error) {
    if (!expectFailure) throw error;
    const result = error as { status?: number; stderr?: string; stdout?: string };
    expect(result.status).toBe(1);
    return `${result.stdout ?? ''}${result.stderr ?? ''}`;
  }
}

function write(root: string, relative: string, content: string): void {
  const file = path.join(root, ...relative.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

function manifest(root: string): { platforms: string[]; files: Record<string, string>; blocks: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(root, '.trellis', 'manifest.json'), 'utf8')) as { platforms: string[]; files: Record<string, string>; blocks: Record<string, string> };
}

function taskName(output: string): string {
  const match = /\.trellis\/tasks\/(\d{2}-\d{2}-[a-z0-9-]+)/.exec(output);
  expect(match).toBeTruthy();
  return match![1];
}

describe('trellis CLI integration', () => {
  it('installs the mapped targets for every platform and all defaults', () => {
    const root = project();
    const output = run(root, ['init']);
    expect(output).toContain('Platforms: claude, codex, kimi, pi, opencode.');
    expect(manifest(root).platforms).toEqual(['claude', 'codex', 'kimi', 'pi', 'opencode']);
    expect(existsSync(path.join(root, '.claude', 'skills', 'trellis-plan', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(root, '.agents', 'skills', 'trellis-plan', 'SKILL.md'))).toBe(true);
    expect(readFileSync(path.join(root, '.claude', 'skills', 'trellis-plan', 'SKILL.md'), 'utf8')).toBe(
      readFileSync(path.join(root, '.agents', 'skills', 'trellis-plan', 'SKILL.md'), 'utf8'),
    );
    expect(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toMatch(/^<!-- TRELLIS:START -->/);
    expect(readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toMatch(/^<!-- TRELLIS:START -->/);
    expect(existsSync(path.join(root, '.trellis', 'spec', 'index.md'))).toBe(true);
    expect(existsSync(path.join(root, '.trellis', 'tasks'))).toBe(true);
  });

  it('maps Claude to Claude files and every other platform to agent files', () => {
    for (const platform of ['claude', 'codex', 'kimi', 'pi', 'opencode']) {
      const root = project();
      run(root, ['init', `--${platform}`]);
      const claudeSkill = path.join(root, '.claude', 'skills', 'trellis-plan', 'SKILL.md');
      const agentSkill = path.join(root, '.agents', 'skills', 'trellis-plan', 'SKILL.md');
      expect(existsSync(claudeSkill)).toBe(platform === 'claude');
      expect(existsSync(agentSkill)).toBe(platform !== 'claude');
    }
  });

  it('detects existing platform directories and unions later init selections', () => {
    const root = project();
    mkdirSync(path.join(root, '.codex'));
    run(root, ['init']);
    expect(manifest(root).platforms).toEqual(['codex']);
    run(root, ['init', '--claude']);
    expect(manifest(root).platforms).toEqual(['claude', 'codex']);
  });

  it('uses AGENTS.md exclusively for Claude when its import is an exact line', () => {
    const root = project();
    write(root, 'CLAUDE.md', 'before\n@AGENTS.md\nafter\n');
    run(root, ['init', '--claude']);
    expect(readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toBe('before\n@AGENTS.md\nafter\n');
    expect(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toMatch(/^<!-- TRELLIS:START -->/);
  });

  it('keeps unmanaged target files unless init is forced', () => {
    const root = project();
    write(root, '.agents/skills/trellis-plan/SKILL.md', 'user skill\n');
    const output = run(root, ['init', '--codex']);
    expect(output).toContain('Kept unmanaged file: .agents/skills/trellis-plan/SKILL.md');
    expect(readFileSync(path.join(root, '.agents/skills/trellis-plan/SKILL.md'), 'utf8')).toBe('user skill\n');
    run(root, ['init', '--codex', '--force']);
    expect(readFileSync(path.join(root, '.agents/skills/trellis-plan/SKILL.md'), 'utf8')).not.toBe('user skill\n');
  });

  it('refuses every upstream install marker before writing Lite files', () => {
    for (const marker of ['.trellis/.version', '.trellis/scripts/legacy.py', '.trellis/workflow.md']) {
      const root = project();
      write(root, marker, 'upstream\n');
      expect(run(root, ['init', '--codex'], true)).toContain('Upstream Trellis detected; run trellis migrate');
      expect(existsSync(path.join(root, '.trellis', 'manifest.json'))).toBe(false);
    }
  });

  it('refuses malformed blocks and preserves a pre-existing spec index', () => {
    const root = project();
    const malformed = '<!-- TRELLIS:START -->\npartial\n';
    write(root, 'AGENTS.md', malformed);
    write(root, '.trellis/spec/index.md', 'user maintained spec\n');
    expect(run(root, ['init', '--codex'], true)).toContain('Malformed or multiple TRELLIS blocks');
    expect(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(malformed);
    expect(readFileSync(path.join(root, '.trellis/spec/index.md'), 'utf8')).toBe('user maintained spec\n');
  });

  it('keeps edited managed content during update, replaces it with --force, and dry-run leaves bytes unchanged', () => {
    const root = project();
    run(root, ['init', '--codex']);
    const skill = path.join(root, '.agents', 'skills', 'trellis-plan', 'SKILL.md');
    writeFileSync(skill, 'edited skill\n', 'utf8');
    expect(run(root, ['update'])).toContain('Kept edited file: .agents/skills/trellis-plan/SKILL.md');
    expect(readFileSync(skill, 'utf8')).toBe('edited skill\n');
    const before = readFileSync(skill);
    expect(run(root, ['update', '--dry-run'])).toContain('Would: Kept edited file: .agents/skills/trellis-plan/SKILL.md');
    expect(readFileSync(skill)).toEqual(before);
    run(root, ['update', '--force']);
    expect(readFileSync(skill, 'utf8')).not.toBe('edited skill\n');
  });

  it('keeps edited blocks and preserves CRLF exterior text', () => {
    const root = project();
    write(root, 'AGENTS.md', 'user header\r\nuser body\r\n');
    run(root, ['init', '--codex']);
    const agents = path.join(root, 'AGENTS.md');
    const installed = readFileSync(agents, 'utf8');
    expect(installed).toContain('user header\r\nuser body\r\n');
    writeFileSync(agents, installed.replace('<!-- TRELLIS:END -->', 'manual edit\n<!-- TRELLIS:END -->'), 'utf8');
    expect(run(root, ['update'])).toContain('Kept edited block: AGENTS.md');
    expect(readFileSync(agents, 'utf8')).toContain('manual edit\n<!-- TRELLIS:END -->');
  });

  it('reports an unchanged install as up to date without rewriting files', () => {
    const root = project();
    run(root, ['init', '--claude', '--codex']);
    const skill = path.join(root, '.agents', 'skills', 'trellis-plan', 'SKILL.md');
    const old = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(skill, old, old);
    expect(run(root, ['update']).trim()).toBe('Up to date.');
    expect(readFileSync(path.join(root, '.trellis', 'manifest.json'), 'utf8')).toContain('"trellis-lite"');
    expect(Math.abs(statSync(skill).mtimeMs - old.getTime())).toBeLessThan(2000);
  });

  it('writes the block with the line endings of an existing CRLF file', () => {
    const root = project();
    write(root, 'AGENTS.md', 'user header\r\nuser body\r\n');
    run(root, ['init', '--codex']);
    const text = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(run(root, ['update']).trim()).toBe('Up to date.');
  });

  it('restores missing managed files and does not change the manifest during update dry-runs', () => {
    const root = project();
    run(root, ['init', '--codex']);
    const missing = path.join(root, '.agents', 'skills', 'trellis-check', 'SKILL.md');
    rmSync(missing);
    const manifestFile = path.join(root, '.trellis', 'manifest.json');
    const before = readFileSync(manifestFile);
    expect(run(root, ['update', '--dry-run'])).toContain('Would: Wrote .agents/skills/trellis-check/SKILL.md');
    expect(existsSync(missing)).toBe(false);
    expect(readFileSync(manifestFile)).toEqual(before);
    run(root, ['update']);
    expect(existsSync(missing)).toBe(true);
  });

  it('replaces an edited managed block only when update is forced', () => {
    const root = project();
    run(root, ['init', '--codex']);
    const agents = path.join(root, 'AGENTS.md');
    writeFileSync(agents, readFileSync(agents, 'utf8').replace('<!-- TRELLIS:END -->', 'edited\n<!-- TRELLIS:END -->'), 'utf8');
    run(root, ['update']);
    expect(readFileSync(agents, 'utf8')).toContain('edited\n<!-- TRELLIS:END -->');
    run(root, ['update', '--force']);
    expect(readFileSync(agents, 'utf8')).not.toContain('edited\n<!-- TRELLIS:END -->');
  });

  it('removes unedited obsolete manifest entries but preserves edited obsolete entries', () => {
    const root = project();
    run(root, ['init', '--codex']);
    const state = manifest(root);
    const obsolete = '.agents/skills/trellis-old/SKILL.md';
    write(root, obsolete, 'old template\n');
    state.files[obsolete] = createHash('sha256').update('old template\n').digest('hex');
    write(root, '.trellis/manifest.json', `${JSON.stringify(state, null, 2)}\n`);
    run(root, ['update']);
    expect(existsSync(path.join(root, ...obsolete.split('/')))).toBe(false);

    write(root, obsolete, 'user old template\n');
    state.files[obsolete] = createHash('sha256').update('old template\n').digest('hex');
    write(root, '.trellis/manifest.json', `${JSON.stringify(state, null, 2)}\n`);
    expect(run(root, ['update'])).toContain(`Kept edited obsolete file: ${obsolete}`);
    expect(existsSync(path.join(root, ...obsolete.split('/')))).toBe(true);
  });

  it('uninstalls unedited content, retains edited content, and purges only when confirmed', () => {
    const root = project();
    run(root, ['init', '--codex']);
    const edited = path.join(root, '.agents', 'skills', 'trellis-plan', 'SKILL.md');
    writeFileSync(edited, 'edited\n', 'utf8');
    expect(run(root, ['uninstall'])).toContain('Kept edited file: .agents/skills/trellis-plan/SKILL.md');
    expect(existsSync(edited)).toBe(true);
    expect(existsSync(path.join(root, '.trellis', 'spec', 'index.md'))).toBe(true);
    expect(run(root, ['uninstall', '--purge'], true)).toContain('--purge requires --yes');
    run(root, ['init', '--codex', '--force']);
    run(root, ['uninstall', '--force', '--purge', '--yes']);
    expect(existsSync(path.join(root, '.trellis'))).toBe(false);
    expect(existsSync(edited)).toBe(false);
  });

  it('creates tasks and lists heading, legacy title fallback, slug fallback, and large task sizes', () => {
    const root = project();
    const first = taskName(run(root, ['task', 'new', 'first-task', '--title', 'First title']));
    const second = taskName(run(root, ['task', 'new', 'legacy-task']));
    const third = taskName(run(root, ['task', 'new', 'slug-fallback']));
    write(root, `.trellis/tasks/${second}/prd.md`, 'no heading\n');
    write(root, `.trellis/tasks/${second}/task.json`, '{"title":"Legacy title"}\n');
    write(root, `.trellis/tasks/${third}/prd.md`, 'no heading\n');
    write(root, `.trellis/tasks/${third}/payload.bin`, 'x'.repeat(5 * 1024 * 1024 + 1));
    const listing = run(root, ['task', 'list']);
    expect(listing).toContain(`${first}  First title`);
    expect(listing).toContain(`${second}  Legacy title`);
    expect(listing).toContain(`${third}  slug-fallback`);
    expect(listing).toContain(`${third}  slug-fallback  `);
    expect(listing).toContain('5.0 MB');
    expect(readFileSync(path.join(root, '.trellis', 'tasks', first, 'prd.md'), 'utf8').startsWith('# First title\n')).toBe(true);
  });

  it('archives unique task suffixes, lists archives with --all, and rejects ambiguous suffixes', () => {
    const root = project();
    const one = taskName(run(root, ['task', 'new', 'same']));
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    utimesSync(path.join(root, '.trellis', 'tasks', one), date, date);
    const two = taskName(run(root, ['task', 'new', 'other-same']));
    expect(run(root, ['task', 'archive', 'same'], true)).toContain('Task name is ambiguous: same');
    const archived = run(root, ['task', 'archive', two]);
    expect(archived).toMatch(new RegExp(`\\.trellis/tasks/archive/\\d{4}-\\d{2}/${two}`));
    expect(run(root, ['task', 'list'])).not.toContain(two);
    const all = run(root, ['task', 'list', '--all']).split('\n');
    expect(all.find(line => line.startsWith(two))).toContain('  archived');
    expect(all.find(line => line.startsWith(one))).not.toContain('archived');
  });

  it('validates task slugs and duplicates, and reports large archive subfolders', () => {
    const root = project();
    expect(run(root, ['task', 'new', 'Invalid'], true)).toContain('Task slug must use lowercase letters, numbers, and dashes');
    const name = taskName(run(root, ['task', 'new', 'default-title']));
    const today = new Date();
    const localPrefix = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}-`;
    expect(name.startsWith(localPrefix)).toBe(true);
    expect(readFileSync(path.join(root, '.trellis', 'tasks', name, 'prd.md'), 'utf8').startsWith('# default title\n')).toBe(true);
    expect(run(root, ['task', 'new', 'default-title'], true)).toContain(`Task already exists: ${name}`);
    write(root, `.trellis/tasks/${name}/largest/a.bin`, 'a'.repeat(4 * 1024 * 1024));
    write(root, `.trellis/tasks/${name}/smaller/b.bin`, 'b'.repeat(2 * 1024 * 1024));
    const archive = run(root, ['task', 'archive', name]);
    expect(archive).toContain(`Warning: ${name} is 6.0 MB; largest subfolders: largest (4.0 MB), smaller (2.0 MB)`);
  });

  it('rejects an archive destination that already exists', () => {
    const root = project();
    const name = taskName(run(root, ['task', 'new', 'collision']));
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    mkdirSync(path.join(root, '.trellis', 'tasks', 'archive', month, name), { recursive: true });
    expect(run(root, ['task', 'archive', name], true)).toContain(`Archived task already exists: ${name}`);
  });

  it('resolves the repository from a nested directory and reports help, errors, version, and empty migration', () => {
    const root = project();
    mkdirSync(path.join(root, 'nested', 'deep'), { recursive: true });
    run(path.join(root, 'nested', 'deep'), ['init', '--codex']);
    expect(existsSync(path.join(root, '.trellis', 'manifest.json'))).toBe(true);
    expect(run(root, ['--help'])).toContain('Usage: trellis');
    expect(run(root, ['init', '--help'])).toContain('Usage: trellis init');
    expect(run(root, ['--version']).trim()).toBe('1.0.0-alpha.0');
    expect(run(root, ['migrate']).trim()).toBe('Nothing to migrate.');
    expect(run(root, ['unknown'], true)).toContain('Error: Unknown command: unknown');
  });

  it('refuses to operate from the home directory', () => {
    expect(run(os.homedir(), ['init', '--codex'], true)).toContain('Refusing to run in the home directory');
  });
});

describe('phase 1 filesystem contracts', () => {
  it('inserts, replaces, and strips only the managed block', () => {
    const exterior = 'before\n\nbody\n';
    const first = putBlock(exterior, blockContent('first'));
    expect(first).toBe('<!-- TRELLIS:START -->\nfirst\n<!-- TRELLIS:END -->\n\nbefore\n\nbody\n');
    const replaced = putBlock(first, blockContent('second'));
    expect(replaced).toBe('<!-- TRELLIS:START -->\nsecond\n<!-- TRELLIS:END -->\n\nbefore\n\nbody\n');
    expect(stripBlock(replaced)).toBe('\n\nbefore\n\nbody\n');
  });

  it('hashes the exact written bytes used by the manifest', () => {
    expect(hash(Buffer.from('same\n'))).toBe(hash('same\n'));
    expect(hash('same\n')).not.toBe(hash('same\r\n'));
  });

  it('resolves a nested project root and normalizes POSIX drive paths on Windows', () => {
    const root = project();
    const nested = path.join(root, 'one', 'two');
    mkdirSync(nested, { recursive: true });
    expect(projectRoot(nested)).toBe(root);
    expect(normalizePath('/d/example')).toBe(process.platform === 'win32' ? 'd:/example' : '/d/example');
    if (process.platform === 'win32') expect(normalizePath('D:\\example')).toBe('D:\\example');
  });

  it('refuses a managed path whose existing ancestor is a symlink', () => {
    const root = project();
    const outside = mkdtempSync(path.join(os.tmpdir(), 'trellis-lite-outside-'));
    roots.push(outside);
    symlinkSync(outside, path.join(root, '.agents'), 'junction');
    expect(() => projectPath(root, '.agents/skills/trellis-plan/SKILL.md')).toThrow('Refusing linked path');
  });

  it('canonicalizes linked project roots before resolving managed paths', () => {
    const root = project();
    const container = project();
    const linked = path.join(container, 'linked-project');
    symlinkSync(root, linked, 'junction');
    expect(projectRoot(linked)).toBe(realpathSync(root));
  });
});
