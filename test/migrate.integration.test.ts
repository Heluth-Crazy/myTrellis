import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, unlinkSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMigrationPlan, executeMigration, restoreMigration, type MigrationPlan } from '../src/migrate.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(repository, 'bin', 'trellis.js');
const fixtureRoot = process.env.TL_FIXTURES ? path.join(process.env.TL_FIXTURES, 'fixtures') : '';
const catalog = JSON.parse(readFileSync(path.join(repository, 'src', 'legacy', 'catalog.json'), 'utf8')) as { paths: Record<string, string[]> };
const allPlatformFolders = ['.claude', '.agents', '.codex', '.kimi-code', '.pi', '.opencode', '.cursor', '.kilocode', '.kiro', '.gemini', '.agent', '.devin', '.windsurf', '.qoder', '.codebuddy', '.github', '.factory', '.dsh', '.reasonix', '.zcode', '.trae', '.omp', '.grok', '.snow', '.iflow'];
const roots: string[] = [];
const backups: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const backup of backups.splice(0)) rmSync(backup, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trellis-lite-migrate-'));
  mkdirSync(path.join(root, '.git'));
  roots.push(root);
  return root;
}

function copyProject(source: string): string {
  const root = project();
  cpSync(source, root, { recursive: true, force: true, filter: from => path.basename(from) !== '.git' });
  mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function backupDir(): string {
  // This directory is outside the project and is removed by this test's teardown.
  const backup = mkdtempSync(path.join(os.tmpdir(), 'trellis-lite-backup-'));
  backups.push(backup);
  return backup;
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

function backupFrom(output: string): string {
  const match = /^Backup: (.+)$/m.exec(output);
  expect(match).toBeTruthy();
  return match![1]!;
}

function withoutBackup(output: string): string {
  return output.replace(/^Backup: .+\r?\n?/m, '');
}

function write(root: string, relative: string, content: string): void {
  const file = path.join(root, ...relative.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

/** Byte snapshot for the restore contract. `.git` is test scaffolding, not project content. */
function snapshot(root: string, relative = ''): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  const directory = path.join(root, relative);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!relative && entry.name === '.git') continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of snapshot(root, child)) result.set(name, bytes);
    } else if (entry.isSymbolicLink()) {
      result.set(child, Buffer.from(`link:${readlinkSync(full)}`));
    } else if (entry.isFile()) {
      result.set(child, readFileSync(full));
    }
  }
  return result;
}

function expectSnapshot(root: string, expected: Map<string, Buffer>): void {
  expectBytes(snapshot(root), expected);
}

function expectBytes(actual: Map<string, Buffer>, expected: Map<string, Buffer>): void {
  expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
  for (const [relative, bytes] of expected) expect(actual.get(relative)?.equals(bytes), relative).toBe(true);
}

function snapshotHashes(root: string): Map<string, string> {
  return new Map([...snapshot(root)].map(([relative, bytes]) => [relative, createHash('sha256').update(bytes).digest('hex')]));
}

function expectNoLegacyReferences(root: string): void {
  const configDirs = ['.agent', '.agents', '.claude', '.codex', '.cursor', '.gemini', '.github', '.opencode', '.pi'];
  for (const directory of configDirs) {
    const full = path.join(root, directory);
    if (!existsSync(full)) continue;
    for (const [relative, bytes] of snapshot(full)) {
      const text = bytes.toString('utf8');
      expect(text, `${directory}/${relative}`).not.toMatch(/\.trellis\/scripts|task\.py|add_session\.py/);
    }
  }
}

function protectedSnapshot(root: string): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const relative of ['.trellis/spec', '.trellis/tasks', '.trellis/workspace']) {
    const full = path.join(root, relative);
    if (!existsSync(full)) continue;
    for (const [name, bytes] of snapshot(full)) {
      if (/^\.trellis\/tasks\/.+\/(?:implement|check)\.jsonl$/.test(`${relative}/${name}`) && bytes.toString().split(/\r?\n/).filter(Boolean).every(line => line.includes('_example'))) continue;
      result.set(`${relative}/${name}`, bytes);
    }
  }
  return result;
}

function normalizedHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes.toString().replace(/\r\n/g, '\n').replace(/python3 /g, 'python ')).digest('hex');
}

