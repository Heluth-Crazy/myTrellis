import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { blockContent, blockHash, blockRange, putBlock, stripBlock } from './blocks.js';
import { hash, platforms, readManifest, type Manifest, type Platform } from './manifest.js';
import { projectPath } from './project.js';
import { template, version } from './templates.js';

interface Options { force?: boolean; dryRun?: boolean }
interface Operation { relative: string; content?: string }
const skills = ['trellis-plan', 'trellis-check', 'trellis-handoff', 'trellis-spec'];

function read(root: string, relative: string): string {
  const file = projectPath(root, relative);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function desired(root: string, selected: Platform[]): { files: Record<string, string>; blocks: Record<string, string> } {
  const files: Record<string, string> = {};
  const blocks: Record<string, string> = {};
  const targets = new Set(selected.map(p => p === 'claude' ? 'claude' : 'agents'));
  for (const target of targets) {
    for (const skill of skills) files[`.${target}/skills/${skill}/SKILL.md`] = template(`skills/${skill}/SKILL.md`);
    const importsAgents = /^@AGENTS\.md\r?$/m.test(read(root, 'CLAUDE.md'));
    blocks[target === 'agents' || importsAgents ? 'AGENTS.md' : 'CLAUDE.md'] = blockContent(template('block.md'));
  }
  return { files, blocks };
}

function prune(root: string, relative: string): void {
  let parent = path.posix.dirname(relative);
  while (parent !== '.') {
    const directory = projectPath(root, parent);
    if (!existsSync(directory) || readdirSync(directory).length) break;
    rmdirSync(directory);
    parent = path.posix.dirname(parent);
  }
}

function execute(root: string, operations: Operation[], dryRun = false): void {
  // Validate all paths before the first write, including manifest-controlled ones.
  for (const op of operations) projectPath(root, op.relative);
  if (dryRun) return;
  for (const op of operations) {
    const file = projectPath(root, op.relative);
    if (op.content === undefined) { rmSync(file, { force: true }); prune(root, op.relative); }
    else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, op.content, 'utf8'); }
  }
}

function sync(root: string, selected: Platform[], previous: Manifest | undefined, options: Options, initialize: boolean): string[] {
  const next: Manifest = { tool: 'trellis-lite', version, platforms: selected, files: { ...previous?.files }, blocks: { ...previous?.blocks } };
  const current = desired(root, selected);
  const operations: Operation[] = [];
  const messages: string[] = [];
  for (const [relative, content] of Object.entries(current.files)) {
    const file = projectPath(root, relative);
    const exists = existsSync(file);
    const oldHash = previous?.files[relative];
    if (exists && hash(readFileSync(file)) === hash(content)) { next.files[relative] = hash(content); continue; }
    if (exists && !options.force && (!oldHash || hash(readFileSync(file)) !== oldHash)) {
      messages.push(`Kept ${oldHash ? 'edited' : 'unmanaged'} file: ${relative}`);
      continue;
    }
    operations.push({ relative, content });
    next.files[relative] = hash(content);
    messages.push(`Wrote ${relative}`);
  }
  for (const [relative, content] of Object.entries(current.blocks)) {
    const text = read(root, relative);
    const range = blockRange(text);
    const oldHash = previous?.blocks[relative];
    if (range && blockHash(range.content) === blockHash(content)) { next.blocks[relative] = blockHash(content); continue; }
    if (range && !options.force && (!oldHash || blockHash(range.content) !== oldHash)) {
      messages.push(`Kept ${oldHash ? 'edited' : 'unmanaged'} block: ${relative}`);
      continue;
    }
    operations.push({ relative, content: putBlock(text, content) });
    next.blocks[relative] = blockHash(content);
    messages.push(`Wrote block: ${relative}`);
  }
  for (const [relative, digest] of Object.entries(previous?.files ?? {})) {
    if (relative in current.files) continue;
    const file = projectPath(root, relative);
    if (existsSync(file) && hash(readFileSync(file)) !== digest && !options.force) {
      messages.push(`Kept edited obsolete file: ${relative}`);
      continue;
    }
    operations.push({ relative });
    delete next.files[relative];
    messages.push(`Removed obsolete file: ${relative}`);
  }
  for (const [relative, digest] of Object.entries(previous?.blocks ?? {})) {
    if (relative in current.blocks) continue;
    const text = read(root, relative);
    const range = blockRange(text);
    if (range && blockHash(range.content) !== digest && !options.force) {
      messages.push(`Kept edited obsolete block: ${relative}`);
      continue;
    }
    const remainder = stripBlock(text);
    operations.push({ relative, content: remainder.trim() ? remainder : undefined });
    delete next.blocks[relative];
    messages.push(`Removed obsolete block: ${relative}`);
  }
  if (initialize && !existsSync(projectPath(root, '.trellis/spec/index.md'))) {
    operations.push({ relative: '.trellis/spec/index.md', content: template('spec-index.md') });
  }
  if (initialize) projectPath(root, '.trellis/tasks');
  operations.push({ relative: '.trellis/manifest.json', content: JSON.stringify(next, null, 2) + '\n' });
  execute(root, operations, options.dryRun);
  if (initialize && !options.dryRun) mkdirSync(projectPath(root, '.trellis/tasks'), { recursive: true });
  if (!messages.length) return ['Up to date.'];
  return options.dryRun ? messages.map(m => `Would: ${m}`) : messages;
}

