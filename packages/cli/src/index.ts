#!/usr/bin/env node

import { Command } from 'commander';
import { validateCommand } from './commands/validate.js';
import { packCommand } from './commands/pack.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { searchCommand } from './commands/search.js';
import { infoCommand } from './commands/info.js';
import { installCommand } from './commands/install.js';
import { publishCommand } from './commands/publish.js';
import { listCommand } from './commands/list.js';
import { updateCommand } from './commands/update.js';
import { catCommand } from './commands/cat.js';
import { deprecateCommand } from './commands/deprecate.js';
import { yankCommand } from './commands/yank.js';
import { shareCommand } from './commands/share.js';
import { lockCommand, verifyLockCommand } from './commands/lock.js';
import { auditCommand } from './commands/audit.js';
import { syncCommand } from './commands/sync.js';
import { claimCommand } from './commands/claim.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { inspectCommand } from './commands/inspect.js';
import { isInteractiveOutput, isJsonOutput, printJson } from './utils/output.js';

const program = new Command();
function addInstallTargetOptions(command: Command): Command {
  return command
    .option('-g, --global', 'Install globally')
    .option('-s, --skill <name...>', 'Select specific skill directories from a repo source')
    .option('--list', 'List available skills in a repo source without installing')
    .option('--all', 'Install every discovered skill from a repo source')
    .option('--skip <names>', 'Skip pack skills by name or namespace/name (comma-separated)')
    .option('--only <names>', 'Install only these pack skills by name or namespace/name (comma-separated)')
    .option('--cc', 'Install into Claude Code')
    .option('--claude-code', 'Install into Claude Code')
    .option('--codex', 'Install into Codex')
    .option('--cursor', 'Install into Cursor')
    .option('--amp', 'Install into Amp')
    .option('--windsurf', 'Install into Windsurf')
    .option('--oc', 'Install into OpenCode')
    .option('--opencode', 'Install into OpenCode')
    .option('--cline', 'Install into Cline')
    .option('--roo', 'Install into Roo')
    .option('--openclaw', 'Install into OpenClaw');
}

program
  .name('skilo')
  .description('Share agent skills with a link. No repo required.')
  .version('1.0.19');
program.option('--json', 'Emit machine-readable JSON');

program.showSuggestionAfterError(true);
program.showHelpAfterError('\nRun "skilo --help" for usage.');
program.addHelpText('after', `
Primary commands:
  skilo share ./my-skill
  skilo add https://skilo.xyz/s/abc123
  skilo pack ./skill-a namespace/skill-b https://skilo.xyz/s/abc123 --name "Starter pack"
  skilo sync claude opencode

Agent entrypoints:
  skilo --json
  https://skilo.xyz
  https://skilo.xyz/llms.txt

Compatibility aliases:
  skilo install <source>   same as add
  skilo import <source>    install from GitHub, bundles, URLs, or local paths
`);

// Auth (optional)
program
  .command('login [username]')
  .description('Create or restore a publishing identity')
  .option('--token <apiKey>', 'Use an existing API key')
  .option('--email <email>', 'Set an email while creating a new username')
  .option('--force', 'Replace the current login')
  .action(loginCommand);
program.command('logout').description('Clear saved authentication').action(logoutCommand);
program.command('whoami').description('Show current user').action(whoamiCommand);

// Discovery
program.command('search <query>').description('Search skills').action(searchCommand);
program.command('info <skill>').description('Show skill info').action(infoCommand);
program.command('cat <skill>').description('View skill before installing').action(catCommand);
program
  .command('list')
  .description('List project skills, tool skills, or your published skills')
  .option('--published', 'List skills under your logged-in namespace')
  .option('--tool <tool>', 'List skills discovered in a supported tool')
  .action(listCommand);

// Package management
addInstallTargetOptions(
  program
    .command('add <skill>')
    .description('Add a skill, pack, repo source, or local tool source')
).action((skill, options) => installCommand(skill, options));
addInstallTargetOptions(
  program
    .command('install <skill>')
    .description('Install a skill, pack, repo source, or local tool source')
).action((skill, options) => installCommand(skill, options));
program.command('update <skill>').description('Update a skill').action(updateCommand);

// Import/Export
addInstallTargetOptions(
  program
    .command('import <source>')
    .description('Import from GitHub, .skl, URL, local path, or local tool source')
).action(importCommand);
program
  .command('export [path]')
  .description('Export skill to .skl file')
  .option('-o, --output <file>', 'Output file path')
  .action(exportCommand);
program.command('inspect <skill>').description('Inspect skill without installing').action(inspectCommand);

