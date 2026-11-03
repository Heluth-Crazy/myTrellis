import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { projectPath } from './project.js';
import { template } from './templates.js';

const TASKS_DIR = '.trellis/tasks';
const LARGE_TASK_BYTES = 5 * 1024 * 1024;

interface TaskEntry {
  name: string;
  directory: string;
  modified: Date;
  bytes: number;
}

function localDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function taskDirectory(root: string): string {
  const directory = projectPath(root, TASKS_DIR);
  if (existsSync(directory) && !lstatSync(directory).isDirectory()) {
    throw new Error(`${TASKS_DIR} is not a directory`);
  }
  return directory;
}

function ensureTaskDirectory(root: string): string {
  const directory = taskDirectory(root);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function activeTasks(root: string): TaskEntry[] {
  const directory = taskDirectory(root);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'archive')
    .map(entry => {
      const task = path.join(directory, entry.name);
      const info = statSync(task);
      return { name: entry.name, directory: task, modified: info.mtime, bytes: directorySize(task) };
    });
}

function archivedTasks(root: string): TaskEntry[] {
  const directory = projectPath(root, `${TASKS_DIR}/archive`);
  if (!existsSync(directory)) return [];
  const result: TaskEntry[] = [];
  for (const month of readdirSync(directory, { withFileTypes: true })) {
    if (!month.isDirectory()) continue;
    const monthDirectory = path.join(directory, month.name);
    for (const entry of readdirSync(monthDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const task = path.join(monthDirectory, entry.name);
      const info = statSync(task);
      result.push({ name: entry.name, directory: task, modified: info.mtime, bytes: directorySize(task) });
    }
  }
  return result;
}

function directorySize(directory: string): number {
  let bytes = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += directorySize(child);
    else if (entry.isFile()) bytes += statSync(child).size;
  }
  return bytes;
}

function taskTitle(entry: TaskEntry): string {
  const prd = path.join(entry.directory, 'prd.md');
  if (existsSync(prd) && lstatSync(prd).isFile()) {
    const heading = /^# (.+)$/m.exec(readFileSync(prd, 'utf8'));
    if (heading?.[1]?.trim()) return oneLine(heading[1]);
  }

  const taskJson = path.join(entry.directory, 'task.json');
  if (existsSync(taskJson) && lstatSync(taskJson).isFile()) {
    try {
      const value: unknown = JSON.parse(readFileSync(taskJson, 'utf8'));
      if (value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string') {
        return oneLine((value as { title: string }).title);
      }
    } catch {
      // An upstream task.json is optional metadata; use the slug if it is malformed.
    }
  }
  return entry.name.replace(/^\d{2}-\d{2}-/, '');
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function taskRelativePath(root: string, directory: string): string {
  return path.relative(root, directory).split(path.sep).join('/');
}

export function taskNew(root: string, slug: string, title?: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('Task slug must use lowercase letters, numbers, and dashes');
  }
  ensureTaskDirectory(root);
  const name = `${localDate().slice(5)}-${slug}`;
  const relative = `${TASKS_DIR}/${name}`;
  const directory = projectPath(root, relative);
  if (existsSync(directory)) throw new Error(`Task already exists: ${name}`);

  mkdirSync(directory);
  const defaultTitle = slug.replaceAll('-', ' ');
  const taskTitle = title ? oneLine(title) || defaultTitle : defaultTitle;
  writeFileSync(path.join(directory, 'prd.md'), template('task-prd.md').replace('{{TITLE}}', () => taskTitle), 'utf8');
  return taskRelativePath(root, directory);
}

export function taskList(root: string, all = false): string[] {
  const archived = all ? new Set(archivedTasks(root)) : new Set<TaskEntry>();
  const tasks = [...activeTasks(root), ...archived];
  return tasks
    .sort((a, b) => b.modified.getTime() - a.modified.getTime() || a.name.localeCompare(b.name))
    .map(entry => `${entry.name}  ${taskTitle(entry)}  ${localDate(entry.modified)}${archived.has(entry) ? '  archived' : ''}${entry.bytes > LARGE_TASK_BYTES ? `  (${formatSize(entry.bytes)})` : ''}`);
}

function largestSubdirectories(directory: string): Array<{ name: string; bytes: number }> {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, bytes: directorySize(path.join(directory, entry.name)) }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, 3);
}

export function taskArchive(root: string, name: string): string[] {
  const active = activeTasks(root);
  const exact = active.filter(task => task.name === name);
  const candidates = exact.length ? exact : active.filter(task => task.name.endsWith(`-${name}`));
  if (candidates.length === 0) throw new Error(`No active task matches: ${name}`);
  if (candidates.length > 1) throw new Error(`Task name is ambiguous: ${name}`);
  const task = candidates[0]!;
  const archiveMonth = localDate().slice(0, 7);
  const archive = projectPath(root, `${TASKS_DIR}/archive/${archiveMonth}`);
  mkdirSync(archive, { recursive: true });
  const destination = path.join(archive, task.name);
  if (existsSync(destination)) throw new Error(`Archived task already exists: ${task.name}`);

  const result = [taskRelativePath(root, destination)];
  if (task.bytes > LARGE_TASK_BYTES) {
    const largest = largestSubdirectories(task.directory)
      .filter(entry => entry.bytes > 0)
      .map(entry => `${entry.name} (${formatSize(entry.bytes)})`);
    result.push(`Warning: ${task.name} is ${formatSize(task.bytes)}${largest.length ? `; largest subfolders: ${largest.join(', ')}` : ''}`);
  }
  renameSync(task.directory, destination);
  return result;
}
