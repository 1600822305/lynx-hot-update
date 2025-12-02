const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const archiver = require('archiver');
const crypto = require('crypto');
const axios = require('axios');
const { createDiffPackage, scanDirectory } = require('../utils/diff');

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

  // 版本定向
  const targetBinaryVersion = options.targetBinaryVersion || '*';

  console.log(chalk.cyan('\nPublishing update...'));
  console.log(chalk.gray(`Version: ${version}`));
  console.log(chalk.gray(`Platforms: ${platforms.join(', ')}`));
  console.log(chalk.gray(`Rollout: ${options.rollout}%`));
  console.log(chalk.gray(`Target Binary: ${targetBinaryVersion}`));
  if (options.mandatory) {
    console.log(chalk.yellow('⚠ This is a mandatory update'));
  }
  if (options.diff) {
    console.log(chalk.cyan('📦 Differential update enabled'));
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

      // 生成差分包（如果启用且有上一版本）
      let diffInfo = null;
      if (options.diff) {
        diffInfo = await generateDiffPackageIfPossible(config, platform, distDir, version);
        if (diffInfo) {
          console.log(chalk.green(`  📦 Diff package created: ${diffInfo.savedPercent}% smaller`));
        }
      }

      // Upload to server
      const uploadResult = await uploadPackage(config, platform, {
        version,
        packagePath,
        hash,
        size: stats.size,
        description: options.description || `Update to version ${version}`,
        mandatory: options.mandatory || false,
        rollout: parseInt(options.rollout) || 100,
        targetBinaryVersion,
        diffInfo
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

async function generateDiffPackageIfPossible(config, platform, distDir, newVersion) {
  try {
    // 查找上一版本
    const releasesDir = path.join(process.cwd(), '.lynx-releases', platform);
    const releasesFile = path.join(releasesDir, 'releases.json');
    
    if (!await fs.pathExists(releasesFile)) {
      return null;
    }

    const releases = await fs.readJson(releasesFile);
    if (releases.length === 0) {
      return null;
    }

    const prevRelease = releases[0];
    const prevVersion = prevRelease.version;

    // 检查是否有上一版本的解压目录
    const prevDir = path.join(process.cwd(), '.lynx-releases', platform, `v${prevVersion}`);
    if (!await fs.pathExists(prevDir)) {
      // 尝试解压上一版本
      const prevPackagePath = prevRelease.packageUrl;
      if (prevPackagePath && await fs.pathExists(prevPackagePath)) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(prevPackagePath);
        await fs.ensureDir(prevDir);
        zip.extractAllTo(prevDir, true);
      } else {
        return null;
      }
    }

    // 生成差分包
    const diffOutputPath = path.join(
      process.cwd(), 
      '.lynx-releases', 
      platform, 
      `diff-${prevVersion}-to-${newVersion}.zip`
    );

    const diffResult = await createDiffPackage(prevDir, distDir, diffOutputPath);
    
    return {
      fromVersion: prevVersion,
      toVersion: newVersion,
      path: diffOutputPath,
      ...diffResult
    };
  } catch (error) {
    console.log(chalk.yellow(`  Warning: Could not create diff package: ${error.message}`));
    return null;
  }
}

async function uploadPackage(config, platform, updateInfo) {
  const { version, packagePath, hash, size, description, mandatory, rollout, targetBinaryVersion, diffInfo } = updateInfo;
  
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
      targetBinaryVersion: targetBinaryVersion || '*',
      packageUrl: targetPath,
      diffPackage: diffInfo ? diffInfo.path : null,
      createdAt: new Date().toISOString(),
      // 统计数据
      stats: {
        downloads: 0,
        installs: 0,
        failures: 0,
        active: 0
      }
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