export function init(root: string, requested: Platform[], force = false): string[] {
  const previous = readManifest(root);
  if (!previous && ['.trellis/.version', '.trellis/scripts', '.trellis/workflow.md'].some(p => existsSync(projectPath(root, p)))) {
    throw new Error('Upstream Trellis detected; run trellis migrate');
  }
  let selected = requested;
  if (!selected.length) {
    const dirs: Record<Platform, string> = { claude: '.claude', codex: '.codex', kimi: '.kimi-code', pi: '.pi', opencode: '.opencode' };
    selected = platforms.filter(p => existsSync(projectPath(root, dirs[p])));
    if (!selected.length) selected = [...platforms];
  }
  selected = platforms.filter(p => selected.includes(p) || previous?.platforms.includes(p));
  const messages = [`Platforms: ${selected.join(', ')}. Choose with --claude --codex --kimi --pi --opencode.`, ...sync(root, selected, previous, { force }, true)];
  if (selected.includes('pi')) messages.push('Pi loads project skills only after the folder is trusted.');
  return messages;
}

export function update(root: string, options: Options = {}): string[] {
  const previous = readManifest(root);
  if (!previous) throw new Error('No Lite manifest; run trellis init first');
  return sync(root, previous.platforms, previous, options, false);
}

export function uninstall(root: string, options: { force?: boolean; purge?: boolean; yes?: boolean } = {}): string[] {
  if (options.purge && !options.yes) throw new Error('--purge requires --yes');
  const previous = readManifest(root);
  if (!previous) throw new Error('No Lite manifest; run trellis init first');
  const operations: Operation[] = [];
  const messages: string[] = [];
  for (const [relative, digest] of Object.entries(previous.files)) {
    const file = projectPath(root, relative);
    if (existsSync(file) && hash(readFileSync(file)) !== digest && !options.force) {
      messages.push(`Kept edited file: ${relative}`);
    } else { operations.push({ relative }); messages.push(`Removed ${relative}`); }
  }
  for (const [relative, digest] of Object.entries(previous.blocks)) {
    const text = read(root, relative);
    const range = blockRange(text);
    if (range && blockHash(range.content) !== digest && !options.force) {
      messages.push(`Kept edited block: ${relative}`);
      continue;
    }
    const remainder = stripBlock(text);
    operations.push({ relative, content: remainder.trim() ? remainder : undefined });
    messages.push(`Removed block: ${relative}`);
  }
  operations.push({ relative: '.trellis/manifest.json' });
  execute(root, operations);
  if (options.purge) rmSync(projectPath(root, '.trellis'), { recursive: true, force: true });
  messages.push(options.purge ? 'Purged .trellis/' : 'Kept .trellis/spec/ and .trellis/tasks/');
  return messages;
}
