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

/**
 * 执行 upload 命令
 * @param {string} localPath - 本地文件/目录路径
 * @param {Object} options - 命令行选项
 * @param {string} [options.remotePath] - 指定远程目标路径
 * @param {string} [options.server] - 指定服务器别名
 */
async function run(localPath, options) {
  try {
    // 1. 检查本地路径是否存在
    const absPath = path.resolve(localPath);
    if (!fs.existsSync(absPath)) {
      logger.error(`路径不存在: ${absPath}`);
      process.exit(1);
    }

    const isDir = fs.statSync(absPath).isDirectory();
    logger.log(chalk.bold(`\n🚀 zp-cli 部署工具\n`));
    logger.info(`本地路径: ${absPath}`);
    logger.info(`类型: ${isDir ? '目录' : '文件'}`);
    logger.newline();

    // 2. 加载配置文件
    const config = configManager.loadConfig();
    if (!config) {
      logger.error('配置文件不存在，请先执行 ' + chalk.cyan('zp-cli init') + ' 初始化配置');
      process.exit(1);
    }

    // 3. 确定服务器和远程路径
    let server = null;
    let remoteBase = null;
    let relativePath = null;

    // 模式 A：命令行直接指定了服务器别名和远程路径
    if (options.server && options.remotePath) {
      server = configManager.findServerByAlias(config, options.server);
      if (!server) {
        logger.error(`未找到别名为 "${options.server}" 的服务器`);
        process.exit(1);
      }
      remoteBase = options.remotePath;
      relativePath = path.basename(absPath);
      logger.info(`使用命令行指定的服务器: ${server.alias}`);
    }
    // 模式 B：命令行指定了服务器别名
    // 优先从 Git 映射中取 remotePath，否则用服务器的 defaultRemotePath
    else if (options.server) {
      server = configManager.findServerByAlias(config, options.server);
      if (!server) {
        logger.error(`未找到别名为 "${options.server}" 的服务器`);
        process.exit(1);
      }

      // 尝试从 Git 映射中获取远程路径
      let mapped = false;
      if (gitHelper.isGitRepo()) {
        const gitUrl = gitHelper.getGitRemoteUrl();
        if (gitUrl) {
          const mapping = configManager.findMappingByGitUrl(config, gitUrl);
          if (mapping) {
            const repoRoot = gitHelper.getGitRoot();
            const mappingAlias = server.reuseMapping || options.server;
            const resolved = gitHelper.resolveRemotePath(absPath, mapping, repoRoot, mappingAlias);
            if (resolved.targetNotFound) {
              logger.error(`子目录映射中未配置服务器 "${resolved.targetNotFound}" 的目标路径`);
              process.exit(1);
            }
            if (resolved.remoteBase) {
              remoteBase = resolved.remoteBase;
              relativePath = resolved.relativePath;
              mapped = true;
            }
          }
        }
      }

      // 没有映射则用服务器的 defaultRemotePath
      if (!mapped) {
        if (!server.defaultRemotePath) {
          logger.error(`服务器 "${server.alias}" 未配置 defaultRemotePath，请通过 --remote-path 指定`);
          process.exit(1);
        }
        remoteBase = server.defaultRemotePath;
        relativePath = path.basename(absPath);
      }

      logger.info(`使用命令行指定的服务器: ${server.alias}`);
    }
    // 模式 C：命令行指定了远程路径（需要从映射或默认服务器推断）
    else if (options.remotePath) {
      // 尝试通过 Git 映射找到服务器
      if (gitHelper.isGitRepo()) {
        const gitUrl = gitHelper.getGitRemoteUrl();
        if (gitUrl) {
          const mapping = configManager.findMappingByGitUrl(config, gitUrl);
          if (mapping) {
            server = configManager.findServerByAlias(config, mapping.serverAlias);
          }
        }
      }
      if (!server && config.servers.length > 0) {
        server = config.servers[0]; // 使用第一个服务器
      }
      if (!server) {
        logger.error('无法确定目标服务器，请通过 --server 指定');
        process.exit(1);
      }
      remoteBase = options.remotePath;
      relativePath = path.basename(absPath);
    }
    // 模式 D：智能模式 - 通过 Git 仓库自动匹配
    else {
      const result = resolveFromGit(config, absPath);
      if (!result) {
        logger.error('无法自动确定部署目标。请检查以下可能的原因:');
        logger.log('  1. 当前目录不在 Git 仓库内');
        logger.log('  2. 配置文件中没有匹配的映射');
        logger.log('  3. 请使用 --server 和 --remote-path 手动指定');
        process.exit(1);
      }
      server = result.server;
      remoteBase = result.remoteBase;
      relativePath = result.relativePath;
      logger.info(`Git 仓库匹配成功: ${result.gitUrl}`);
      logger.info(`服务器: ${server.alias} (${server.host})`);
    }

    logger.newline();

    // 4. 验证服务器配置
    const validation = configManager.validateServer(server);
    if (!validation.valid) {
      logger.error('服务器配置不完整:');
      validation.errors.forEach(e => logger.log(`  - ${e}`));
      process.exit(1);
    }

    // 5. 执行部署
    const permissions = (server.chown || server.chgrp)
      ? { user: server.chown, group: server.chgrp }
      : null;

    await sshDeployer.deploy({
      server,
      localPath: absPath,
      remoteBase,
      relativePath,
      isDir,
      permissions
    });

  } catch (err) {
    logger.error(`部署失败: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 通过 Git 仓库信息智能解析部署目标
 * @param {Object} config - 配置对象
 * @param {string} absPath - 本地文件的绝对路径
 * @returns {Object|null} { server, remoteBase, relativePath, gitUrl }
 */
function resolveFromGit(config, absPath) {
  if (!gitHelper.isGitRepo()) {
    logger.warn('当前目录不在 Git 仓库内');
    return null;
  }

  const gitUrl = gitHelper.getGitRemoteUrl();
  if (!gitUrl) {
    logger.warn('无法获取 Git 远程仓库地址');
    return null;
  }

  logger.info(`检测到 Git 远程地址: ${gitUrl}`);

  // 在映射中查找匹配项（支持 SSH / HTTPS 两种格式互相匹配）
  const mapping = configManager.findMappingByGitUrl(config, gitUrl);
  if (!mapping) {
    logger.warn('在配置文件中未找到匹配的映射');
    logger.log(chalk.gray('提示: 您可以在 ~/.zp-cli.json 的 mappings 中添加该仓库的映射'));
    logger.log(chalk.gray('       配置中的 gitRemoteUrl 支持 SSH 和 HTTPS 两种格式，会自动匹配'));
    return null;
  }

  // 显示匹配到的配置项（如果格式不同则同时显示）
  if (mapping.gitRemoteUrl !== gitUrl) {
    logger.info(`匹配到映射配置: ${mapping.gitRemoteUrl}`);
  }

  // 解析远程路径（优先子目录映射，回退到顶层配置）
  const repoRoot = gitHelper.getGitRoot();
  const resolved = gitHelper.resolveRemotePath(absPath, mapping, repoRoot);

  if (resolved.ambiguousTargets) {
    logger.error(`该子目录配置了多个目标服务器: ${resolved.ambiguousTargets.join(', ')}`);
    logger.log(chalk.gray('请通过 --server 指定目标服务器，例如: zp-cli up <路径> --server ' + resolved.ambiguousTargets[0]));
    return null;
  }

  if (resolved.targetNotFound) {
    logger.error(`子目录映射中未配置服务器 "${resolved.targetNotFound}" 的目标路径`);
    return null;
  }

  // 确定服务器：子目录映射 > 映射顶层
  const serverAlias = resolved.serverAlias || mapping.serverAlias;
  if (!serverAlias) {
    logger.error('无法确定目标服务器：映射中未配置 serverAlias，且未匹配到子目录映射');
    return null;
  }

  const server = configManager.findServerByAlias(config, serverAlias);
  if (!server) {
    logger.error(`映射中指定的服务器 "${serverAlias}" 不存在`);
    return null;
  }

  // 确定远程路径
  if (!resolved.remoteBase) {
    logger.error('无法确定远程路径：映射中未配置 remotePath，且未匹配到子目录映射');
    return null;
  }

  return {
    server,
    remoteBase: resolved.remoteBase,
    relativePath: resolved.relativePath,
    gitUrl
  };
}

module.exports = { run };
