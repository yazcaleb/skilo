#!/usr/bin/env node

import { Command } from 'commander';
import { validateCommand } from './commands/validate.js';
import { packCommand } from './commands/pack.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
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
import { blankLine, isInteractiveOutput, isJsonOutput, printJson, printPrimary, printSection } from './utils/output.js';

const program = new Command();
function addInstallTargetOptions(command: Command): Command {
  return command
    .option('-g, --global', 'Install globally')
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
  .description('Tiny sharing layer for agent skills')
  .version('1.0.10');
program.option('--json', 'Emit machine-readable JSON');

program.showSuggestionAfterError(true);
program.showHelpAfterError('\nRun "skilo --help" for usage.');
program.addHelpText('after', `
Quick start:
  skilo share ./my-skill
  skilo add https://skilo.xyz/s/abc123 --cc
  skilo add namespace/skill-name --codex
  skilo inspect namespace/skill-name

Agent entrypoints:
  https://skilo.xyz/llms.txt
  skilo --help
`);

// Auth (optional)
program.command('login').description('Login to publish skills').action(loginCommand);
program.command('logout').description('Logout').action(() => console.log('Logged out'));
program.command('whoami').description('Show current user').action(whoamiCommand);

// Discovery
program.command('search <query>').description('Search skills').action(searchCommand);
program.command('info <skill>').description('Show skill info').action(infoCommand);
program.command('cat <skill>').description('View skill before installing').action(catCommand);
program.command('list').description('List installed skills').action(listCommand);

// Package management
addInstallTargetOptions(
  program
    .command('add <skill>')
    .description('Add a skill (alias for install)')
).action((skill, options) => installCommand(skill, options));
addInstallTargetOptions(
  program
    .command('install <skill>')
    .description('Install a skill')
).action((skill, options) => installCommand(skill, options));
program.command('update <skill>').description('Update a skill').action(updateCommand);

// Import/Export
addInstallTargetOptions(
  program
    .command('import <source>')
    .description('Import from GitHub, .skl, URL, or local path')
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
  .action(shareCommand);

// Trust & Ops
program.command('lock').description('Generate lockfile').action(lockCommand);
program.command('verify').description('Verify lockfile').action(verifyLockCommand);
program.command('audit').description('Audit installed skills').action(auditCommand);
program.command('sync').description('Sync skills with lockfile').action(syncCommand);

// Development
program.command('init [name]').description('Create new skill').action((name) => initCommand(name));
program.command('validate').description('Validate SKILL.md').action(validateCommand);
program.command('pack').description('Create .tgz bundle').action(packCommand);

function printInteractiveWelcome(): void {
  printSection('Skilo');
  printPrimary('Share, install, inspect, and publish agent skills.');
  blankLine();

  printSection('Most common');
  printPrimary('  Share a local skill');
  printPrimary('    skilo share ./my-skill');
  printPrimary('  Install from a Skilo link');
  printPrimary('    skilo add https://skilo.xyz/s/abc123 --cc');
  printPrimary('  Install from the registry');
  printPrimary('    skilo add namespace/skill-name --codex');
  printPrimary('  Review before installing');
  printPrimary('    skilo inspect namespace/skill-name');
  blankLine();

  printSection('Works with');
  printPrimary('  Claude Code, Codex, Cursor, Amp, Windsurf, OpenCode, Cline, Roo, OpenClaw');
  blankLine();

  printSection('Start as an agent');
  printPrimary('  Read https://skilo.xyz/llms.txt');
  printPrimary('  Or run skilo --help for the full command surface');
  blankLine();

  printSection('Docs');
  printPrimary('  https://skilo.xyz');
  printPrimary('  https://skilo.xyz/docs');
}

function printMachineWelcome(): void {
  printJson({
    name: 'skilo-cli',
    purpose: 'Share, install, inspect, and publish agent skills.',
    docs: 'https://skilo.xyz/docs',
    llms: 'https://skilo.xyz/llms.txt',
    help: 'skilo --help',
    examples: {
      shareLocal: 'skilo share ./my-skill',
      installLink: 'skilo add https://skilo.xyz/s/abc123 --cc',
      installRef: 'skilo add namespace/skill-name --codex',
      inspect: 'skilo inspect namespace/skill-name',
    },
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
  });
}

const cliArgs = process.argv.slice(2);
const hasOnlyJsonFlag = cliArgs.length > 0 && cliArgs.every((arg) => arg === '--json');

if (process.argv.length <= 2 || hasOnlyJsonFlag) {
  if (isJsonOutput() || !isInteractiveOutput()) {
    printMachineWelcome();
  } else {
    printInteractiveWelcome();
  }
  process.exit(0);
}

program.parse();
