const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * 差分更新工具
 * 使用简单的文件级别差分，对比新旧版本的文件变化
 */

/**
 * 生成两个目录之间的差分信息
 * @param {string} oldDir 旧版本目录
 * @param {string} newDir 新版本目录
 * @returns {Object} 差分信息
 */
async function generateDiff(oldDir, newDir) {
  const oldFiles = await scanDirectory(oldDir);
  const newFiles = await scanDirectory(newDir);
  
  const diff = {
    added: [],      // 新增的文件
    modified: [],   // 修改的文件
    deleted: [],    // 删除的文件
    unchanged: []   // 未变化的文件
  };

  // 检查新文件和修改的文件
  for (const [relativePath, newHash] of Object.entries(newFiles)) {
    if (!oldFiles[relativePath]) {
      diff.added.push(relativePath);
    } else if (oldFiles[relativePath] !== newHash) {
      diff.modified.push(relativePath);
    } else {
      diff.unchanged.push(relativePath);
    }
  }

  // 检查删除的文件
  for (const relativePath of Object.keys(oldFiles)) {
    if (!newFiles[relativePath]) {
      diff.deleted.push(relativePath);
    }
  }

  return diff;
}

/**
 * 扫描目录，返回所有文件的哈希值
 * @param {string} dir 目录路径
 * @returns {Object} 文件路径 -> 哈希值的映射
 */
async function scanDirectory(dir) {
  const files = {};
  
  async function scan(currentDir, basePath = '') {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.join(basePath, entry.name).replace(/\\/g, '/');
      
      if (entry.isDirectory()) {
        await scan(fullPath, relativePath);
      } else {
        const hash = await calculateFileHash(fullPath);
        files[relativePath] = hash;
      }
    }
  }
  
  if (await fs.pathExists(dir)) {
    await scan(dir);
  }
  
  return files;
}

/**
 * 计算文件的 SHA256 哈希值
 * @param {string} filePath 文件路径
 * @returns {string} 哈希值
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 创建差分包
 * 只包含新增和修改的文件，以及一个 manifest 描述变化
 * @param {string} oldDir 旧版本目录
 * @param {string} newDir 新版本目录
 * @param {string} outputPath 输出路径
 * @returns {Object} 差分包信息
 */
async function createDiffPackage(oldDir, newDir, outputPath) {
  const archiver = require('archiver');
  
  const diff = await generateDiff(oldDir, newDir);
  
  // 计算差分包大小节省
  let fullSize = 0;
  let diffSize = 0;
  
  const newFiles = await scanDirectory(newDir);
  for (const relativePath of Object.keys(newFiles)) {
    const filePath = path.join(newDir, relativePath);
    const stats = await fs.stat(filePath);
    fullSize += stats.size;
    
    if (diff.added.includes(relativePath) || diff.modified.includes(relativePath)) {
      diffSize += stats.size;
    }
  }

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve({
        diff,
        fullSize,
        diffSize,
        savedBytes: fullSize - diffSize,
        savedPercent: fullSize > 0 ? Math.round((1 - diffSize / fullSize) * 100) : 0,
        packageSize: archive.pointer()
      });
    });
    
    archive.on('error', reject);
    archive.pipe(output);

    // 添加差分 manifest
    const manifest = {
      type: 'diff',
      added: diff.added,
      modified: diff.modified,
      deleted: diff.deleted,
      timestamp: new Date().toISOString()
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'diff-manifest.json' });

    // 只添加新增和修改的文件
    const filesToInclude = [...diff.added, ...diff.modified];
    for (const relativePath of filesToInclude) {
      const filePath = path.join(newDir, relativePath);
      archive.file(filePath, { name: relativePath });
    }

    archive.finalize();
  });
}

/**
 * 应用差分包
 * @param {string} currentDir 当前版本目录
 * @param {string} diffPackagePath 差分包路径
 * @param {string} outputDir 输出目录
 */
async function applyDiffPackage(currentDir, diffPackagePath, outputDir) {
  const AdmZip = require('adm-zip');
  
  // 复制当前版本到输出目录
  await fs.copy(currentDir, outputDir);
  
  // 解压差分包
  const zip = new AdmZip(diffPackagePath);
  const manifestEntry = zip.getEntry('diff-manifest.json');
  
  if (!manifestEntry) {
    throw new Error('Invalid diff package: missing manifest');
  }
  
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  
  // 删除需要删除的文件
  for (const relativePath of manifest.deleted || []) {
    const filePath = path.join(outputDir, relativePath);
    await fs.remove(filePath);
  }
  
  // 解压新增和修改的文件
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.entryName === 'diff-manifest.json') continue;
    
    const outputPath = path.join(outputDir, entry.entryName);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, entry.getData());
  }
  
  return manifest;
}

module.exports = {
  generateDiff,
  scanDirectory,
  calculateFileHash,
  createDiffPackage,
  applyDiffPackage
};
