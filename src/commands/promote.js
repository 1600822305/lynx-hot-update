const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const CONFIG_FILE = 'lynx-update.json';

async function promoteCommand(options) {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('✗ Hot update not initialized.'));
    console.log(chalk.gray('  Run "lynx-update init" first.'));
    return;
  }

  const config = await fs.readJson(configPath);
  
  const sourceEnv = options.source || 'staging';
  const targetEnv = options.target || 'production';
  
  const platforms = options.platform === 'all' 
    ? config.platforms 
    : [options.platform];

  console.log(chalk.cyan(`\nPromoting from ${sourceEnv} to ${targetEnv}...`));

  for (const platform of platforms) {
    if (!config.platforms.includes(platform)) {
      console.log(chalk.yellow(`⚠ Platform ${platform} not configured. Skipping...`));
      continue;
    }

    const sourceKey = config.deploymentKeys[platform][sourceEnv];
    const targetKey = config.deploymentKeys[platform][targetEnv];

    if (!sourceKey || !targetKey) {
      console.log(chalk.yellow(`⚠ Missing deployment keys for ${platform}. Skipping...`));
      continue;
    }

    // 获取 staging 的最新发布
    const sourceReleasesDir = path.join(process.cwd(), '.lynx-releases', `${sourceEnv}-${platform}`);
    const sourceReleasesFile = path.join(sourceReleasesDir, 'releases.json');

    if (!fs.existsSync(sourceReleasesFile)) {
      console.log(chalk.yellow(`⚠ No ${sourceEnv} releases found for ${platform}. Skipping...`));
      continue;
    }

    const sourceReleases = await fs.readJson(sourceReleasesFile);
    
    if (sourceReleases.length === 0) {
      console.log(chalk.yellow(`⚠ No releases in ${sourceEnv} for ${platform}. Skipping...`));
      continue;
    }

    const latestRelease = sourceReleases[0];

    // 确认
    if (!options.yes) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Promote ${platform} v${latestRelease.version} from ${sourceEnv} to ${targetEnv}?`,
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.gray(`Skipped ${platform}.`));
        continue;
      }
    }

    const spinner = ora(`Promoting ${platform} v${latestRelease.version}...`).start();

    try {
      // 复制发布到目标环境
      const targetReleasesDir = path.join(process.cwd(), '.lynx-releases', `${targetEnv}-${platform}`);
      await fs.ensureDir(targetReleasesDir);

      const targetReleasesFile = path.join(targetReleasesDir, 'releases.json');
      let targetReleases = [];
      if (fs.existsSync(targetReleasesFile)) {
        targetReleases = await fs.readJson(targetReleasesFile);
      }

      // 创建新的发布记录
      const promotedRelease = {
        ...latestRelease,
        promotedFrom: sourceEnv,
        promotedAt: new Date().toISOString(),
        rollout: options.rollout ? parseInt(options.rollout) : latestRelease.rollout
      };

      targetReleases.unshift(promotedRelease);
      await fs.writeJson(targetReleasesFile, targetReleases, { spaces: 2 });

      spinner.succeed(chalk.green(`Promoted ${platform} v${latestRelease.version} to ${targetEnv}`));

    } catch (error) {
      spinner.fail(chalk.red(`Failed to promote ${platform}`));
      console.error(chalk.gray(`  ${error.message}`));
    }
  }

  console.log('\n' + chalk.green('✓ Promotion complete!'));
}

module.exports = promoteCommand;
