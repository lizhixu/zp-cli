/**
 * configManager.js - 配置文件管理模块
 * 负责读取、写入和验证 ~/.zp-cli.json 配置文件
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

// 配置文件路径：~/.zp-cli.json
const CONFIG_FILE = path.join(os.homedir(), '.zp-cli.json');

/**
 * 获取配置文件路径
 * @returns {string} 配置文件的绝对路径
 */
function getConfigPath() {
  return CONFIG_FILE;
}

/**
 * 检查配置文件是否存在
 * @returns {boolean}
 */
function configExists() {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * 读取配置文件
 * @returns {Object|null} 解析后的配置对象，不存在时返回 null
 */
function loadConfig() {
  if (!configExists()) {
    return null;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`读取配置文件失败: ${err.message}`);
    return null;
  }
}

/**
 * 将配置对象写入文件
 * @param {Object} config - 配置对象
 */
function saveConfig(config) {
  try {
    const json = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_FILE, json, 'utf-8');
  } catch (err) {
    logger.error(`写入配置文件失败: ${err.message}`);
    throw err;
  }
}

/**
 * 生成默认的空配置模板
 * @returns {Object} 默认配置对象
 */
function getDefaultConfig() {
  return {
    syncService: {
      url: "",
      apiPassword: ""
    },
    servers: [],
    mappings: []
  };
}

/**
 * 根据别名查找服务器配置
 * @param {Object} config - 完整配置对象
 * @param {string} alias - 服务器别名
 * @returns {Object|null} 服务器配置，未找到时返回 null
 */
function findServerByAlias(config, alias) {
  if (!config || !config.servers) return null;
  return config.servers.find(s => s.alias === alias) || null;
}

/**
 * 将 Git URL 归一化为统一的 host/path 格式
 * 支持 SSH、HTTPS、ssh:// 等多种格式
 *
 * 示例:
 *   git@github.com:org/repo.git          → github.com/org/repo
 *   https://github.com/org/repo.git      → github.com/org/repo
 *   ssh://git@github.com:22/org/repo.git → github.com/org/repo
 *   git@gitlab.com:group/sub/repo.git    → gitlab.com/group/sub/repo
 *
 * @param {string} url - Git 远程地址
 * @returns {string} 归一化后的 host/path（小写，去除 .git 后缀）
 */
function normalizeGitUrl(url) {
  if (!url) return '';
  let s = url.trim();

  // 1. ssh://git@host:port/path.git → host/path
  const sshSchemeMatch = s.match(/^ssh:\/\/(?:[^@]+@)?([^:/]+)(?::\d+)?[:/](.+?)(?:\.git)?$/i);
  if (sshSchemeMatch) {
    return `${sshSchemeMatch[1]}/${sshSchemeMatch[2]}`.toLowerCase().replace(/\.git$/, '');
  }

  // 2. git@host:path.git → host/path
  const sshShortMatch = s.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (sshShortMatch) {
    return `${sshShortMatch[1]}/${sshShortMatch[2]}`.toLowerCase().replace(/\.git$/, '');
  }

  // 3. https://host/path.git → host/path
  const httpsMatch = s.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?(?:\/)?$/i);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`.toLowerCase().replace(/\.git$/, '');
  }

  // 4. 无法识别的格式，原样返回（小写、去尾部斜杠和 .git）
  return s.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
}

/**
 * 根据 Git 远程地址查找匹配的映射配置
 * 支持 SSH（git@host:path）和 HTTPS（https://host/path）两种格式互相匹配
 *
 * @param {Object} config - 完整配置对象
 * @param {string} gitRemoteUrl - Git 远程仓库地址
 * @returns {Object|null} 匹配的映射配置，未找到时返回 null
 */
function findMappingByGitUrl(config, gitRemoteUrl) {
  if (!config || !config.mappings) return null;
  const normalizedInput = normalizeGitUrl(gitRemoteUrl);
  if (!normalizedInput) return null;

  return config.mappings.find(m => {
    const normalizedMapping = normalizeGitUrl(m.gitRemoteUrl);
    return normalizedInput === normalizedMapping;
  }) || null;
}

/**
 * 验证服务器配置是否完整
 * @param {Object} server - 服务器配置对象
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateServer(server) {
  const errors = [];
  if (!server.alias) errors.push('缺少服务器别名 (alias)');
  if (!server.host) errors.push('缺少服务器地址 (host)');
  if (!server.username) errors.push('缺少登录用户名 (username)');
  if (!server.password && !server.privateKeyPath) {
    errors.push('至少需要配置密码 (password) 或私钥路径 (privateKeyPath)');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  getConfigPath,
  configExists,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  findServerByAlias,
  findMappingByGitUrl,
  normalizeGitUrl,
  validateServer
};
