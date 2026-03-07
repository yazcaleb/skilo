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

const program = new Command();

program
  .name('skilo')
  .description('npm-like registry for Agent Skills')
  .version('1.0.0');

// Auth (optional - unlocks publish)
program.command('login').description('Login to publish skills').action(loginCommand);
program.command('logout').description('Logout').action(() => {
  console.log('Logged out');
});
program.command('whoami').description('Show current user').action(whoamiCommand);

// Discovery (no auth needed)
program.command('search <query>').description('Search skills').action(searchCommand);
program.command('info <skill>').description('Show skill info').action(infoCommand);
program.command('cat <skill>').description('View skill README before installing').action(catCommand);
program.command('list').description('List installed skills').action(listCommand);

// Package management (no auth needed for add)
program
  .command('add <skill>')
  .description('Add a skill (alias: skilo add skillname)')
  .option('-g, --global', 'Install globally')
  .action((skill, options) => installCommand(skill, options));
program
  .command('install <skill>')
  .description('Install a skill')
  .option('-g, --global', 'Install globally')
  .action((skill, options) => installCommand(skill, options));
program
  .command('update <skill>')
  .description('Update a skill')
  .action(updateCommand);

// Publishing (auth required)
program
  .command('publish [path]')
  .description('Publish skill from dir (default: .)')
  .action((path) => publishCommand(path));

// Development
program
  .command('init [name]')
  .description('Create new skill template')
  .action((name) => initCommand(name));
program
  .command('validate')
  .description('Validate SKILL.md')
  .action(validateCommand);
program.command('pack').description('Create .tgz bundle').action(packCommand);

program.parse();