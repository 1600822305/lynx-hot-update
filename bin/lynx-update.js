#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

const initCommand = require('../src/commands/init');
const publishCommand = require('../src/commands/publish');
const rollbackCommand = require('../src/commands/rollback');
const statusCommand = require('../src/commands/status');
const configCommand = require('../src/commands/config');
const serverCommand = require('../src/commands/server');
const promoteCommand = require('../src/commands/promote');
const patchCommand = require('../src/commands/patch');
const historyCommand = require('../src/commands/history');

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

program
  .command('server')
  .description('Start the hot update server')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-d, --data <dir>', 'Data directory')
  .action(serverCommand);

program
  .command('promote')
  .description('Promote release from staging to production')
  .option('-p, --platform <platform>', 'Target platform (android/ios/all)', 'all')
  .option('-s, --source <env>', 'Source environment', 'staging')
  .option('-t, --target <env>', 'Target environment', 'production')
  .option('--rollout <percentage>', 'Rollout percentage for promoted release')
  .option('-y, --yes', 'Skip confirmation')
  .action(promoteCommand);

program
  .command('patch <version>')
  .description('Modify release metadata')
  .option('-p, --platform <platform>', 'Target platform (android/ios/all)', 'all')
  .option('--disabled <bool>', 'Disable/enable release (true/false)')
  .option('--rollout <percentage>', 'Update rollout percentage')
  .option('--mandatory <bool>', 'Set mandatory flag (true/false)')
  .option('-d, --description <desc>', 'Update description')
  .option('--target-binary-version <range>', 'Update target binary version')
  .action(patchCommand);

program
  .command('history')
  .description('Show release history')
  .option('-p, --platform <platform>', 'Target platform (android/ios/all)', 'all')
  .option('-n, --limit <number>', 'Number of releases to show', '10')
  .option('-v, --verbose', 'Show descriptions')
  .action(historyCommand);

program.parse();