function expectedPlatforms(original: Map<string, Buffer>): string[] {
  const folders: Record<string, string> = { claude: '.claude', codex: '.codex', kimi: '.kimi-code', pi: '.pi', opencode: '.opencode' };
  const detected = new Set(Object.entries(folders)
    .filter(([, folder]) => [...original.keys()].some(relative => relative === folder || relative.startsWith(`${folder}/`)))
    .map(([platform]) => platform));
  if (original.has('CLAUDE.md')) detected.add('claude');
  const agentsSignal = /<!-- TRELLIS:START -->[\s\S]*<!-- TRELLIS:END -->/.test(original.get('AGENTS.md')?.toString() ?? '')
    || [...original.keys()].some(relative => /^\.agents\/skills\/trellis-[^/]+\/SKILL\.md$/.test(relative));
  if (agentsSignal && !['codex', 'kimi', 'pi', 'opencode'].some(platform => detected.has(platform))) detected.add('codex');
  return Object.keys(folders).filter(platform => detected.has(platform));
}

function expectNoOriginalCatalogFile(root: string, original: Map<string, Buffer>): void {
  const after = snapshot(root);
  for (const [relative, bytes] of original) {
    if (/^\.trellis\/(?:spec|tasks|workspace)\//.test(relative)) continue;
    if (!catalog.paths[relative]?.includes(normalizedHash(bytes))) continue;
    expect(after.get(relative)?.equals(bytes), `legacy catalog file survived unchanged: ${relative}`).not.toBe(true);
  }
}

function virtualFiles(original: Map<string, Buffer>, plan: MigrationPlan): Map<string, Buffer> {
  const result = new Map(original);
  for (const change of plan.changes) {
    if (change.after === undefined) result.delete(change.relative);
    else result.set(change.relative, Buffer.from(change.after, 'base64'));
  }
  return result;
}

function expectVirtualPlan(root: string, original: Map<string, Buffer>, plan: MigrationPlan, expected: string[]): void {
  const final = virtualFiles(original, plan);
  const manifest = JSON.parse(final.get('.trellis/manifest.json')?.toString() ?? '') as { platforms: string[] };
  expect(manifest.platforms).toEqual(expected);
  for (const [relative, bytes] of protectedSnapshot(root)) expect(final.get(relative)?.equals(bytes), relative).toBe(true);
  for (const [relative, bytes] of original) {
    if (/^\.trellis\/(?:spec|tasks|workspace)\//.test(relative)) continue;
    if (!catalog.paths[relative]?.includes(normalizedHash(bytes))) continue;
    expect(final.get(relative)?.equals(bytes), `legacy catalog file survived unchanged: ${relative}`).not.toBe(true);
  }
  for (const [relative, bytes] of final) {
    if (!allPlatformFolders.includes(relative.split('/')[0]!) && relative !== 'AGENTS.md' && relative !== 'CLAUDE.md') continue;
    expect(bytes.toString(), relative).not.toMatch(/\.trellis\/scripts|\btask\.py\b|\badd_session\.py\b/);
  }
  for (const platform of expected) {
    const target = platform === 'claude' ? '.claude' : '.agents';
    for (const skill of ['trellis-plan', 'trellis-check', 'trellis-handoff', 'trellis-spec']) {
      const installed = final.get(`${target}/skills/${skill}/SKILL.md`);
      expect(installed?.toString(), `${target}/${skill}`).toBe(readFileSync(path.join(repository, 'templates', 'skills', skill, 'SKILL.md'), 'utf8'));
    }
  }
}

function virtualContent(plan: MigrationPlan, original: Map<string, Buffer>, relative: string): string | undefined {
  const change = plan.changes.find(entry => entry.relative === relative);
  if (change) return change.after === undefined ? undefined : Buffer.from(change.after, 'base64').toString();
  return original.get(relative)?.toString();
}

// Planning walks are independent and read-only. Bound native workers to three
// so the full cached-version matrix stays practical on Windows without losing
// any path validation or whole-tree plan assertions.
let planningWorkers = 0;
const planningWaiters: Array<() => void> = [];
async function cachedPlan(root: string): Promise<MigrationPlan> {
  if (planningWorkers < 3) planningWorkers++;
  else await new Promise<void>(resolve => planningWaiters.push(resolve));
  try {
    return await new Promise<MigrationPlan>((resolve, reject) => {
      const worker = new Worker(new URL('./helpers/plan-worker.mjs', import.meta.url), {
        workerData: { root, module: new URL('../dist/migrate.js', import.meta.url).href },
      });
      let result: MigrationPlan | undefined;
      worker.once('message', plan => { result = plan as MigrationPlan; });
      worker.once('error', reject);
      worker.once('exit', code => {
        if (code === 0 && result) resolve(result);
        else reject(new Error(`Fixture planner exited with code ${code}`));
      });
    });
  } finally {
    const next = planningWaiters.shift();
    if (next) next();
    else planningWorkers--;
  }
}

describe('trellis migrate handwritten fixtures', () => {
  const handwritten = path.join(repository, 'test', 'fixtures', 'migrate-handwritten');

  it('removes legacy content, preserves user entries, protects user trees, and restores exact bytes', () => {
    const root = copyProject(handwritten);
    const original = snapshot(root);
    const protectedBefore = protectedSnapshot(root);
    const backup = backupDir();
    const dry = run(root, ['migrate', '--dry-run', '--backup-dir', backup]);
    expectSnapshot(root, original);
    const applied = run(root, ['migrate', '--yes', '--backup-dir', backup]);
    const saved = backupFrom(applied);
    expect(dry).toBe(withoutBackup(applied));
    expect(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).toContain('user-hook');
    expect(readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).toContain('USER_SETTING');
    expect(readFileSync(path.join(root, '.codex', 'hooks.json'), 'utf8')).toContain('user-hook');
    expect(readFileSync(path.join(root, '.pi', 'settings.json'), 'utf8')).toContain('./extensions/user.ts');
    expect(readFileSync(path.join(root, '.opencode', 'package.json'), 'utf8')).toContain('user-plugin');
    const agents = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('User instructions.');
    expect(agents).toContain('Keep this line.');
    expect(agents).toContain('<!-- TRELLIS:START -->');
    expectBytes(protectedSnapshot(root), protectedBefore);
    expect(existsSync(path.join(root, '.trellis', 'scripts'))).toBe(false);
    expect(existsSync(path.join(root, '.agents', 'skills', 'trellis-custom'))).toBe(false);
    expect(existsSync(path.join(root, '.github', 'copilot-instructions.md'))).toBe(false);
    expectNoLegacyReferences(root);
    expect(run(root, ['migrate', '--yes', '--backup-dir', backup])).toMatch(/nothing to migrate/i);
    run(root, ['migrate', '--restore', saved]);
    expectSnapshot(root, original);
  });

  it('migrates own files around linked Lite folders, is idempotent, and restores exact bytes', () => {
    const shared = project();
    run(shared, ['init', '--codex']);
    const root = project();
    symlinkSync(path.join(shared, '.trellis'), path.join(root, '.trellis'), 'junction');
    symlinkSync(path.join(shared, '.agents'), path.join(root, '.agents'), 'junction');
    write(root, 'AGENTS.md', 'Project notes.\n<!-- TRELLIS:START -->\nlegacy\n<!-- TRELLIS:END -->\n');
    write(root, '.cursor/settings.json', '{"hooks":{"before":"python .trellis/scripts/task.py"}}\n');
    const original = snapshot(root);
    const sharedBefore = snapshot(shared);
    const backup = backupDir();

    const dry = run(root, ['migrate', '--dry-run', '--backup-dir', backup]);
    expect(dry).toContain(`shared: .trellis -> ${path.join(shared, '.trellis')}`);
    expect(dry).toContain(`shared: .agents -> ${path.join(shared, '.agents')}`);
    expectSnapshot(root, original);
    const applied = run(root, ['migrate', '--yes', '--backup-dir', backup]);
    const saved = backupFrom(applied);
    expect(withoutBackup(applied)).toBe(dry);
    expect(lstatSync(path.join(root, '.trellis')).isSymbolicLink()).toBe(true);
    expect(lstatSync(path.join(root, '.agents')).isSymbolicLink()).toBe(true);
    expect(existsSync(path.join(root, '.trellis', 'manifest.json'))).toBe(true);
    expectSnapshot(shared, sharedBefore);
    expect(readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('<!-- TRELLIS:START -->');
    expect(run(root, ['migrate', '--yes', '--backup-dir', backup])).toMatch(/nothing to migrate/i);
    run(root, ['migrate', '--restore', saved]);
    expectSnapshot(root, original);
    expectSnapshot(shared, sharedBefore);
  });

  it('refuses nested links where upstream wrote files and an unmigrated linked .trellis before mutation', () => {
    const root = project();
    const outside = project();
    write(root, '.trellis/scripts/task.py', 'legacy');
    mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
    symlinkSync(outside, path.join(root, '.agents', 'skills', 'trellis-start'), 'junction');
    const before = snapshot(root);
    const output = run(root, ['migrate', '--yes', '--backup-dir', backupDir()], true);
    expect(output).toMatch(/link|junction|target project/i);
    expectSnapshot(root, before);

    // A nested link of the user's own is preserved.
    unlinkSync(path.join(root, '.agents', 'skills', 'trellis-start'));
    symlinkSync(outside, path.join(root, '.agents', 'shared'), 'junction');
    run(root, ['migrate', '--yes', '--backup-dir', backupDir()]);
    expect(lstatSync(path.join(root, '.agents', 'shared')).isSymbolicLink()).toBe(true);
    expect(existsSync(path.join(root, '.trellis', 'scripts'))).toBe(false);

    const linked = project();
    mkdirSync(path.join(outside, '.trellis'), { recursive: true });
    symlinkSync(path.join(outside, '.trellis'), path.join(linked, '.trellis'), 'junction');
    expect(run(linked, ['migrate', '--yes', '--backup-dir', backupDir()], true)).toContain(`.trellis links to ${path.join(outside, '.trellis')}; migrate that project first`);
  });

  it('refuses manifest claims that escape the project and a backup inside it', () => {
    const root = project();
    write(root, '.trellis/.template-hashes.json', JSON.stringify({ '../outside.txt': '0'.repeat(64) }));
    const before = snapshot(root);
    const output = run(root, ['migrate', '--yes', '--backup-dir', path.join(root, 'backup')], true);
    expect(output).toMatch(/backup.*outside|outside.*project|invalid.*path|unsafe.*path/i);
    expectSnapshot(root, before);
  });

  it('refuses a backup directory inside the project before mutation', () => {
    const root = copyProject(handwritten);
    const before = snapshot(root);
    expect(run(root, ['migrate', '--dry-run', '--backup-dir', path.join(root, 'backup')], true)).toMatch(/outside the project/i);
    const output = run(root, ['migrate', '--yes', '--backup-dir', path.join(root, 'backup')], true);
    expect(output).toMatch(/backup.*outside/i);
    expectSnapshot(root, before);
  });

  it('keeps edited upstream paths when requested and restores created Lite files', () => {
    const root = copyProject(handwritten);
    write(root, '.agents/skills/trellis-custom/SKILL.md', 'user edit\n');
    const original = snapshot(root);
    const output = run(root, ['migrate', '--yes', '--keep-edited', '--backup-dir', backupDir()]);
    const saved = backupFrom(output);
    expect(output).toContain('kept:');
    expect(readFileSync(path.join(root, '.agents', 'skills', 'trellis-custom', 'SKILL.md'), 'utf8')).toBe('user edit\n');
    run(root, ['migrate', '--restore', saved]);
    expectSnapshot(root, original);
  });

  it('recognizes an already-Lite project as a no-op', () => {
    const root = project();
    run(root, ['init', '--codex']);
    const before = snapshot(root);
    expect(run(root, ['migrate', '--yes', '--backup-dir', backupDir()])).toMatch(/nothing to migrate/i);
    expectSnapshot(root, before);
  });

  it('selects Codex when an AGENTS block is the only agents-target signal', () => {
    const root = project();
    write(root, '.trellis/scripts/task.py', 'legacy\n');
    write(root, 'AGENTS.md', 'User instructions.\n<!-- TRELLIS:START -->\nlegacy\n<!-- TRELLIS:END -->\n');
    const original = snapshot(root);
    const plan = buildMigrationPlan(root);
    expect(plan.platforms).toEqual(['codex']);
    expect(virtualContent(plan, original, 'AGENTS.md')).toContain('<!-- TRELLIS:START -->');
    expect(virtualContent(plan, original, '.agents/skills/trellis-plan/SKILL.md')).toBe(readFileSync(path.join(repository, 'templates', 'skills', 'trellis-plan', 'SKILL.md'), 'utf8'));
  });

  it('detects Claude and OpenCode while preserving their user skills', () => {
    const root = project();
    write(root, '.trellis/.version', '0.6.17\n');
    write(root, 'CLAUDE.md', 'Project instructions.\n');
    write(root, '.claude/skills/user-tool/SKILL.md', 'user Claude skill\n');
    write(root, '.agents/skills/trellis-plan/SKILL.md', 'upstream Trellis skill\n');
    write(root, '.opencode/package.json', JSON.stringify({ dependencies: { '@mindfoldhq/trellis': '0.6.17' } }));
    const original = snapshot(root);
    const plan = buildMigrationPlan(root);
    expect(plan.platforms).toEqual(['claude', 'opencode']);
    expect(virtualContent(plan, original, '.claude/skills/user-tool/SKILL.md')).toBe('user Claude skill\n');
    expect(virtualContent(plan, original, '.agents/skills/trellis-plan/SKILL.md')).toBe(readFileSync(path.join(repository, 'templates', 'skills', 'trellis-plan', 'SKILL.md'), 'utf8'));
  });
});

const cachedVersions = fixtureRoot && existsSync(fixtureRoot)
  ? readdirSync(fixtureRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  : [];

if (!cachedVersions.length) console.info('Skipping cached upstream migration fixtures: set TL_FIXTURES to a cache containing fixtures/.');

describe.skipIf(!cachedVersions.length)('trellis migrate cached upstream fixtures', () => {
  const roundTripVersions = ['0.3.10', '0.6.0-beta.23', '0.6.17'].filter(version => cachedVersions.includes(version));
  const planOnlyVersions = cachedVersions.filter(version => !roundTripVersions.includes(version));

  it.each(roundTripVersions)('migrates upstream %s, is idempotent, and restores it byte-for-byte', version => {
    const root = copyProject(path.join(fixtureRoot, version));
    const original = snapshot(root);
    const originalHashes = new Map([...original].map(([relative, bytes]) => [relative, createHash('sha256').update(bytes).digest('hex')]));
    const expected = expectedPlatforms(original);
    const protectedBefore = protectedSnapshot(root);
    const backup = backupDir();
    const saved = executeMigration(buildMigrationPlan(root), backup);
    expectBytes(protectedSnapshot(root), protectedBefore);
    const state = JSON.parse(readFileSync(path.join(root, '.trellis', 'manifest.json'), 'utf8')) as { platforms: string[] };
    expect(state.platforms).toEqual(expected);
    for (const platform of expected) {
      const target = platform === 'claude' ? '.claude' : '.agents';
      for (const skill of ['trellis-plan', 'trellis-check', 'trellis-handoff', 'trellis-spec']) {
        const installed = path.join(root, target, 'skills', skill, 'SKILL.md');
        expect(readFileSync(installed, 'utf8')).toBe(readFileSync(path.join(repository, 'templates', 'skills', skill, 'SKILL.md'), 'utf8'));
      }
    }
    expectNoOriginalCatalogFile(root, original);
    expectNoLegacyReferences(root);
    for (const folder of allPlatformFolders) {
      const full = path.join(root, folder);
      if (existsSync(full)) for (const [relative, bytes] of snapshot(full)) expect(bytes.toString(), `${folder}/${relative}`).not.toMatch(/\.trellis\/scripts|task\.py|add_session\.py/);
    }
    expect(buildMigrationPlan(root).changes).toEqual([]);
    restoreMigration(root, saved);
    expect(snapshotHashes(root)).toEqual(originalHashes);
  }, 120_000);

  it.concurrent.each(planOnlyVersions)('plans a complete migration for upstream %s', async version => {
    const root = path.join(fixtureRoot, version);
    const original = snapshot(root);
    const expected = expectedPlatforms(original);
    expectVirtualPlan(root, original, await cachedPlan(root), expected);
  }, 90_000);
});

describe.skipIf(cachedVersions.length > 0)('trellis migrate cached upstream fixtures (set TL_FIXTURES to enable)', () => {
  it.skip('external fixture cache unavailable; set TL_FIXTURES to enable', () => {});
});
