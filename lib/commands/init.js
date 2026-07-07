/**
 * init.js - 配置初始化命令
 * 直接生成一个 demo 配置文件，用户自行修改
 */
const chalk = require('chalk');
const logger = require('../utils/logger');
const configManager = require('../core/configManager');

/** demo 配置模板 */
const DEMO_CONFIG = {
  servers: [
    {
      alias: "test-server",
      host: "192.168.1.100",
      port: 22,
      username: "root",
      password: "your-password",
      // privateKeyPath: "~/.ssh/id_rsa",  // 私钥认证，与 password 二选一
      defaultRemotePath: "/home/www",
      rootPassword: ""                       // 需要 su root 时填写
    },
    {
      alias: "prod-server",
      host: "10.0.0.1",
      port: 22,
      username: "deploy",
      password: "",
      privateKeyPath: "~/.ssh/id_rsa",
      defaultRemotePath: "/home/www",
      rootPassword: ""
    },
    {
      alias: "prod-server-2",
      host: "10.0.0.2",
      port: 22,
      username: "deploy",
      password: "",
      privateKeyPath: "~/.ssh/id_rsa",
      defaultRemotePath: "/home/www",
      rootPassword: "",
      reuseMapping: "prod-server"           // 复用 prod-server 的路径映射
    }
  ],

  mappings: [
    // ── 示例1：整个仓库部署到同一台服务器 ──
    {
      "gitRemoteUrl": "git@github.com:yourorg/simple-project.git",
      "serverAlias": "test-server",
      "remotePath": "/var/www/simple-project"
    },

    // ── 示例2：同一仓库，不同子目录部署到不同服务器（顶层 + 子映射混合） ──
    {
      "gitRemoteUrl": "git@github.com:yourorg/mono-repo.git",
      "serverAlias": "test-server",
      "remotePath": "/var/www/mono",
      "subdirectoryMappings": {
        "web": "/var/www/mono/frontend",
        "api": {
          "serverAlias": "prod-server",
          "remotePath": "/opt/services/api"
        },
        "hw/data": {
          "targets": {
            "test-server": "/var/www/mono/hw-data",
            "prod-server": "/opt/services/hw-data"
          }
        }
      }
    },

    // ── 示例3：纯子目录映射，serverAlias/remotePath 全在子映射里 ──
    {
      "gitRemoteUrl": "git@github.com:yourorg/full-stack.git",
      "subdirectoryMappings": {
        "frontend": {
          "serverAlias": "test-server",
          "remotePath": "/var/www/frontend"
        },
        "backend": {
          "serverAlias": "prod-server",
          "remotePath": "/opt/services/backend"
        }
      }
    }
  ]
};

/**
 * 执行 init 命令
 */
async function run() {
  const configPath = configManager.getConfigPath();

  // 已存在则提示
  if (configManager.configExists()) {
    logger.warn(`配置文件已存在: ${configPath}`);
    logger.log(chalk.gray('如需重新生成，请先手动删除该文件'));
    return;
  }

  configManager.saveConfig(DEMO_CONFIG);
  logger.success(`配置文件已生成: ${configPath}`);
  logger.newline();
  logger.log(chalk.bold('请编辑配置文件，填入你的服务器信息和仓库映射。'));
  logger.log(chalk.gray('详细说明请参考 README.md 或执行 zp-cli init --help'));
}

module.exports = { run };
