const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const archiver = require('archiver');
const crypto = require('crypto');
const axios = require('axios');

const CONFIG_FILE = 'lynx-update.json';

async function publishCommand(options) {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('✗ Hot update not initialized.'));
    console.log(chalk.gray('  Run "lynx-update init" first.'));
    return;
  }

  const config = await fs.readJson(configPath);
  const distDir = path.join(process.cwd(), config.distDir);

  // Check if bundle exists
  const bundlePath = path.join(distDir, config.bundleName);
  if (!fs.existsSync(bundlePath)) {
    console.log(chalk.red(`✗ Bundle not found: ${bundlePath}`));
    console.log(chalk.gray('  Run "npm run build" first.'));
    return;
  }

  // Determine version
  let version = options.version;
  if (!version) {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = await fs.readJson(pkgPath);
      version = pkg.version || '1.0.0';
    } else {
      version = '1.0.0';
    }
  }

  const platforms = options.platform === 'all' 
    ? config.platforms 
    : [options.platform];

  console.log(chalk.cyan('\nPublishing update...'));
  console.log(chalk.gray(`Version: ${version}`));
  console.log(chalk.gray(`Platforms: ${platforms.join(', ')}`));
  console.log(chalk.gray(`Rollout: ${options.rollout}%`));
  if (options.mandatory) {
    console.log(chalk.yellow('⚠ This is a mandatory update'));
  }

  for (const platform of platforms) {
    if (!config.platforms.includes(platform)) {
      console.log(chalk.yellow(`⚠ Platform ${platform} not configured. Skipping...`));
      continue;
    }

    const spinner = ora(`Publishing to ${platform}...`).start();

    try {
      // Create update package
      const packagePath = await createUpdatePackage(distDir, config, platform, version);
      
      // Calculate hash
      const hash = await calculateFileHash(packagePath);
      
      // Get file size
      const stats = await fs.stat(packagePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      // Upload to server
      const uploadResult = await uploadPackage(config, platform, {
        version,
        packagePath,
        hash,
        size: stats.size,
        description: options.description || `Update to version ${version}`,
        mandatory: options.mandatory || false,
        rollout: parseInt(options.rollout) || 100
      });

      spinner.succeed(chalk.green(`Published to ${platform}`));
      console.log(chalk.gray(`  Version: ${version}`));
      console.log(chalk.gray(`  Size: ${sizeMB} MB`));
      console.log(chalk.gray(`  Hash: ${hash.substring(0, 16)}...`));

      // Clean up temp file
      await fs.remove(packagePath);

    } catch (error) {
      spinner.fail(chalk.red(`Failed to publish to ${platform}`));
      console.error(chalk.gray(`  ${error.message}`));
    }
  }

  console.log('\n' + chalk.green('✓ Publish complete!'));
}

async function createUpdatePackage(distDir, config, platform, version) {
  const tempDir = path.join(process.cwd(), '.lynx-update-temp');
  await fs.ensureDir(tempDir);

  const packageName = `${config.appKey}-${platform}-${version}.zip`;
  const packagePath = path.join(tempDir, packageName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(packagePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(packagePath));
    archive.on('error', reject);

    archive.pipe(output);

    // Add bundle file
    const bundlePath = path.join(distDir, config.bundleName);
    archive.file(bundlePath, { name: config.bundleName });

    // Add static assets if exist
    const staticDir = path.join(distDir, 'static');
    if (fs.existsSync(staticDir)) {
      archive.directory(staticDir, 'static');
    }

    // Add manifest
    const manifest = {
      version,
      platform,
      bundleName: config.bundleName,
      timestamp: new Date().toISOString()
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    archive.finalize();
  });
}

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function uploadPackage(config, platform, updateInfo) {
  const { version, packagePath, hash, size, description, mandatory, rollout } = updateInfo;
  
  // For self-hosted, save to local releases directory
  if (config.serverType === 'self-hosted') {
    const releasesDir = path.join(process.cwd(), '.lynx-releases', platform);
    await fs.ensureDir(releasesDir);
    
    // Copy package
    const targetPath = path.join(releasesDir, path.basename(packagePath));
    await fs.copy(packagePath, targetPath);
    
    // Save release info
    const releaseInfo = {
      version,
      hash,
      size,
      description,
      mandatory,
      rollout,
      packageUrl: targetPath,
      createdAt: new Date().toISOString()
    };
    
    const releasesFile = path.join(releasesDir, 'releases.json');
    let releases = [];
    if (fs.existsSync(releasesFile)) {
      releases = await fs.readJson(releasesFile);
    }
    releases.unshift(releaseInfo);
    await fs.writeJson(releasesFile, releases, { spaces: 2 });
    
    return { success: true, local: true };
  }
  
  // For remote server, upload via API
  const formData = new FormData();
  formData.append('file', fs.createReadStream(packagePath));
  formData.append('version', version);
  formData.append('platform', platform);
  formData.append('hash', hash);
  formData.append('description', description);
  formData.append('mandatory', mandatory.toString());
  formData.append('rollout', rollout.toString());

  const response = await axios.post(`${config.serverUrl}/api/releases`, formData, {
    headers: {
      'X-App-Key': config.appKey,
      'X-Deployment-Key': config.deploymentKeys[platform].production
    }
  });

  return response.data;
}

module.exports = publishCommand;
