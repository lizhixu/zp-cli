/**
 * logger.js - 终端日志输出工具
 * 使用 chalk 为终端输出添加颜色和图标
 */
const chalk = require('chalk');

const logger = {
  /**
   * 输出成功信息（绿色 ✓）
   * @param {string} msg - 日志信息
   */
  success(msg) {
    console.log(chalk.green(`✓ ${msg}`));
  },

  /**
   * 输出普通信息（蓝色 ℹ）
   * @param {string} msg - 日志信息
   */
  info(msg) {
    console.log(chalk.blue(`ℹ ${msg}`));
  },

  /**
   * 输出警告信息（黄色 ⚠）
   * @param {string} msg - 日志信息
   */
  warn(msg) {
    console.log(chalk.yellow(`⚠ ${msg}`));
  },

  /**
   * 输出错误信息（红色 ✗）
   * @param {string} msg - 日志信息
   */
  error(msg) {
    console.error(chalk.red(`✗ ${msg}`));
  },

  /**
   * 输出进度信息（青色 →）
   * @param {string} msg - 日志信息
   */
  progress(msg) {
    console.log(chalk.cyan(`→ ${msg}`));
  },

  /**
   * 输出普通文本（无前缀）
   * @param {string} msg - 日志信息
   */
  log(msg) {
    console.log(msg);
  },

  /**
   * 输出空行
   */
  newline() {
    console.log('');
  }
};

module.exports = logger;