// Publishing
program
  .command('publish [path]')
  .description('Publish skill (default: .)')
  .option('--sign', 'Sign the skill bundle')
  .option('--listed', 'Make the skill public and searchable')
  .option('--unlisted', 'Keep the skill off search and direct-link only')
  .action(publishCommand);
program.command('unpublish <skill>').description('Remove a skill').action((s) => {
  console.log('Use: skilo yank namespace/name@version to remove specific versions');
});

// Identity (auth required)
program
  .command('claim <skill>')
  .description('Claim an anonymous skill')
  .option('--token <token>', 'Claim token')
  .action(claimCommand);

// Lifecycle (auth required)
program
  .command('deprecate <skill> [message]')
  .description('Mark skill as deprecated')
  .action(deprecateCommand);
program
  .command('yank <skill@version> [reason]')
  .description('Remove a specific version')
  .action(yankCommand);

// Sharing
program
  .command('share <target>')
  .description('Share skills (tool name: claude, codex, cursor, etc. or path/ref)')
  .option('-y, --yes', 'Share all without interactive selection')
  .option('--one-time', 'One-time use link')
  .option('--expires <time>', 'Expires in (e.g., 1h, 2d)')
  .option('--uses <n>', 'Max uses')
  .option('--password', 'Password protect')
  .option('--listed', 'Make locally published share sources public before linking')
  .option('--unlisted', 'Keep locally published share sources off search (default)')
  .action(shareCommand);

// Trust & Ops
program.command('lock').description('Generate lockfile').action(lockCommand);
program.command('verify').description('Verify lockfile').action(verifyLockCommand);
program.command('audit').description('Audit installed skills').action(auditCommand);
addInstallTargetOptions(
  program
    .command('sync [source] [targets...]')
    .description('Sync skills with lockfile or copy skills between tools')
    .option('--force', 'Re-sync regardless of version')
).action((source, targets, options) => syncCommand({ ...options, source, targets }));

// Development / Packs
program.command('init [name]').description('Create new skill').action((name) => initCommand(name));
program.command('validate').description('Validate SKILL.md').action(validateCommand);
program
  .command('pack [sources...]')
  .description('Create a .tgz bundle or a curated shareable pack')
  .option('--name <name>', 'Name for the curated pack')
  .option('--one-time', 'Create one-time share links for generated pack items')
  .option('--expires <time>', 'Expires in (e.g., 1h, 2d)')
  .option('--uses <n>', 'Max uses for generated share links')
  .option('--password', 'Password protect generated share links')
  .option('--listed', 'Make locally published pack sources public before linking')
  .option('--unlisted', 'Keep locally published pack sources off search (default)')
  .action((sources, options) => packCommand(sources, options));

function printMachineWelcome(): void {
  printJson({
    name: 'skilo-cli',
    purpose: 'Share agent skills with a link. No repo required.',
    docs: 'https://skilo.xyz/docs',
    llms: 'https://skilo.xyz/llms.txt',
    website: 'https://skilo.xyz',
    help: 'skilo --help',
    primaryCommands: {
      shareLocal: 'skilo share ./my-skill',
      addLink: 'skilo add https://skilo.xyz/s/abc123',
      addPack: 'skilo add https://skilo.xyz/p/abc123',
      pack: 'skilo pack ./reviewer namespace/design-system --name "Starter pack"',
      syncTools: 'skilo sync claude opencode',
    },
    compatibilityAliases: {
      install: 'skilo install <source>',
      import: 'skilo import <source>',
    },
    acceptedInputs: [
      'share-link',
      'pack-link',
      'registry-ref',
      'github-repo',
      'bundle',
      'local-path',
      'local-tool-source',
    ],
    supportedTargets: [
      'claude-code',
      'codex',
      'cursor',
      'amp',
      'windsurf',
      'opencode',
      'cline',
      'roo',
      'openclaw',
    ],
    installBehavior: {
      explicitFlagsWin: true,
      env: 'SKILO_TARGETS',
      autoDetectsInstalledTools: true,
      nonInteractiveRequiresExplicitTargetWhenMultipleDetected: true,
    },
  });
}

const cliArgs = process.argv.slice(2);
const hasOnlyJsonFlag = cliArgs.length > 0 && cliArgs.every((arg) => arg === '--json');

if (process.argv.length <= 2 || hasOnlyJsonFlag) {
  const run = async () => {
  if (isJsonOutput() || !isInteractiveOutput()) {
    printMachineWelcome();
  } else {
    const { renderWelcomeScreen } = await import('./ui/ink/welcome.js');
    await renderWelcomeScreen();
  }
  process.exit(0);
  };

  await run();
}

program.parse();
