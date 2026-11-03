import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { blockContent, blockHash, blockRange, putBlock, stripBlock } from './blocks.js';
import { fileHash, hash, platforms, readManifest, type Manifest, type Platform } from './manifest.js';
import { projectPath, normalizePath } from './project.js';
import { template, version } from './templates.js';
import { classify, generatedPath, platformFolders, protectedPath, type Catalog } from './legacy/classify.js';
import { scrubStructured } from './legacy/scrubbers.js';

export interface MigrationOptions { dryRun?: boolean; yes?: boolean; backupDir?: string; keepEdited?: boolean }
interface Change { relative: string; before?: string; after?: string; group: 'removed' | 'scrubbed' | 'edited-and-removed' | 'created'; mode?: number }
export interface MigrationPlan { root: string; changes: Change[]; directories: string[]; platforms: Platform[]; unsupported: string[]; kept: string[]; leftovers: string[] }
interface StoredChange { relative: string; beforeHash?: string; afterHash?: string; group: Change['group']; mode?: number }
interface BackupPlan { format: 2; root: string; changes: StoredChange[]; directories: string[]; createdDirectories: string[]; kept: string[]; unsupported: string[]; leftovers: string[] }
const skills = ['trellis-plan', 'trellis-check', 'trellis-handoff', 'trellis-spec'];

/** An orphan lockfile whose only root dependency is the upstream OpenCode plugin. */
function pluginOnlyLock(bytes: Buffer | undefined): boolean {
  try {
    const dependencies = Object.keys(JSON.parse(bytes!.toString()).packages[''].dependencies ?? {});
    return dependencies.length === 1 && dependencies[0] === '@opencode-ai/plugin';
  } catch { return false; }
}

