import { parseArgs } from 'node:util';
import { init, uninstall, update } from './install.js';
import { platforms, type Platform } from './manifest.js';
import { projectRoot } from './project.js';
import { taskArchive, taskList, taskNew } from './tasks.js';
import { version } from './templates.js';
import { migrate, restoreMigration } from './migrate.js';

const help: Record<string, string> = {
  root: 'Usage: trellis <command> [options]\nCommands: init, update, uninstall, task new|list|archive, migrate\nOptions: --help, --version',
  init: 'Usage: trellis init [--claude] [--codex] [--kimi] [--pi] [--opencode] [--force]',
  update: 'Usage: trellis update [--force] [--dry-run]',
  uninstall: 'Usage: trellis uninstall [--purge] [--force] [--yes]',
  task: 'Usage: trellis task new <slug> [--title <text>] | list [--all] | archive <name>',
  migrate: 'Usage: trellis migrate [--dry-run] [--yes] [--keep-edited] [--backup-dir <path>] | --restore <backup>',
};

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    const command = args[0];
    if (!command || command === '--help' || command === '-h') { console.log(help.root); return; }
    if (command === '--version' || command === '-v') { console.log(version); return; }
    if (!(command in help) || command === 'root') throw new Error(`Unknown command: ${command}`);
    if (args.includes('--help') || args.includes('-h')) { console.log(help[command]); return; }
    const specs: Record<string, Record<string, { type: 'boolean' | 'string' }>> = {
      init: Object.fromEntries([...platforms, 'force'].map(p => [p, { type: 'boolean' as const }])),
      update: { force: { type: 'boolean' }, 'dry-run': { type: 'boolean' } },
      uninstall: { force: { type: 'boolean' }, purge: { type: 'boolean' }, yes: { type: 'boolean' } },
      task: { title: { type: 'string' }, all: { type: 'boolean' } },
      migrate: { 'dry-run': { type: 'boolean' }, yes: { type: 'boolean' }, 'keep-edited': { type: 'boolean' }, 'backup-dir': { type: 'string' }, restore: { type: 'string' } },
    };
    const { values, positionals } = parseArgs({ args: args.slice(1), options: specs[command]!, allowPositionals: true, strict: true });
    const root = projectRoot();
    let output: string[];
    if (command === 'task') {
      const [action, name] = positionals;
      if (action === 'new' && name && positionals.length === 2 && !values.all) output = [taskNew(root, name, values.title as string | undefined)];
      else if (action === 'list' && positionals.length === 1 && values.title === undefined) output = taskList(root, Boolean(values.all));
      else if (action === 'archive' && name && positionals.length === 2 && values.title === undefined && !values.all) output = taskArchive(root, name);
      else throw new Error(help.task);
    } else {
      if (positionals.length) throw new Error(`Unexpected argument: ${positionals[0]}`);
      switch (command) {
        case 'init': output = init(root, platforms.filter(p => values[p]) as Platform[], Boolean(values.force)); break;
        case 'update': output = update(root, { force: Boolean(values.force), dryRun: Boolean(values['dry-run']) }); break;
        case 'uninstall': output = uninstall(root, { force: Boolean(values.force), purge: Boolean(values.purge), yes: Boolean(values.yes) }); break;
        case 'migrate':
          if (values.restore && Object.keys(values).length !== 1) throw new Error('--restore cannot be combined with migration options');
          output = values.restore ? restoreMigration(root, values.restore as string) : await migrate(root, { dryRun: Boolean(values['dry-run']), yes: Boolean(values.yes), keepEdited: Boolean(values['keep-edited']), backupDir: values['backup-dir'] as string | undefined });
          break;
        default: throw new Error(`Unknown command: ${command}`);
      }
    }
    if (output.length) console.log(output.join('\n'));
  } catch (error) {
    console.error(`Error: ${(error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ')}`);
    process.exitCode = 1;
  }
}
