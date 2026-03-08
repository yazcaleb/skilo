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

const program = new Command();

program
  .name('skilo')
  .description('npm-like registry for Agent Skills')
  .version('1.0.1');

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
program
  .command('add <skill>')
  .description('Add a skill (alias for install)')
  .option('-g, --global', 'Install globally')
  .action((skill, options) => installCommand(skill, options));
program
  .command('install <skill>')
  .description('Install a skill')
  .option('-g, --global', 'Install globally')
  .action((skill, options) => installCommand(skill, options));
program.command('update <skill>').description('Update a skill').action(updateCommand);

// Import/Export
program
  .command('import <source>')
  .description('Import from GitHub, .skl, URL, or local path')
  .option('-g, --global', 'Install globally')
  .action(importCommand);
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
  .command('share <skill>')
  .description('Create shareable link')
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

program.parse();
