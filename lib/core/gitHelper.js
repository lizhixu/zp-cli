/**
 * gitHelper.js - Git 仓库辅助模块
 * 负责读取当前目录的 Git 远程仓库地址，用于自动匹配部署映射
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

/**
 * 从 .git/config 文件中解析 origin 远程地址
 * @param {string} repoRoot - Git 仓库根目录
 * @returns {string|null} 远程仓库地址，解析失败时返回 null
 */
function parseGitRemoteFromConfig(repoRoot) {
  const gitConfigPath = path.join(repoRoot, '.git', 'config');
  if (!fs.existsSync(gitConfigPath)) return null;

  try {
    const content = fs.readFileSync(gitConfigPath, 'utf-8');
    const lines = content.split('\n');
    let inOriginSection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      // 检测 [remote "origin"] 段落
      if (trimmed === '[remote "origin"]') {
        inOriginSection = true;
        continue;
      }
      // 遇到新的 section 则退出
      if (trimmed.startsWith('[') && inOriginSection) {
        break;
      }
      // 提取 url 字段
      if (inOriginSection && trimmed.startsWith('url =')) {
        return trimmed.replace('url =', '').trim();
      }
    }
  } catch (err) {
    // 读取失败时静默处理，回退到 git 命令
  }
  return null;
}

/**
 * 使用 git 命令获取 origin 远程地址
 * @returns {string|null} 远程仓库地址
 */
function getGitRemoteFromCommand() {
  try {
    const url = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return url || null;
  } catch {
    return null;
  }
}

/**
 * 判断当前目录是否在 Git 仓库内
 * @returns {boolean}
 */
function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 Git 仓库根目录
 * @returns {string|null} 仓库根目录的绝对路径
 */
function getGitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 获取当前目录对应的 Git origin 远程地址
 * 优先从 .git/config 解析，失败则使用 git 命令
 * @returns {string|null} 远程仓库地址
 */
function getGitRemoteUrl() {
  const repoRoot = getGitRoot();
  if (!repoRoot) return null;

  // 优先从配置文件解析（速度快，无需子进程）
  const fromConfig = parseGitRemoteFromConfig(repoRoot);
  if (fromConfig) return fromConfig;

  // 回退到 git 命令
  return getGitRemoteFromCommand();
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveTargetValue(target, serverAlias, relativePath) {
  if (typeof target === 'string') {
    return {
      remoteBase: target,
      relativePath,
      serverAlias
    };
  }

  if (isObject(target)) {
    return {
      remoteBase: target.remotePath,
      relativePath,
      serverAlias: target.serverAlias || serverAlias
    };
  }

  return { relativePath };
}

function resolveSubdirectoryMapping(sub, relativePath, preferredServerAlias) {
  if (typeof sub === 'string') {
    return {
      remoteBase: sub,
      relativePath
    };
  }

  if (!isObject(sub)) {
    return { relativePath };
  }

  if (sub.remotePath) {
    return {
      remoteBase: sub.remotePath,
      relativePath,
      serverAlias: sub.serverAlias
    };
  }

  const knownKeys = ['targets', 'defaultServerAlias', 'serverAlias', 'remotePath'];
  const targets = isObject(sub.targets)
    ? sub.targets
    : Object.keys(sub).some(key => knownKeys.includes(key))
      ? null
      : sub;

  if (!targets) {
    return { relativePath };
  }

  const aliases = Object.keys(targets);
  const serverAlias = preferredServerAlias || sub.defaultServerAlias || sub.serverAlias || (aliases.length === 1 ? aliases[0] : null);

  if (!serverAlias) {
    return {
      relativePath,
      ambiguousTargets: aliases
    };
  }

  if (!Object.prototype.hasOwnProperty.call(targets, serverAlias)) {
    return {
      relativePath,
      targetNotFound: serverAlias
    };
  }

  return resolveTargetValue(targets[serverAlias], serverAlias, relativePath);
}

/**
 * 根据本地上传路径和映射配置，计算远程目标路径
 *
 * 优先级：子目录映射 > 映射顶层 serverAlias/remotePath
 * - 有子目录映射且匹配 → 使用子映射的 serverAlias 和 remotePath
 * 无子目录映射或未匹配 → 回退到顶层 serverAlias 和 remotePath
 *
 * subdirectoryMappings 的值支持三种格式：
 *   - 字符串: "/var/www/frontend"                    → 同服务器不同路径
 *   - 对象:   { serverAlias, remotePath }            → 部署到不同服务器
 *   - 多目标: { targets: { hw: "/path1", zx: "/path2" } }
 *
 * @param {string} localPath - 本地上传路径（相对于仓库根目录）
 * @param {Object} mapping - 映射配置对象
 * @param {string} repoRoot - Git 仓库根目录
 * @param {string} [preferredServerAlias] - 命令行指定的服务器别名，用于多目标映射选择
 * @returns {{ remoteBase?: string, relativePath: string, serverAlias?: string, ambiguousTargets?: string[], targetNotFound?: string } | null}
 */
function resolveRemotePath(localPath, mapping, repoRoot, preferredServerAlias) {
  // 获取相对于仓库根目录的路径
  const absLocal = path.resolve(localPath);
  let relativePath = path.relative(repoRoot, absLocal).replace(/\\/g, '/');

  // 有子目录映射时，优先尝试匹配
  if (mapping.subdirectoryMappings && Object.keys(mapping.subdirectoryMappings).length > 0) {
    const normalizedMappings = Object.keys(mapping.subdirectoryMappings)
      .map(key => ({
        raw: key,
        normalized: key.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
      }))
      .filter(item => item.normalized)
      .sort((a, b) => b.normalized.length - a.normalized.length);

    const matched = normalizedMappings.find(item => (
      relativePath === item.normalized || relativePath.startsWith(`${item.normalized}/`)
    ));

    if (matched) {
      const sub = mapping.subdirectoryMappings[matched.raw];
      const subRelativePath = relativePath === matched.normalized
        ? ''
        : relativePath.slice(matched.normalized.length + 1);

      return resolveSubdirectoryMapping(sub, subRelativePath, preferredServerAlias);
    }
  }

  // 未匹配子目录映射，回退到顶层配置
  return {
    remoteBase: mapping.remotePath,
    relativePath: relativePath
  };
}

module.exports = {
  isGitRepo,
  getGitRoot,
  getGitRemoteUrl,
  resolveRemotePath
};
