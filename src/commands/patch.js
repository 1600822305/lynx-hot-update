const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');

const CONFIG_FILE = 'lynx-update.json';

/**
 * 修改已发布版本的元数据
 * 支持: 禁用/启用、修改灰度比例、修改强制更新标记
 */
async function patchCommand(version, options) {
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

  // 构建更新数据
  const patchData = {};
  
  if (options.disabled !== undefined) {
    patchData.disabled = options.disabled === 'true' || options.disabled === true;
  }
  if (options.rollout !== undefined) {
    patchData.rollout = parseInt(options.rollout);
  }
  if (options.mandatory !== undefined) {
    patchData.mandatory = options.mandatory === 'true' || options.mandatory === true;
  }
  if (options.description !== undefined) {
    patchData.description = options.description;
  }
  if (options.targetBinaryVersion !== undefined) {
    patchData.targetBinaryVersion = options.targetBinaryVersion;
  }

  if (Object.keys(patchData).length === 0) {
    console.log(chalk.yellow('⚠ No changes specified.'));
    console.log(chalk.gray('  Use --disabled, --rollout, --mandatory, --description, or --target-binary-version'));
    return;
  }

  console.log(chalk.cyan(`\nPatching version ${version}...`));
  console.log(chalk.gray(`Changes: ${JSON.stringify(patchData)}`));

  for (const platform of platforms) {
    if (!config.platforms.includes(platform)) {
      console.log(chalk.yellow(`⚠ Platform ${platform} not configured. Skipping...`));
      continue;
    }

    const spinner = ora(`Patching ${platform}...`).start();

    try {
      // 本地模式
      const releasesDir = path.join(process.cwd(), '.lynx-releases', platform);
      const releasesFile = path.join(releasesDir, 'releases.json');

      if (!fs.existsSync(releasesFile)) {
        spinner.warn(chalk.yellow(`No releases found for ${platform}`));
        continue;
      }

      const releases = await fs.readJson(releasesFile);
      const releaseIndex = releases.findIndex(r => r.version === version);

      if (releaseIndex === -1) {
        spinner.warn(chalk.yellow(`Version ${version} not found for ${platform}`));
        continue;
      }

      // 应用更新
      const release = releases[releaseIndex];
      Object.assign(release, patchData);
      release.patchedAt = new Date().toISOString();

      await fs.writeJson(releasesFile, releases, { spaces: 2 });

      spinner.succeed(chalk.green(`Patched ${platform} v${version}`));

      // 显示更新后的状态
      console.log(chalk.gray(`  Disabled: ${release.disabled ? 'Yes' : 'No'}`));
      console.log(chalk.gray(`  Rollout: ${release.rollout}%`));
      console.log(chalk.gray(`  Mandatory: ${release.mandatory ? 'Yes' : 'No'}`));

      // 如果配置了远程服务器，也更新远程
      if (config.serverType !== 'self-hosted' && config.serverUrl) {
        try {
          const deploymentKey = config.deploymentKeys[platform].production;
          await axios.patch(
            `${config.serverUrl}/api/releases/${deploymentKey}/${platform}/${version}`,
            patchData,
            { headers: { 'X-Deployment-Key': deploymentKey } }
          );
          console.log(chalk.gray(`  Remote server updated`));
        } catch (e) {
          console.log(chalk.yellow(`  Warning: Failed to update remote server`));
        }
      }

    } catch (error) {
      spinner.fail(chalk.red(`Failed to patch ${platform}`));
      console.error(chalk.gray(`  ${error.message}`));
    }
  }

  console.log('\n' + chalk.green('✓ Patch complete!'));
}

module.exports = patchCommand;
