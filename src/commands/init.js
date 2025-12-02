const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const CONFIG_FILE = 'lynx-update.json';
const LYNX_CONFIG_FILE = 'lynx.config.json';

async function initCommand(options) {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  
  // Check if lynx.config.json exists
  const lynxConfigPath = path.join(process.cwd(), LYNX_CONFIG_FILE);
  if (!fs.existsSync(lynxConfigPath)) {
    console.log(chalk.red('✗ This is not a Lynx Native project.'));
    console.log(chalk.gray('  Run "lynx-native init" first to initialize your project.'));
    return;
  }

  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow(`⚠ ${CONFIG_FILE} already exists.`));
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Do you want to overwrite it?',
      default: false
    }]);
    if (!overwrite) {
      console.log(chalk.gray('Aborted.'));
      return;
    }
  }

  const lynxConfig = await fs.readJson(lynxConfigPath);

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'serverType',
      message: 'Select update server type:',
      choices: [
        { name: 'Self-hosted (recommended)', value: 'self-hosted' },
        { name: 'Lynx Cloud (coming soon)', value: 'cloud', disabled: true },
        { name: 'Custom server', value: 'custom' }
      ]
    },
    {
      type: 'input',
      name: 'serverUrl',
      message: 'Update server URL:',
      default: options.server || 'http://localhost:3000',
      when: (ans) => ans.serverType !== 'cloud'
    },
    {
      type: 'input',
      name: 'appKey',
      message: 'App key (unique identifier):',
      default: lynxConfig.appId || 'com.example.app'
    },
    {
      type: 'checkbox',
      name: 'platforms',
      message: 'Select platforms to enable hot update:',
      choices: [
        { name: 'Android', value: 'android', checked: true },
        { name: 'iOS', value: 'ios', checked: true }
      ]
    }
  ]);

  const config = {
    appKey: answers.appKey,
    appName: lynxConfig.appName,
    serverType: answers.serverType,
    serverUrl: answers.serverUrl,
    platforms: answers.platforms,
    bundleName: lynxConfig.bundleName || 'main.lynx.bundle',
    distDir: lynxConfig.distDir || 'dist',
    deploymentKeys: {
      android: {
        staging: generateKey(),
        production: generateKey()
      },
      ios: {
        staging: generateKey(),
        production: generateKey()
      }
    },
    created: new Date().toISOString()
  };

  const spinner = ora('Initializing hot update...').start();

  try {
    // Save config
    await fs.writeJson(configPath, config, { spaces: 2 });
    
    // Copy SDK files to project
    await copySDKFiles(answers.platforms);
    
    spinner.succeed(chalk.green('Hot update initialized!'));
    
    console.log('\n' + chalk.cyan('Configuration:'));
    console.log(chalk.white('  App Key:     ') + chalk.yellow(config.appKey));
    console.log(chalk.white('  Server:      ') + chalk.yellow(config.serverUrl));
    console.log(chalk.white('  Platforms:   ') + chalk.yellow(config.platforms.join(', ')));
    
    console.log('\n' + chalk.cyan('Deployment Keys:'));
    if (config.platforms.includes('android')) {
      console.log(chalk.white('  Android Staging:    ') + chalk.gray(config.deploymentKeys.android.staging));
      console.log(chalk.white('  Android Production: ') + chalk.gray(config.deploymentKeys.android.production));
    }
    if (config.platforms.includes('ios')) {
      console.log(chalk.white('  iOS Staging:        ') + chalk.gray(config.deploymentKeys.ios.staging));
      console.log(chalk.white('  iOS Production:     ') + chalk.gray(config.deploymentKeys.ios.production));
    }

    console.log('\n' + chalk.cyan('Next steps:'));
    console.log(chalk.white('  1. Integrate SDK in your native project'));
    console.log(chalk.white('  2. Start the update server:  ') + chalk.yellow('lynx-update server'));
    console.log(chalk.white('  3. Build your Lynx app:      ') + chalk.yellow('npm run build'));
    console.log(chalk.white('  4. Publish an update:        ') + chalk.yellow('lynx-update publish'));

  } catch (error) {
    spinner.fail(chalk.red('Failed to initialize hot update'));
    console.error(error);
  }
}

function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function copySDKFiles(platforms) {
  // SDK files will be copied to the native projects
  // This is a placeholder - actual SDK integration will be more complex
  
  if (platforms.includes('android')) {
    const androidDir = path.join(process.cwd(), 'android');
    if (fs.existsSync(androidDir)) {
      // Create SDK directory
      const sdkDir = path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'lynx', 'hotupdate');
      await fs.ensureDir(sdkDir);
      
      // Copy Android SDK files
      const sdkSource = path.join(__dirname, '..', '..', 'sdk', 'android');
      if (fs.existsSync(sdkSource)) {
        await fs.copy(sdkSource, sdkDir);
      }
    }
  }

  if (platforms.includes('ios')) {
    const iosDir = path.join(process.cwd(), 'ios');
    if (fs.existsSync(iosDir)) {
      // Create SDK directory
      const sdkDir = path.join(iosDir, 'App', 'HotUpdate');
      await fs.ensureDir(sdkDir);
      
      // Copy iOS SDK files
      const sdkSource = path.join(__dirname, '..', '..', 'sdk', 'ios');
      if (fs.existsSync(sdkSource)) {
        await fs.copy(sdkSource, sdkDir);
      }
    }
  }
}

module.exports = initCommand;
