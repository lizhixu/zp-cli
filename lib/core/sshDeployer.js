/**
 * sshDeployer.js - SSH 部署执行模块
 * 负责建立 SSH 连接、上传文件、在远程服务器上解压和部署
 */
const { NodeSSH } = require('node-ssh');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

/**
 * 建立 SSH 连接
 * @param {Object} server - 服务器配置对象
 * @returns {Promise<NodeSSH>} 已连接的 SSH 实例
 */
async function connect(server) {
  const ssh = new NodeSSH();
  const config = {
    host: server.host,
    port: server.port || 22,
    username: server.username
  };

  // 优先使用私钥认证，其次使用密码
  if (server.privateKeyPath && fs.existsSync(server.privateKeyPath)) {
    config.privateKey = server.privateKeyPath;
  } else if (server.password) {
    config.password = server.password;
  }

  // 忽略主机密钥验证（首次连接时避免交互确认）
  config.readyTimeout = 30000;

  try {
    await ssh.connect(config);
    return ssh;
  } catch (err) {
    throw new Error(`SSH 连接失败 (${server.host}:${config.port}): ${err.message}`);
  }
}

/**
 * 在服务器上执行命令
 * @param {NodeSSH} ssh - SSH 实例
 * @param {string} cmd - 要执行的命令
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
async function execRemote(ssh, cmd) {
  const result = await ssh.execCommand(cmd);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code
  };
}

/**
 * 使用 expect 脚本切换到 root 并执行多条命令
 * 参考 vue_zte3.0/build/deploy.exp 的实现
 *
 * @param {NodeSSH} ssh - SSH 实例
 * @param {string[]} cmds - 需要 root 权限执行的命令数组
 * @param {string} rootPassword - root 密码
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
async function execAsRoot(ssh, cmds, rootPassword) {
  if (!rootPassword) {
    throw new Error('未配置 rootPassword，无法执行提权操作');
  }

  const pw = rootPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  // 为每条命令生成 expect 片段：send "cmd\r" + expect "#"
  const cmdLines = cmds.map(c => {
    const escaped = c.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `send \\"${escaped}\\r\\"\nexpect \\"#\\"`;
  }).join('\n');

  // 完整 expect 脚本，与 deploy.exp 行为一致：
  // spawn su root → 匹配密码提示 → 等待 # → 逐条执行命令 → exit
  const script = `expect -c "
set timeout 120
spawn su root
expect {
  -re \\"口令|Password|密码\\" { send \\"${pw}\\r\\" }
}
expect \\"#\\"
send \\"\\r\\"
expect \\"#\\"
${cmdLines}
send \\"exit\\r\\"
expect eof
"`;

  return execRemote(ssh, script);
}

/**
 * 使用本地 tar 命令将目录打包成 .tar.gz 文件
 * @param {string} dirPath - 要打包的目录路径
 * @returns {string} 生成的临时 tar.gz 文件路径
 */
function createTarball(dirPath) {
  const absDir = path.resolve(dirPath);
  if (!fs.existsSync(absDir)) {
    throw new Error(`目录不存在: ${absDir}`);
  }

  const dirName = path.basename(absDir);
  const tmpFile = path.join(os.tmpdir(), `zp-cli-${dirName}-${Date.now()}.tar.gz`);

  try {
    // Windows 上使用 Git Bash 自带的 tar，或系统 tar
    execSync(`tar -czf "${tmpFile}" -C "${path.dirname(absDir)}" "${dirName}"`, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return tmpFile;
  } catch (err) {
    throw new Error(`打包目录失败: ${err.message}`);
  }
}

/**
 * 获取文件/目录大小（字节）
 * @param {string} filePath - 文件或目录路径
 * @returns {number} 大小（字节）
 */
function getSize(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    // 对于目录，粗略计算大小
    try {
      const output = execSync(`du -sh "${filePath}"`, { encoding: 'utf-8' });
      const sizeStr = output.split('\t')[0].trim();
      return parseHumanSize(sizeStr);
    } catch {
      return 0;
    }
  }
  return stat.size;
}

/**
 * 解析人类可读的文件大小字符串
 * @param {string} str - 如 "2.3M", "1.5G"
 * @returns {number} 字节数
 */
