#!/usr/bin/env node

/**
 * Lynx Hot Update Server
 * 开箱即用的热更新服务器
 */

const http = require('http');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.lynx-server-data');

// 确保数据目录存在
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(path.join(DATA_DIR, 'releases'));
fs.ensureDirSync(path.join(DATA_DIR, 'packages'));

// 统计数据
const statsFile = path.join(DATA_DIR, 'stats.json');
if (!fs.existsSync(statsFile)) {
  fs.writeJsonSync(statsFile, { apps: {} });
}

/**
 * 路由处理
 */
const routes = {
  // 检查更新
  'POST /api/check-update': async (req, res, body) => {
    const deploymentKey = req.headers['x-deployment-key'];
    const { currentVersion, platform, appVersion } = JSON.parse(body);
    
    if (!deploymentKey) {
      return sendJson(res, 401, { error: 'Missing deployment key' });
    }

    const releases = await getReleasesForKey(deploymentKey, platform);
    
    if (releases.length === 0) {
      return sendJson(res, 200, { updateAvailable: false });
    }

    // 找到适用的最新版本
    const latestRelease = findApplicableRelease(releases, currentVersion, appVersion);
    
    if (!latestRelease) {
      return sendJson(res, 200, { updateAvailable: false });
    }

    // 检查灰度发布
    if (latestRelease.rollout < 100) {
      const shouldReceive = Math.random() * 100 < latestRelease.rollout;
      if (!shouldReceive) {
        return sendJson(res, 200, { updateAvailable: false });
      }
    }

    // 检查是否禁用
    if (latestRelease.disabled) {
      return sendJson(res, 200, { updateAvailable: false });
    }

    // 记录检查统计
    await recordStats(deploymentKey, platform, 'check');

    // 判断是否有差分包可用
    const diffPackage = await findDiffPackage(deploymentKey, platform, currentVersion, latestRelease.version);

    sendJson(res, 200, {
      updateAvailable: true,
      version: latestRelease.version,
      downloadUrl: diffPackage 
        ? `http://${req.headers.host}/api/download/${diffPackage.filename}`
        : `http://${req.headers.host}/api/download/${latestRelease.filename}`,
      hash: diffPackage ? diffPackage.hash : latestRelease.hash,
      size: diffPackage ? diffPackage.size : latestRelease.size,
      description: latestRelease.description,
      mandatory: latestRelease.mandatory,
      isDiff: !!diffPackage
    });
  },

  // 下载包
  'GET /api/download/:filename': async (req, res, body, params) => {
    const filename = params.filename;
    const filePath = path.join(DATA_DIR, 'packages', filename);
    
    if (!await fs.pathExists(filePath)) {
      return sendJson(res, 404, { error: 'Package not found' });
    }

    const stats = await fs.stat(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': stats.size,
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    
    fs.createReadStream(filePath).pipe(res);
  },

  // 上传发布
  'POST /api/releases': async (req, res, body) => {
    const deploymentKey = req.headers['x-deployment-key'];
    const appKey = req.headers['x-app-key'];
    
    if (!deploymentKey || !appKey) {
      return sendJson(res, 401, { error: 'Missing authentication' });
    }

    // 解析 multipart form data (简化版)
    const boundary = req.headers['content-type'].split('boundary=')[1];
    const parts = parseMultipart(Buffer.from(body, 'binary'), boundary);
    
    const metadata = {};
    let fileData = null;
    let filename = null;

    for (const part of parts) {
      if (part.filename) {
        fileData = part.data;
        filename = part.filename;
      } else if (part.name) {
        metadata[part.name] = part.data.toString();
      }
    }

    if (!fileData) {
      return sendJson(res, 400, { error: 'No file uploaded' });
    }

    // 保存文件
    const savedFilename = `${appKey}-${metadata.platform}-${metadata.version}-${Date.now()}.zip`;
    const filePath = path.join(DATA_DIR, 'packages', savedFilename);
    await fs.writeFile(filePath, fileData);

    // 保存发布信息
    const release = {
      version: metadata.version,
      platform: metadata.platform,
      filename: savedFilename,
      hash: metadata.hash,
      size: fileData.length,
      description: metadata.description || '',
      mandatory: metadata.mandatory === 'true',
      rollout: parseInt(metadata.rollout) || 100,
      targetBinaryVersion: metadata.targetBinaryVersion || '*',
      disabled: false,
      createdAt: new Date().toISOString(),
      deploymentKey
    };

    await saveRelease(deploymentKey, metadata.platform, release);

    sendJson(res, 200, { success: true, release });
  },

  // 报告安装
  'POST /api/report-install': async (req, res, body) => {
    const { deploymentKey, platform, version, status } = JSON.parse(body);
    
    await recordStats(deploymentKey, platform, status, version);
    
    sendJson(res, 200, { success: true });
  },

  // 获取统计
  'GET /api/stats/:deploymentKey': async (req, res, body, params) => {
    const stats = await fs.readJson(statsFile);
    const appStats = stats.apps[params.deploymentKey] || {};
    
    sendJson(res, 200, appStats);
  },

  // 获取发布历史
  'GET /api/releases/:deploymentKey/:platform': async (req, res, body, params) => {
    const releases = await getReleasesForKey(params.deploymentKey, params.platform);
    sendJson(res, 200, { releases });
  },

  // 禁用/启用发布
  'PATCH /api/releases/:deploymentKey/:platform/:version': async (req, res, body, params) => {
    const { disabled, rollout, mandatory } = JSON.parse(body);
    
    const releasesFile = path.join(DATA_DIR, 'releases', `${params.deploymentKey}-${params.platform}.json`);
    if (!await fs.pathExists(releasesFile)) {
      return sendJson(res, 404, { error: 'Release not found' });
    }

    const releases = await fs.readJson(releasesFile);
    const release = releases.find(r => r.version === params.version);
    
    if (!release) {
      return sendJson(res, 404, { error: 'Version not found' });
    }

    if (disabled !== undefined) release.disabled = disabled;
    if (rollout !== undefined) release.rollout = rollout;
    if (mandatory !== undefined) release.mandatory = mandatory;
    release.updatedAt = new Date().toISOString();

    await fs.writeJson(releasesFile, releases, { spaces: 2 });
    
    sendJson(res, 200, { success: true, release });
  },

  // 健康检查
  'GET /api/health': async (req, res) => {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
  }
};

/**
 * 辅助函数
 */
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function getReleasesForKey(deploymentKey, platform) {
  const releasesFile = path.join(DATA_DIR, 'releases', `${deploymentKey}-${platform}.json`);
  if (await fs.pathExists(releasesFile)) {
    return await fs.readJson(releasesFile);
  }
  return [];
}

async function saveRelease(deploymentKey, platform, release) {
  const releasesFile = path.join(DATA_DIR, 'releases', `${deploymentKey}-${platform}.json`);
  let releases = [];
  if (await fs.pathExists(releasesFile)) {
    releases = await fs.readJson(releasesFile);
  }
  releases.unshift(release);
  await fs.writeJson(releasesFile, releases, { spaces: 2 });
}

function findApplicableRelease(releases, currentVersion, appVersion) {
  const semver = require('semver');
  
  for (const release of releases) {
    // 跳过当前版本
    if (release.version === currentVersion) continue;
    
    // 检查版本是否更新
    if (semver.valid(release.version) && semver.valid(currentVersion)) {
      if (!semver.gt(release.version, currentVersion)) continue;
    }
    
    // 检查目标二进制版本
    if (release.targetBinaryVersion && release.targetBinaryVersion !== '*' && appVersion) {
      if (!semver.satisfies(appVersion, release.targetBinaryVersion)) continue;
    }
    
    return release;
  }
  
  return null;
}

async function findDiffPackage(deploymentKey, platform, fromVersion, toVersion) {
  const diffFilename = `${deploymentKey}-${platform}-diff-${fromVersion}-to-${toVersion}.zip`;
  const diffPath = path.join(DATA_DIR, 'packages', diffFilename);
  
  if (await fs.pathExists(diffPath)) {
    const stats = await fs.stat(diffPath);
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(await fs.readFile(diffPath));
    
    return {
      filename: diffFilename,
      size: stats.size,
      hash: hash.digest('hex')
    };
  }
  
  return null;
}

async function recordStats(deploymentKey, platform, action, version = null) {
  const stats = await fs.readJson(statsFile);
  
  if (!stats.apps[deploymentKey]) {
    stats.apps[deploymentKey] = {};
  }
  if (!stats.apps[deploymentKey][platform]) {
    stats.apps[deploymentKey][platform] = {
      checks: 0,
      downloads: 0,
      installs: 0,
      failures: 0,
      versions: {}
    };
  }
  
  const platformStats = stats.apps[deploymentKey][platform];
  
  switch (action) {
    case 'check':
      platformStats.checks++;
      break;
    case 'download':
      platformStats.downloads++;
      break;
    case 'success':
      platformStats.installs++;
      if (version) {
        platformStats.versions[version] = (platformStats.versions[version] || 0) + 1;
      }
      break;
    case 'failure':
      platformStats.failures++;
      break;
  }
  
  platformStats.lastActivity = new Date().toISOString();
  
  await fs.writeJson(statsFile, stats, { spaces: 2 });
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  
  let start = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length + 2;
  
  while (start < buffer.length) {
    const end = buffer.indexOf(boundaryBuffer, start);
    if (end === -1) break;
    
    const part = buffer.slice(start, end - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    
    if (headerEnd !== -1) {
      const headers = part.slice(0, headerEnd).toString();
      const data = part.slice(headerEnd + 4);
      
      const nameMatch = headers.match(/name="([^"]+)"/);
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      
      parts.push({
        name: nameMatch ? nameMatch[1] : null,
        filename: filenameMatch ? filenameMatch[1] : null,
        data
      });
    }
    
    start = end + boundaryBuffer.length + 2;
  }
  
  return parts;
}

/**
 * 请求处理
 */
function handleRequest(req, res) {
  let body = [];
  
  req.on('data', chunk => body.push(chunk));
  req.on('end', async () => {
    body = Buffer.concat(body);
    
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;
    const pathname = parsedUrl.pathname;
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Deployment-Key, X-App-Key');
    
    if (method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    // 匹配路由
    for (const [route, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = route.split(' ');
      
      if (method !== routeMethod) continue;
      
      // 简单的路径参数匹配
      const routeParts = routePath.split('/');
      const pathParts = pathname.split('/');
      
      if (routeParts.length !== pathParts.length) continue;
      
      const params = {};
      let match = true;
      
      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          params[routeParts[i].slice(1)] = pathParts[i];
        } else if (routeParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }
      
      if (match) {
        try {
          await handler(req, res, body.toString('binary'), params);
        } catch (error) {
          console.error('Handler error:', error);
          sendJson(res, 500, { error: error.message });
        }
        return;
      }
    }
    
    // 404
    sendJson(res, 404, { error: 'Not found' });
  });
}

/**
 * 启动服务器
 */
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╦  ╦ ╦╔╗╔╔═╗  ╦ ╦╔═╗╔╦╗  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗
║  ╚╦╝║║║╠═╣  ╠═╣║ ║ ║   ║ ║╠═╝ ║║╠═╣ ║ ║╣ 
╩═╝ ╩ ╝╚╝╩ ╩  ╩ ╩╚═╝ ╩   ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝
                    SERVER

🚀 Server running at http://localhost:${PORT}
📁 Data directory: ${DATA_DIR}

Endpoints:
  POST /api/check-update     - Check for updates
  POST /api/releases         - Upload new release
  GET  /api/download/:file   - Download package
  POST /api/report-install   - Report installation
  GET  /api/stats/:key       - Get statistics
  GET  /api/releases/:key/:p - Get release history
  PATCH /api/releases/...    - Update release metadata
  `);
});

module.exports = server;
