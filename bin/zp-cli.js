#!/usr/bin/env node

/**
 * zp-cli - 命令行部署工具主入口
 * 使用 commander 解析命令行参数，提供 init / upload / config 子命令
 */
const { Command } = require('commander');
const chalk = require('chalk');
const configManager = require('../lib/core/configManager');
const logger = require('../lib/utils/logger');
const pkg = require('../package.json');

const program = new Command();

program
  .name('zp-cli')
  .description('zp-cli - 高效的命令行部署工具，将本地代码通过 SSH 部署到远程服务器')
  .version(pkg.version, '-v, --version', '显示版本号');

// ========== init 命令 ==========
program
  .command('init')
  .alias('i')
  .description('生成 demo 配置文件 ~/.zp-cli.json')
  .action(async () => {
    const initCmd = require('../lib/commands/init');
    await initCmd.run();
  });

// ========== upload 命令 ==========
program
  .command('upload <路径>')
  .alias('up')
  .description('上传文件或目录到远程服务器')
  .option('-s, --server <别名>', '指定目标服务器别名')
  .option('-r, --remote-path <路径>', '指定远程目标路径（覆盖配置中的默认值）')
  .action(async (localPath, options) => {
    const uploadCmd = require('../lib/commands/upload');
    await uploadCmd.run(localPath, options);
  });

// ========== config 命令（查看/管理配置） ==========
const configCmd = program
  .command('config')
  .alias('c')
  .description('查看和管理配置信息');

configCmd
  .command('show')
  .alias('ls')
  .description('显示当前配置文件内容')
  .action(() => {
    const config = configManager.loadConfig();
    if (!config) {
      logger.error('配置文件不存在，请先执行 ' + chalk.cyan('zp-cli init'));
      process.exit(1);
    }
    logger.log(chalk.bold('\n📋 当前配置:\n'));
    logger.log(JSON.stringify(config, null, 2));
    logger.newline();
    logger.log(chalk.gray(`配置文件路径: ${configManager.getConfigPath()}`));
  });

configCmd
  .command('path')
  .alias('p')
  .description('显示配置文件路径')
  .action(() => {
    logger.log(configManager.getConfigPath());
  });

// ========== 未提供子命令时显示帮助 ==========
program.on('command:*', () => {
  logger.error(`未知命令: ${program.args.join(' ')}`);
  logger.log('');
  program.help();
});

// 如果没有输入任何命令，显示帮助
if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);
