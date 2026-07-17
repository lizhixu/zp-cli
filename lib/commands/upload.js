/**
 * upload.js - 文件/目录上传命令
 * 核心流程：检测 Git 仓库 → 匹配映射 → 确定服务器和路径 → 执行部署
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const logger = require('../utils/logger');
const configManager = require('../core/configManager');
const gitHelper = require('../core/gitHelper');
const sshDeployer = require('../core/sshDeployer');

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  return `${minutes}m ${restSeconds}s`;
}

function getPermissions(server) {
  return (server.chown || server.chgrp)
    ? { user: server.chown, group: server.chgrp }
    : null;
}

function validateServerOrExit(server) {
  const validation = configManager.validateServer(server);
  if (!validation.valid) {
    logger.error('服务器配置不完整:');
    validation.errors.forEach(e => logger.log(`  - ${e}`));
    process.exit(1);
  }
}

/**
 * 执行 upload 命令（支持多文件）
 * @param {string[]} paths - 本地文件/目录路径数组
 * @param {Object} options - 命令行选项
 * @param {string} [options.remotePath] - 指定远程目标路径
 * @param {string} [options.server] - 指定服务器别名
 */
async function run(paths, options) {
  const startedAt = Date.now();
  const uploadPaths = Array.isArray(paths) ? paths : [paths];

  try {
    // 1. 加载配置文件
    const config = configManager.loadConfig();
    if (!config) {
      logger.error('配置文件不存在，请先执行 ' + chalk.cyan('zp-cli init') + ' 初始化配置');
      process.exit(1);
    }

    const preferredServer = resolvePreferredServer(config, options);
    if (options.server && !preferredServer) {
      process.exit(1);
    }

    const isMulti = uploadPaths.length > 1;

    if (!isMulti) {
      // ── 单文件：直接部署 ──
      const absPath = path.resolve(uploadPaths[0]);
      if (!fs.existsSync(absPath)) {
        logger.error(`路径不存在: ${absPath}`);
        process.exit(1);
      }

      const item = resolveDeployItem(config, preferredServer, absPath, options);
      if (!item) process.exit(1);

      validateServerOrExit(item.server);

      logger.log(chalk.bold(`\n🚀 zp-cli 部署工具\n`));
      logger.info(`本地路径: ${absPath}`);
      logger.info(`类型: ${item.isDir ? '目录' : '文件'}`);
      logger.info(`服务器: ${item.server.alias} (${item.server.host})`);
      logger.newline();

      await sshDeployer.deploy({
        server: item.server,
        localPath: item.localPath,
        remoteBase: item.remoteBase,
        relativePath: item.relativePath,
        isDir: item.isDir,
        permissions: getPermissions(item.server)
      });

      logger.newline();
      logger.success(`部署完成，耗时: ${formatDuration(Date.now() - startedAt)}`);
      return;
    }

    // ── 多文件：逐个解析目标，按 server+remoteBase 分组，批量部署 ──
    logger.log(chalk.bold(`\n🚀 zp-cli 部署工具（${uploadPaths.length} 个文件）\n`));

    const items = [];
    let failCount = 0;

    for (const localPath of uploadPaths) {
      const absPath = path.resolve(localPath);
      if (!fs.existsSync(absPath)) {
        logger.error(`路径不存在: ${absPath}`);
        failCount++;
        continue;
      }

      const item = resolveDeployItem(config, preferredServer, absPath, options);
      if (!item) {
        failCount++;
        continue;
      }

      items.push(item);
    }

    if (items.length === 0) {
      logger.error('没有可部署的文件');
      process.exit(1);
    }

    // 按 server.alias + remoteBase 分组；不同服务器或不同目录不能共用 SSH/压缩包
    const groups = new Map();
    for (const item of items) {
      validateServerOrExit(item.server);

      const key = `${item.server.alias}::${item.remoteBase}`;
      if (!groups.has(key)) {
        groups.set(key, { server: item.server, remoteBase: item.remoteBase, items: [] });
      }
      groups.get(key).items.push(item);
    }

    let successCount = 0;
    for (const [, group] of groups) {
      logger.info(`服务器: ${group.server.alias} (${group.server.host})`);
      logger.newline();
      await sshDeployer.deployBatch(group.server, group.items, getPermissions(group.server));
      successCount += group.items.length;
    }

    logger.newline();
    if (failCount === 0) {
      logger.success(`全部完成！${successCount} 个文件，总耗时: ${formatDuration(Date.now() - startedAt)}`);
    } else {
      logger.warn(`完成: ${successCount} 个，失败: ${failCount} 个，总耗时: ${formatDuration(Date.now() - startedAt)}`);
    }

  } catch (err) {
    logger.error(`部署失败: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 解析命令行显式指定的服务器
 * @returns {Object|null}
 */
function resolvePreferredServer(config, options) {
  if (!options.server) return null;

  const server = configManager.findServerByAlias(config, options.server);
  if (!server) {
    logger.error(`未找到别名为 "${options.server}" 的服务器`);
    return null;
  }

  logger.info(`使用命令行指定的服务器: ${server.alias}`);
  return server;
}

/**
 * 解析单个文件的部署目标
 * @returns {{ server: Object, localPath: string, remoteBase: string, relativePath: string, isDir: boolean } | null}
 */
function resolveDeployItem(config, preferredServer, absPath, options) {
  const isDir = fs.statSync(absPath).isDirectory();

  // 有 --remote-path 时直接使用指定远程路径，只解析服务器
  if (options.remotePath) {
    const server = resolveServerForRemotePath(config, preferredServer, absPath);
    if (!server) {
      logger.error('无法确定目标服务器，请通过 --server 指定');
      return null;
    }

    return {
      server,
      localPath: absPath,
      remoteBase: options.remotePath,
      relativePath: path.basename(absPath),
      isDir
    };
  }

  // 尝试从 Git 映射解析
  if (gitHelper.isGitRepo()) {
    const gitUrl = gitHelper.getGitRemoteUrl();
    if (gitUrl) {
      const mapping = configManager.findMappingByGitUrl(config, gitUrl);
      if (mapping) {
        const repoRoot = gitHelper.getGitRoot();
        const mappingAlias = getMappingAlias(mapping, preferredServer, options);
        const resolved = gitHelper.resolveRemotePath(absPath, mapping, repoRoot, mappingAlias);

        if (resolved.targetNotFound) {
          logger.error(`子目录映射中未配置服务器 "${resolved.targetNotFound}" 的目标路径`);
          return null;
        }
        if (resolved.defaultTargetHint) {
          logger.warn(`该子目录配置了多个目标: ${resolved.defaultTargetHint.join(', ')}，已默认使用第一条`);
        }
        if (resolved.remoteBase) {
          const server = resolveServerForMapping(config, preferredServer, mapping, resolved, options);
          if (!server) {
            logger.error('无法确定目标服务器：映射中未配置 serverAlias，且没有可用默认服务器');
            return null;
          }

          return {
            server,
            localPath: absPath,
            remoteBase: resolved.remoteBase,
            relativePath: resolved.relativePath,
            isDir
          };
        }
      }
    }
  }

  // 只有显式指定 --server 时才回退到该服务器的 defaultRemotePath
  if (preferredServer) {
    if (preferredServer.defaultRemotePath) {
      return {
        server: preferredServer,
        localPath: absPath,
        remoteBase: preferredServer.defaultRemotePath,
        relativePath: path.basename(absPath),
        isDir
      };
    }

    logger.error(`服务器 "${preferredServer.alias}" 未配置 defaultRemotePath，请通过 --remote-path 指定`);
    return null;
  }

  logger.error('无法自动确定部署目标。请检查以下可能的原因:');
  logger.log('  1. 当前目录不在 Git 仓库内');
  logger.log('  2. 配置文件中没有匹配的映射');
  logger.log('  3. 请使用 --server 和 --remote-path 手动指定');
  return null;
}

function getMappingAlias(mapping, preferredServer, options) {
  if (options.server) {
    return preferredServer.reuseMapping || options.server;
  }

  // 未显式指定服务器时，不要用 config.servers[0] 干扰 targets 默认第一条逻辑
  return mapping.serverAlias || null;
}

function resolveServerForMapping(config, preferredServer, mapping, resolved, options) {
  if (options.server) {
    return preferredServer;
  }

  const serverAlias = resolved.serverAlias || mapping.serverAlias;
  if (serverAlias) {
    const server = configManager.findServerByAlias(config, serverAlias);
    if (!server) {
      logger.error(`映射中指定的服务器 "${serverAlias}" 不存在`);
      return null;
    }
    return server;
  }

  return config.servers[0] || null;
}

function resolveServerForRemotePath(config, preferredServer, absPath) {
  if (preferredServer) return preferredServer;

  if (gitHelper.isGitRepo()) {
    const gitUrl = gitHelper.getGitRemoteUrl();
    if (gitUrl) {
      const mapping = configManager.findMappingByGitUrl(config, gitUrl);
      if (mapping) {
        const repoRoot = gitHelper.getGitRoot();
        const resolved = gitHelper.resolveRemotePath(absPath, mapping, repoRoot, mapping.serverAlias || null);
        const serverAlias = resolved.serverAlias || mapping.serverAlias;
        if (serverAlias) {
          const server = configManager.findServerByAlias(config, serverAlias);
          if (server) return server;
        }
      }
    }
  }

  return config.servers[0] || null;
}

module.exports = { run };
