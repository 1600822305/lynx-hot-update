const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

const CONFIG_FILE = 'lynx-update.json';

async function configCommand(options) {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('✗ Hot update not initialized.'));
    console.log(chalk.gray('  Run "lynx-update init" first.'));
    return;
  }

  const config = await fs.readJson(configPath);

  // Show current config
  if (options.show || (!options.server && !options.key)) {
    console.log(chalk.cyan('\n📋 Current Configuration\n'));
    console.log(chalk.white('App Key:      ') + chalk.yellow(config.appKey));
    console.log(chalk.white('App Name:     ') + chalk.yellow(config.appName || 'N/A'));
    console.log(chalk.white('Server Type:  ') + chalk.yellow(config.serverType));
    console.log(chalk.white('Server URL:   ') + chalk.yellow(config.serverUrl));
    console.log(chalk.white('Platforms:    ') + chalk.yellow(config.platforms.join(', ')));
    console.log(chalk.white('Bundle Name:  ') + chalk.yellow(config.bundleName));
    console.log(chalk.white('Dist Dir:     ') + chalk.yellow(config.distDir));
    
    console.log('\n' + chalk.cyan('Deployment Keys:'));
    for (const platform of config.platforms) {
      console.log(chalk.white(`  ${platform}:`));
      console.log(chalk.gray(`    Staging:    ${config.deploymentKeys[platform].staging}`));
      console.log(chalk.gray(`    Production: ${config.deploymentKeys[platform].production}`));
    }
    return;
  }

  let updated = false;

  // Update server URL
  if (options.server) {
    config.serverUrl = options.server;
    console.log(chalk.green(`✓ Server URL updated to: ${options.server}`));
    updated = true;
  }

  // Update deployment key
  if (options.key) {
    // Parse key format: platform:env:key (e.g., android:production:abc123)
    const parts = options.key.split(':');
    if (parts.length === 3) {
      const [platform, env, key] = parts;
      if (config.deploymentKeys[platform] && config.deploymentKeys[platform][env]) {
        config.deploymentKeys[platform][env] = key;
        console.log(chalk.green(`✓ ${platform} ${env} key updated`));
        updated = true;
      } else {
        console.log(chalk.red(`✗ Invalid key format. Use: platform:env:key`));
        console.log(chalk.gray('  Example: android:production:your-new-key'));
      }
    } else {
      console.log(chalk.red(`✗ Invalid key format. Use: platform:env:key`));
      console.log(chalk.gray('  Example: android:production:your-new-key'));
    }
  }

  if (updated) {
    config.updatedAt = new Date().toISOString();
    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log(chalk.gray('\nConfiguration saved.'));
  }
}

module.exports = configCommand;