function present(file: string): boolean {
  try { lstatSync(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function safe(root: string, relative: string): string {
  if (!relative || relative.includes('\0') || relative.includes('\\') || relative.includes(':') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`Unsafe project path: ${relative}`);
  // Give actionable diagnostics before the general project path guard.
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (present(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Linked folder ${path.relative(root, current)} links to ${readlinkSync(current)}; migrate the target project instead, or replace the link`);
    }
  }
  return projectPath(root, relative);
}
function walk(root: string, relative: string, files: Map<string, Buffer>, directories: string[], taskSeeds = false, links: string[] = []): void {
  const file = safe(root, relative);
  if (!present(file)) return;
  const stat = lstatSync(file);
  if (stat.isFile()) {
    if (!taskSeeds || /\/(?:implement|check)\.jsonl$/.test(relative)) files.set(relative, readFileSync(file));
    return;
  }
  if (!stat.isDirectory()) return;
  directories.push(relative);
  for (const entry of readdirSync(file, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.name === '.git' && !generatedPath(child)) continue;
    // A retained OpenCode package owns its dependency tree. Inventory it only
    // after the package scrubber has established that the whole package goes.
    if (child === '.opencode/node_modules') continue;
    if (protectedPath(child) && !(taskSeeds && /^\.trellis\/tasks(?:\/|$)/.test(child))) continue;
    // Opaque user links are preserved. A classified link cannot be safely migrated.
    if (entry.isSymbolicLink()) {
      links.push(child);
      if (classify(child, '', {}, { versions: [], paths: {} }).source !== 'unknown') safe(root, child);
      continue;
    }
    walk(root, child, files, directories, taskSeeds, links);
  }
}
function inventory(root: string): Record<string, string> {
  const file = safe(root, '.trellis/.template-hashes.json');
  if (!existsSync(file)) return {};
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid upstream template hashes');
  const object = value as Record<string, unknown>;
  const entries = object.hashes ?? object;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid upstream template hashes');
  const result: Record<string, string> = {};
  for (const [key, digest] of Object.entries(entries)) {
    if (key === '__version') continue;
    const relative = key.replace(/\\/g, '/');
    safe(root, relative);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) throw new Error(`Invalid upstream hash: ${key}`);
    result[relative] = digest;
  }
  return result;
}

export function buildMigrationPlan(root: string, options: MigrationOptions = {}): MigrationPlan {
  root = realpathSync(root);
  for (const folder of ['.trellis', ...platformFolders]) safe(root, folder);
  const previous = readManifest(root);
  const originals = inventory(root);
  const catalog = JSON.parse(readFileSync(new URL('./legacy/catalog.json', import.meta.url), 'utf8')) as Catalog;
  const files = new Map<string, Buffer>();
  const directories: string[] = [];
  const links: string[] = [];
  for (const folder of ['.trellis', ...platformFolders]) walk(root, folder, files, directories, false, links);
  // Task content is read only to identify the two disposable upstream seed files.
  const taskFiles = new Map<string, Buffer>();
  walk(root, '.trellis/tasks', taskFiles, [], true);
  for (const [relative, bytes] of taskFiles) {
    if (!/\/(?:implement|check)\.jsonl$/.test(relative)) continue;
    const lines = bytes.toString().split(/\r?\n/).filter(line => line.trim());
    if (lines.length && lines.every(line => line.includes('_example'))) files.set(relative, bytes);
  }
  for (const relative of new Set(['AGENTS.md', 'CLAUDE.md', ...Object.keys(catalog.paths).filter(p => !p.includes('/')), ...Object.keys(originals)])) {
    if (protectedPath(relative)) continue;
    const file = safe(root, relative);
    if (present(file) && lstatSync(file).isFile()) files.set(relative, readFileSync(file));
  }
  const changes = new Map<string, Change>();
  const editedRemoved = new Set<string>();
  const kept: string[] = [];
  const owned = new Set<string>();
  const litePaths = new Set(Object.keys(previous?.files ?? {}));
  const upstreamEvidence = Object.keys(originals).length > 0 || ['.trellis/.version', '.trellis/scripts', '.trellis/workflow.md'].some(p => present(safe(root, p)))
    || directories.some(p => /^\.trellis\/(?:\.runtime|\.backup-[^/]+)(?:\/|$)/.test(p));
  const put = (relative: string, bytes: Buffer | undefined, group: Change['group']): void => {
    safe(root, relative);
    const before = files.get(relative);
    if ((before === undefined && bytes === undefined) || (before && bytes && (before.equals(bytes) || (litePaths.has(relative) && fileHash(before) === fileHash(bytes))))) { changes.delete(relative); return; }
    changes.set(relative, { relative, before: before?.toString('base64'), after: bytes?.toString('base64'), group: before ? (editedRemoved.has(relative) ? 'edited-and-removed' : group) : 'created', mode: before ? lstatSync(safe(root, relative)).mode : undefined });
  };
  const candidates = [...new Set([...Object.keys(originals), ...Object.keys(catalog.paths)])];
  for (const [relative, bytes] of files) {
    if (previous?.files[relative] && fileHash(bytes) === previous.files[relative]) continue;
    if (litePaths.has(relative) && !upstreamEvidence) continue;
    if (previous?.blocks[relative] && !upstreamEvidence) continue;
    if (relative === '.trellis/manifest.json') continue;
    const classification = classify(relative, bytes, originals, catalog);
    const seed = /^\.trellis\/tasks\/.+\/(?:implement|check)\.jsonl$/.test(relative);
    if (protectedPath(relative) && !seed) continue;
    if (generatedPath(relative)) {
      owned.add(relative);
      put(relative, undefined, 'removed');
      continue;
    }
    if (options.keepEdited && classification.source !== 'unknown' && classification.edited && !seed && !/^\.opencode\/(?:node_modules\/|(?:package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$)/.test(relative)) {
      owned.add(relative);
      kept.push(relative);
      continue;
    }
    const text = bytes.toString();
    // Instruction documents are always block-owned, even if the upstream hash manifest claims the whole file.
    if (relative === 'AGENTS.md' || relative === 'CLAUDE.md' || text.includes('<!-- TRELLIS:START -->')) {
      if (blockRange(text)) {
        const remainder = stripBlock(text);
        put(relative, remainder.trim() || relative === 'AGENTS.md' ? Buffer.from(remainder) : undefined, 'scrubbed');
        owned.add(relative);
      }
      continue;
    }
    const scrubbed = scrubStructured(relative, text, candidates);
    if (scrubbed) {
      if (scrubbed.content !== text || scrubbed.fullyEmpty) {
        put(relative, scrubbed.fullyEmpty ? undefined : Buffer.from(scrubbed.content), 'scrubbed');
        owned.add(relative);
      }
      continue;
    }
    if (classification.source === 'unknown' && !seed) continue;
    owned.add(relative);
    // OpenCode's dependency tree belongs to the package cleanup below, never to an inventory claim.
    if (/^\.opencode\/(?:node_modules\/|(?:package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$)/.test(relative)) continue;
    if (classification.edited && options.keepEdited && !seed) { kept.push(relative); continue; }
    if (classification.edited && !seed) editedRemoved.add(relative);
    put(relative, undefined, classification.edited && !seed ? 'edited-and-removed' : 'removed');
  }
  const packageChange = changes.get('.opencode/package.json');
  if ((packageChange && packageChange.after === undefined) || (!files.has('.opencode/package.json') && pluginOnlyLock(files.get('.opencode/package-lock.json')))) {
    walk(root, '.opencode/node_modules', files, directories, false, links);
    for (const relative of links) if (relative.startsWith('.opencode/node_modules/')) safe(root, relative);
    for (const [relative] of files) {
      if (/^\.opencode\/(?:node_modules\/|(?:package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml)$)/.test(relative)) put(relative, undefined, 'removed');
    }
  }
  const mapping: Record<Platform, string> = { claude: '.claude', codex: '.codex', kimi: '.kimi-code', pi: '.pi', opencode: '.opencode' };
  const selected = platforms.filter(p => previous?.platforms.includes(p) || present(safe(root, mapping[p])) || [...owned].some(relative => relative.startsWith(`${mapping[p]}/`)));
  if (files.has('CLAUDE.md') && !selected.includes('claude')) selected.push('claude');
  const agentsSignal = Boolean(blockRange(files.get('AGENTS.md')?.toString() ?? '')) || [...files.keys()].some(p => /^\.agents\/skills\/trellis-/.test(p) && !litePaths.has(p));
  if (agentsSignal && !selected.some(p => p !== 'claude')) selected.push('codex');
  const unsupported = [...new Set([...owned].map(p => p.split('/')[0]!).filter(p => platformFolders.includes(p) && p !== '.agents' && !Object.values(mapping).includes(p)))].sort();
  if (previous && !upstreamEvidence && !changes.size) return { root, changes: [], directories, platforms: previous.platforms, unsupported: [], kept, leftovers: [] };
  if (!owned.size && !changes.size && !upstreamEvidence) return { root, changes: [], directories, platforms: [], unsupported, kept, leftovers: [] };
  if (!selected.length) selected.push('codex');
  const selectedPlatforms = platforms.filter(p => selected.includes(p) || previous?.platforms.includes(p));
  const manifest: Manifest = { tool: 'trellis-lite', version, platforms: selectedPlatforms, files: {}, blocks: {} };
  const currentText = (relative: string): string => {
    const change = changes.get(relative);
    return change ? (change.after ? Buffer.from(change.after, 'base64').toString() : '') : (files.get(relative)?.toString() ?? '');
  };
  const targets = new Set(selectedPlatforms.map(p => p === 'claude' ? 'claude' : 'agents'));
  for (const target of targets) {
    for (const skill of skills) {
      const relative = `.${target}/skills/${skill}/SKILL.md`;
      if (kept.includes(relative)) continue;
      const content = template(`skills/${skill}/SKILL.md`);
      // Preserve unrelated files occupying a Lite destination.
      if (files.has(relative) && !owned.has(relative) && !previous?.files[relative]) { kept.push(relative); continue; }
      put(relative, Buffer.from(content), 'scrubbed');
      manifest.files[relative] = fileHash(content);
    }
    const relative = target === 'agents' || /^@AGENTS\.md\r?$/m.test(currentText('CLAUDE.md')) ? 'AGENTS.md' : 'CLAUDE.md';
    if (kept.includes(relative)) continue;
    const content = blockContent(template('block.md'));
    put(relative, Buffer.from(putBlock(files.get(relative)?.toString() ?? '', content)), 'scrubbed');
    manifest.blocks[relative] = blockHash(content);
  }
  put('.trellis/manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), 'created');
  const finalFiles = new Map(files);
  for (const change of changes.values()) {
    if (change.after === undefined) finalFiles.delete(change.relative);
    else finalFiles.set(change.relative, Buffer.from(change.after, 'base64'));
  }
  const removedHooks = [...changes.values()].filter(c => c.after === undefined && /\/hooks\//.test(c.relative)).map(c => c.relative);
  const leftovers = [...finalFiles].filter(([relative, bytes]) => {
    if (!platformFolders.includes(relative.split('/')[0]!) && relative !== 'AGENTS.md' && relative !== 'CLAUDE.md') return false;
    const text = bytes.toString().replace(/\\/g, '/');
    return /\.trellis\/scripts|\btask\.py\b|\badd_session\.py\b/.test(text) || removedHooks.some(p => text.includes(p));
  }).map(([relative]) => relative).sort();
  return { root, changes: [...changes.values()].sort((a, b) => a.relative.localeCompare(b.relative)), directories, platforms: selectedPlatforms, unsupported, kept: kept.sort(), leftovers };
}

export function migrationReport(plan: MigrationPlan): string[] {
  if (!plan.changes.length) return ['Nothing to migrate.'];
  const lines = [`Platforms: ${plan.platforms.join(', ') || '(none supported)'}`];
  for (const group of ['removed', 'scrubbed', 'edited-and-removed', 'kept', 'created'] as const) {
    const entries = group === 'kept' ? plan.kept : plan.changes.filter(c => c.group === group).map(c => c.relative);
    const counts = new Map<string, number>();
    for (const relative of entries) { const folder = relative.includes('/') ? relative.split('/')[0]! : '(root)'; counts.set(folder, (counts.get(folder) ?? 0) + 1); }
    lines.push(`${group}: ${entries.length}${entries.length ? ` (${[...counts].map(([p, n]) => `${p}: ${n}`).join(', ')})` : ''}`);
    if (group === 'edited-and-removed' || group === 'kept') lines.push(...reportPaths(entries));
  }
  if (plan.changes.some(c => c.group === 'edited-and-removed')) lines.push('You had edited these; copies are in the backup.');
  for (const folder of plan.unsupported.slice(0, 10)) lines.push(`${folder}: removed, not supported by Trellis Lite`);
  if (plan.unsupported.length > 10) lines.push(reportOverflow(plan.unsupported.length - 10));
  lines.push(`Leftover references: ${plan.leftovers.length}`, ...reportPaths(plan.leftovers));
  return lines;
}

function reportOverflow(count: number): string {
  return `  ... and ${count} more (full list in the backup's plan.json)`;
}
function reportPaths(paths: string[]): string[] {
  return [...paths.slice(0, 10).map(p => `  ${p}`), ...(paths.length > 10 ? [reportOverflow(paths.length - 10)] : [])];
}

function atomicWrite(file: string, bytes: Buffer | string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  let created = false;
  try { writeFileSync(temporary, bytes, { flag: 'wx' }); created = true; renameSync(temporary, file); }
  finally { if (created && present(temporary)) rmSync(temporary); }
}
function externalBackup(root: string, requested: string): string {
  const destination = path.resolve(normalizePath(requested));
  let ancestor = destination;
  while (!present(ancestor)) ancestor = path.dirname(ancestor);
  const canonical = path.resolve(realpathSync(ancestor), path.relative(ancestor, destination));
  const relative = path.relative(root, canonical);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Backup directory must be outside the project');
  return canonical;
}
function assertUnchanged(plan: MigrationPlan): void {
  for (const change of plan.changes) {
    const file = safe(plan.root, change.relative);
    const actual = present(file) ? readFileSync(file).toString('base64') : undefined;
    if (actual !== change.before) throw new Error(`Project changed since planning: ${change.relative}`);
  }
}
export function executeMigration(plan: MigrationPlan, backupDir?: string): string {
  const parent = externalBackup(plan.root, backupDir ?? path.join(homedir(), '.trellis-lite', 'backups', `${path.basename(plan.root)}-${hash(plan.root).slice(0, 8)}`));
  assertUnchanged(plan);
  mkdirSync(parent, { recursive: true });
  const backup = path.join(parent, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  mkdirSync(backup);
  const createdDirectories = new Set<string>();
  for (const change of plan.changes) {
    if (change.after === undefined) continue;
    let relative = path.posix.dirname(change.relative);
    while (relative !== '.') {
      if (!present(safe(plan.root, relative))) createdDirectories.add(relative);
      relative = path.posix.dirname(relative);
    }
  }
  for (const change of plan.changes) {
    if (change.before === undefined) continue;
    const original = Buffer.from(change.before, 'base64');
    atomicWrite(path.join(backup, 'files', change.relative), original);
  }
  const storedChanges: StoredChange[] = plan.changes.map(change => ({
    relative: change.relative, group: change.group, mode: change.mode,
    beforeHash: change.before === undefined ? undefined : hash(Buffer.from(change.before, 'base64')),
    afterHash: change.after === undefined ? undefined : hash(Buffer.from(change.after, 'base64')),
  }));
  const record: BackupPlan = { format: 2, root: plan.root, changes: storedChanges, directories: plan.directories, createdDirectories: [...createdDirectories], kept: plan.kept, unsupported: plan.unsupported, leftovers: plan.leftovers };
  atomicWrite(path.join(backup, 'plan.json'), JSON.stringify(record, null, 2) + '\n');
  // The complete backup is durable before the first project mutation.
  for (const change of plan.changes) {
    const file = safe(plan.root, change.relative);
    if (change.after === undefined) rmSync(file);
    else { atomicWrite(file, Buffer.from(change.after, 'base64')); if (change.mode !== undefined) chmodSync(file, change.mode); }
  }
  for (const relative of [...plan.directories].sort((a, b) => b.length - a.length)) {
    const directory = safe(plan.root, relative);
    if (present(directory) && !readdirSync(directory).length && !protectedPath(relative)) rmdirSync(directory);
  }
  return backup;
}

export function restoreMigration(root: string, requested: string): string[] {
  root = realpathSync(root);
  const backup = externalBackup(root, requested);
  const record = JSON.parse(readFileSync(path.join(backup, 'plan.json'), 'utf8')) as BackupPlan;
  if (record.format !== 2 || record.root !== root || !Array.isArray(record.changes) || !Array.isArray(record.directories) || !Array.isArray(record.createdDirectories)) throw new Error('Invalid backup or backup belongs to a different project');
  // Validate the entire record and original hashes before touching the project.
  const originals = new Map<string, Buffer>();
  for (const change of record.changes) {
    safe(root, change.relative);
    const file = safe(root, change.relative);
    if (present(file) && !lstatSync(file).isFile()) throw new Error(`Restore destination is not a file: ${change.relative}`);
    for (const digest of [change.beforeHash, change.afterHash]) if (digest !== undefined && !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid backup hash: ${change.relative}`);
    if (change.beforeHash !== undefined) {
      const bytes = readFileSync(safe(path.join(backup, 'files'), change.relative));
      if (hash(bytes) !== change.beforeHash) throw new Error(`Backup hash mismatch: ${change.relative}`);
      originals.set(change.relative, bytes);
    }
    const current = present(file) ? hash(readFileSync(file)) : undefined;
    if (current !== change.afterHash && current !== change.beforeHash) throw new Error(`Restore would overwrite a later edit: ${change.relative}`);
  }
  for (const directory of [...record.directories, ...record.createdDirectories]) safe(root, directory);
  for (const change of record.changes) {
    const file = safe(root, change.relative);
    if (change.beforeHash === undefined) rmSync(file, { force: true });
    else { atomicWrite(file, originals.get(change.relative)!); if (change.mode !== undefined) chmodSync(file, change.mode); }
  }
  for (const relative of [...record.createdDirectories].sort((a, b) => b.length - a.length)) {
    const directory = safe(root, relative);
    if (present(directory) && !readdirSync(directory).length) rmdirSync(directory);
  }
  for (const relative of record.directories) mkdirSync(safe(root, relative), { recursive: true });
  for (const [relative, bytes] of originals) if (hash(readFileSync(safe(root, relative))) !== hash(bytes)) throw new Error(`Restore verification failed: ${relative}`);
  return [`Restored ${record.changes.length} files from ${backup}`];
}

export async function migrate(root: string, options: MigrationOptions = {}): Promise<string[]> {
  const plan = buildMigrationPlan(root, options);
  if (plan.changes.length && options.backupDir) externalBackup(plan.root, options.backupDir);
  const report = migrationReport(plan);
  if (!plan.changes.length || options.dryRun) return report;
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Migration requires --yes without a TTY; use --dry-run to review');
    console.log(report.join('\n'));
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { if (!/^y(?:es)?$/i.test((await prompt.question('Apply this migration? [y/N] ')).trim())) return ['Migration cancelled.']; }
    finally { prompt.close(); }
  }
  const backup = executeMigration(plan, options.backupDir);
  return [...report, `Backup: ${backup}`];
}