function parseHumanSize(str) {
  const units = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
  const match = str.match(/^([\d.]+)([KMG]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || '').toUpperCase();
  return num * (units[unit] || 1);
}

/**
 * 格式化文件大小为人类可读字符串
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的字符串
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 执行完整的部署流程
 * @param {Object} options - 部署参数
 * @param {Object} options.server - 服务器配置
 * @param {string} options.localPath - 本地文件/目录路径
 * @param {string} options.remoteBase - 远程目标基础路径
 * @param {string} options.relativePath - 文件相对于基础路径的相对路径
 * @param {boolean} [options.isDir] - 是否为目录上传
 * @param {Object} [options.permissions] - 权限配置 { user, group }
 */
async function deploy(options) {
  const { server, localPath, remoteBase, relativePath, isDir, permissions } = options;
  const ssh = new NodeSSH();

  try {
    // 1. 连接服务器
    logger.progress(`正在连接服务器 ${server.host}:${server.port || 22} ...`);
    await connectToServer(ssh, server);
    logger.success('SSH 连接成功');

    const tmpFiles = []; // 记录需要清理的临时文件

    try {
      let uploadFile = localPath;
      let remoteFileName;

      if (isDir) {
        // 2a. 目录上传：先打包
        logger.progress('正在打包目录 ...');
        uploadFile = createTarball(localPath);
        tmpFiles.push({ local: uploadFile, remote: null });

        const size = getSize(uploadFile);
        logger.progress(`打包完成，大小: ${formatSize(size)}`);

        remoteFileName = `zp-cli-tmp-${Date.now()}.tar.gz`;
      } else {
        // 2b. 单文件上传
        const size = getSize(localPath);
        logger.progress(`准备上传文件，大小: ${formatSize(size)}`);
        remoteFileName = path.basename(localPath);
      }

      // 3. 计算远程目标路径
      const remoteTmpDir = '/tmp/zp-cli-deploy';
      const remoteTmpPath = `${remoteTmpDir}/${remoteFileName}`;
      const finalPath = relativePath
        ? `${remoteBase}/${relativePath}`
        : remoteBase;

      // 4. 创建临时目录
      await execRemote(ssh, `mkdir -p ${remoteTmpDir}`);

      // 5. 上传文件
      logger.progress('正在上传文件 ...');
      await ssh.putFile(uploadFile, remoteTmpPath);
      logger.success('文件上传完成');

      // 6. 创建目标目录
      const targetDir = path.posix.dirname(finalPath);
      const needRoot = !!server.rootPassword;

      if (needRoot) {
        // ── 提权模式：参考 deploy.exp，一次性执行所有命令 ──
        logger.info('检测到 rootPassword，将使用提权模式执行');
        logger.progress('正在解压部署 ...');

        const cmds = [`mkdir -p ${targetDir}`];

        if (isDir) {
          cmds.push(`tar -xzf ${remoteTmpPath} -C ${targetDir}`);
          cmds.push(`rm -f ${remoteTmpPath}`);
        } else {
          cmds.push(`cp ${remoteTmpPath} ${finalPath}`);
          cmds.push(`rm -f ${remoteTmpPath}`);
        }

        // 权限操作：cd 到目标目录后对 * 操作（与原 deploy.exp 一致）
        if (permissions) {
          cmds.push(`cd ${targetDir}`);
          if (permissions.user) {
            cmds.push(`chown -R ${permissions.user} *`);
          }
          if (permissions.group) {
            cmds.push(`chgrp -R ${permissions.group} *`);
          }
          // 让普通用户能读取目录链（root mkdir -p / tar 创建的目录可能不允许普通用户访问）
          cmds.push(`chmod o+rx ${remoteBase}`);
          if (targetDir !== remoteBase) {
            cmds.push(`chmod o+rx ${targetDir}`);
          }
          if (finalPath !== targetDir) {
            cmds.push(`chmod o+rx ${finalPath}`);
          }
        }

        // ls -l 在 expect 里用 root 执行
        cmds.push(`ls -l ${finalPath}`);

        const result = await execAsRoot(ssh, cmds, server.rootPassword);

        if (result.code !== 0) {
          throw new Error(`部署失败: ${result.stderr}`);
        }

        logger.success('解压完成');

        // 从 expect 输出中提取 ls -l 结果（只保留 total 行和文件权限行）
        if (result.stdout) {
          const lines = result.stdout.split(/\r?\n/);
          const filtered = lines.filter(l => /^(total\s|[-d])/i.test(l.trim()));
          if (filtered.length > 0) {
            logger.newline();
            logger.info(`远程目录: ${finalPath}`);
            logger.log(filtered.join('\n'));
          }
        }

        if (permissions) {
          logger.info(`已设置权限: ${permissions.user || '-'}:${permissions.group || '-'}`);
        }

      } else {
        // ── 普通模式：无需提权 ──
        await execRemote(ssh, `mkdir -p ${targetDir}`);

        if (isDir) {
          logger.progress('正在解压部署 ...');
          const result = await execRemote(ssh, `tar -xzf ${remoteTmpPath} -C ${targetDir}`);
          if (result.code !== 0) {
            throw new Error(`解压失败: ${result.stderr}`);
          }
          logger.success('解压完成');
        } else {
          logger.progress('正在部署文件 ...');
          const result = await execRemote(ssh, `cp ${remoteTmpPath} ${finalPath}`);
          if (result.code !== 0) {
            throw new Error(`文件部署失败: ${result.stderr}`);
          }
        }

        // 清理临时文件
        await execRemote(ssh, `rm -f ${remoteTmpPath}`);

        // 设置权限
        if (permissions) {
          const { user, group } = permissions;
          if (user) {
            await execRemote(ssh, `chown -R ${user} ${targetDir}`);
          }
          if (group) {
            await execRemote(ssh, `chgrp -R ${group} ${targetDir}`);
          }
          logger.info(`已设置权限: ${user || '-'}:${group || '-'}`);
        }
      }

      // 清理远程临时文件（提权模式已在 expect 中清理）
      if (!needRoot) {
        await execRemote(ssh, `rm -f ${remoteTmpPath}`);
      }
      logger.success('远程临时文件已清理');

      logger.newline();
      logger.success(`部署成功！远程路径: ${finalPath}`);

    } finally {
      // 清理本地临时文件
      for (const tmp of tmpFiles) {
        if (tmp.local && fs.existsSync(tmp.local)) {
          try { fs.unlinkSync(tmp.local); } catch {}
        }
      }
      // 关闭 SSH 连接
      ssh.dispose();
    }

  } catch (err) {
    ssh.dispose();
    throw err;
  }
}

/**
 * 建立 SSH 连接（内部方法）
 */
async function connectToServer(ssh, server) {
  const config = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 30000
  };

  if (server.privateKeyPath && fs.existsSync(server.privateKeyPath)) {
    config.privateKey = fs.readFileSync(server.privateKeyPath, 'utf-8');
  } else if (server.password) {
    config.password = server.password;
  }

  try {
    await ssh.connect(config);
  } catch (err) {
    throw new Error(`SSH 连接失败 (${server.host}:${config.port}): ${err.message}`);
  }
}

module.exports = {
  connect,
  execRemote,
  execAsRoot,
  createTarball,
  deploy,
  formatSize
};
