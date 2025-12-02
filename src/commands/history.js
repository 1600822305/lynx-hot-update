const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const CONFIG_FILE = 'lynx-update.json';

async function historyCommand(options) {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('✗ Hot update not initialized.'));
    console.log(chalk.gray('  Run "lynx-update init" first.'));
    return;
  }

  const config = await fs.readJson(configPath);
  const platforms = options.platform === 'all' 
    ? config.platforms 
    : [options.platform];

  const limit = options.limit || 10;

  for (const platform of platforms) {
    if (!config.platforms.includes(platform)) {
      continue;
    }

    console.log(chalk.cyan(`\n━━━ ${platform.toUpperCase()} Release History ━━━\n`));

    const releasesDir = path.join(process.cwd(), '.lynx-releases', platform);
    const releasesFile = path.join(releasesDir, 'releases.json');

    if (!fs.existsSync(releasesFile)) {
      console.log(chalk.gray('  No releases yet.\n'));
      continue;
    }

    const releases = await fs.readJson(releasesFile);
    
    if (releases.length === 0) {
      console.log(chalk.gray('  No releases yet.\n'));
      continue;
    }

    // 表头
    console.log(
      chalk.white.bold('  Label'.padEnd(10)) +
      chalk.white.bold('Version'.padEnd(12)) +
      chalk.white.bold('Rollout'.padEnd(10)) +
      chalk.white.bold('Mandatory'.padEnd(12)) +
      chalk.white.bold('Disabled'.padEnd(10)) +
      chalk.white.bold('Released')
    );
    console.log(chalk.gray('  ' + '─'.repeat(70)));

    releases.slice(0, limit).forEach((release, index) => {
      const label = `v${index + 1}`;
      const version = release.version;
      const rollout = `${release.rollout}%`;
      const mandatory = release.mandatory ? 'Yes' : 'No';
      const disabled = release.disabled ? chalk.red('Yes') : chalk.green('No');
      const date = formatDate(release.createdAt);

      const labelColor = index === 0 ? chalk.green : chalk.gray;
      
      console.log(
        '  ' +
        labelColor(label.padEnd(10)) +
        chalk.white(version.padEnd(12)) +
        chalk.cyan(rollout.padEnd(10)) +
        (release.mandatory ? chalk.yellow(mandatory.padEnd(12)) : chalk.gray(mandatory.padEnd(12))) +
        disabled.padEnd(10) +
        chalk.gray(date)
      );

      // 显示描述
      if (release.description && options.verbose) {
        console.log(chalk.gray(`           ${release.description}`));
      }
    });

    if (releases.length > limit) {
      console.log(chalk.gray(`\n  ... and ${releases.length - limit} more releases`));
    }

    // 统计信息
    console.log('\n' + chalk.white('  Statistics:'));
    console.log(chalk.gray(`    Total releases: ${releases.length}`));
    
    const activeReleases = releases.filter(r => !r.disabled).length;
    console.log(chalk.gray(`    Active releases: ${activeReleases}`));
    
    const mandatoryReleases = releases.filter(r => r.mandatory).length;
    console.log(chalk.gray(`    Mandatory releases: ${mandatoryReleases}`));
  }

  console.log('');
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

module.exports = historyCommand;
