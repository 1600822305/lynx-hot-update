const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const CONFIG_FILE = 'lynx-update.json';

async function statusCommand(options) {
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

  console.log(chalk.cyan('\n📊 Deployment Status\n'));
  console.log(chalk.white('App:     ') + chalk.yellow(config.appName || config.appKey));
  console.log(chalk.white('Server:  ') + chalk.yellow(config.serverUrl));
  console.log('');

  for (const platform of platforms) {
    if (!config.platforms.includes(platform)) {
      continue;
    }

    console.log(chalk.cyan(`━━━ ${platform.toUpperCase()} ━━━`));

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

    // Current version
    const current = releases[0];
    console.log(chalk.white('  Current Version: ') + chalk.green(current.version));
    console.log(chalk.white('  Released:        ') + chalk.gray(formatDate(current.createdAt)));
    console.log(chalk.white('  Rollout:         ') + chalk.gray(`${current.rollout}%`));
    console.log(chalk.white('  Mandatory:       ') + chalk.gray(current.mandatory ? 'Yes' : 'No'));
    console.log(chalk.white('  Size:            ') + chalk.gray(formatSize(current.size)));

    // Recent releases
    if (releases.length > 1) {
      console.log('\n' + chalk.white('  Recent Releases:'));
      releases.slice(0, 5).forEach((release, index) => {
        const marker = index === 0 ? chalk.green('●') : chalk.gray('○');
        const date = formatDate(release.createdAt);
        console.log(`    ${marker} ${release.version} - ${date}`);
      });
    }

    console.log('');
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function formatSize(bytes) {
  if (!bytes) return 'Unknown';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

module.exports = statusCommand;
