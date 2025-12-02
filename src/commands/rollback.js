const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const CONFIG_FILE = 'lynx-update.json';

async function rollbackCommand(options) {
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

  for (const platform of platforms) {
    if (!config.platforms.includes(platform)) {
      console.log(chalk.yellow(`⚠ Platform ${platform} not configured. Skipping...`));
      continue;
    }

    const releasesDir = path.join(process.cwd(), '.lynx-releases', platform);
    const releasesFile = path.join(releasesDir, 'releases.json');

    if (!fs.existsSync(releasesFile)) {
      console.log(chalk.yellow(`⚠ No releases found for ${platform}.`));
      continue;
    }

    const releases = await fs.readJson(releasesFile);
    
    if (releases.length < 2) {
      console.log(chalk.yellow(`⚠ No previous version to rollback to for ${platform}.`));
      continue;
    }

    let targetVersion = options.version;
    
    if (!targetVersion) {
      // Show available versions
      const choices = releases.slice(1).map((r, i) => ({
        name: `${r.version} (${new Date(r.createdAt).toLocaleString()})`,
        value: r.version
      }));

      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'version',
        message: `Select version to rollback to (${platform}):`,
        choices
      }]);
      
      targetVersion = answer.version;
    }

    const spinner = ora(`Rolling back ${platform} to ${targetVersion}...`).start();

    try {
      const targetRelease = releases.find(r => r.version === targetVersion);
      
      if (!targetRelease) {
        spinner.fail(chalk.red(`Version ${targetVersion} not found for ${platform}`));
        continue;
      }

      // Move target release to top (make it current)
      const newReleases = [
        { ...targetRelease, rolledBackAt: new Date().toISOString() },
        ...releases.filter(r => r.version !== targetVersion)
      ];
      
      await fs.writeJson(releasesFile, newReleases, { spaces: 2 });

      spinner.succeed(chalk.green(`Rolled back ${platform} to ${targetVersion}`));

    } catch (error) {
      spinner.fail(chalk.red(`Failed to rollback ${platform}`));
      console.error(chalk.gray(`  ${error.message}`));
    }
  }

  console.log('\n' + chalk.green('✓ Rollback complete!'));
  console.log(chalk.gray('  Users will receive the previous version on next app launch.'));
}

module.exports = rollbackCommand;
