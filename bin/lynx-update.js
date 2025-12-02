#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

const initCommand = require('../src/commands/init');
const publishCommand = require('../src/commands/publish');
const rollbackCommand = require('../src/commands/rollback');
const statusCommand = require('../src/commands/status');
const configCommand = require('../src/commands/config');

console.log(chalk.hex('#FF6B6B')(`
╦  ╦ ╦╔╗╔╔═╗  ╦ ╦╔═╗╔╦╗  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗
║  ╚╦╝║║║╠═╣  ╠═╣║ ║ ║   ║ ║╠═╝ ║║╠═╣ ║ ║╣ 
╩═╝ ╩ ╝╚╝╩ ╩  ╩ ╩╚═╝ ╩   ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝
`));
console.log(chalk.gray(`v${pkg.version} - OTA updates for Lynx apps\n`));

program
  .name('lynx-update')
  .description('Hot update solution for Lynx applications')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize hot update in your Lynx project')
  .option('--server <url>', 'Custom update server URL')
  .action(initCommand);

program
  .command('publish')
  .description('Publish a new bundle version')
  .option('-p, --platform <platform>', 'Target platform (android/ios/all)', 'all')
  .option('-v, --version <version>', 'Version number (e.g., 1.0.1)')
  .option('-d, --description <desc>', 'Update description')
  .option('--mandatory', 'Force users to update')
  .option('--rollout <percentage>', 'Gradual rollout percentage (1-100)', '100')
  .action(publishCommand);

program
  .command('rollback')
  .description('Rollback to a previous version')
  .option('-p, --platform <platform>', 'Target platform (android/ios/all)', 'all')
  .option('-v, --version <version>', 'Target version to rollback to')
  .action(rollbackCommand);

program
  .command('status')
  .description('Show current deployment status')
  .option('-p, --platform <platform>', 'Target platform (android/ios/all)', 'all')
  .action(statusCommand);

program
  .command('config')
  .description('Configure update settings')
  .option('--server <url>', 'Set update server URL')
  .option('--key <key>', 'Set deployment key')
  .option('--show', 'Show current configuration')
  .action(configCommand);

program.parse();
