/**
 * sync.js - 独立配置同步服务命令
 * 通过 HTTP API 双向同步 ~/.zp-cli.json
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const chalk = require('chalk');
const configManager = require('../core/configManager');
const logger = require('../utils/logger');

function getTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getSyncService() {
  const config = configManager.loadConfig();
  if (!config) {
    throw new Error('配置文件不存在，请先执行 zp-cli init');
  }

  const service = config.syncService;
  if (!service || !service.url || !service.apiPassword) {
    throw new Error('未配置 syncService.url 或 syncService.apiPassword');
  }

  return service;
}

function request(service, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(service.url);
    const body = new URLSearchParams({
      ...payload,
      password: service.apiPassword
    }).toString();

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch (err) {
          if (/<!doctype html|<html/i.test(data)) {
            return reject(new Error('同步服务返回 HTML 页面，请检查 syncService.url 是否填写为 api.php，而不是 index.php 或目录地址'));
          }
          return reject(new Error(`同步服务返回非 JSON 内容: ${data.slice(0, 200)}`));
        }

        if (res.statusCode < 200 || res.statusCode >= 300 || !json.success) {
          return reject(new Error(json.message || `同步服务请求失败: HTTP ${res.statusCode}`));
        }

        resolve(json);
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('同步服务请求超时'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function backupLocalConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;

  const backupPath = `${configPath}.bak-${getTimestamp()}`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

async function push() {
  const service = getSyncService();
  const configPath = configManager.getConfigPath();
  const content = fs.readFileSync(configPath, 'utf-8');

  logger.progress('正在推送本地配置到同步服务 ...');
  const result = await request(service, {
    action: 'push',
    content
  });

  logger.success(result.message || '配置推送完成');
}

async function pull() {
  const service = getSyncService();
  const configPath = configManager.getConfigPath();

  logger.progress('正在从同步服务拉取配置 ...');
  const result = await request(service, { action: 'pull' });
  if (typeof result.content !== 'string') {
    throw new Error('同步服务未返回配置内容');
  }

  JSON.parse(result.content);
  const backupPath = backupLocalConfig(configPath);
  fs.writeFileSync(configPath, result.content, 'utf-8');

  if (backupPath) {
    logger.info(`本地旧配置已备份: ${backupPath}`);
  }
  logger.success('配置拉取完成');
}

async function history() {
  const service = getSyncService();

  logger.progress('正在读取远程历史版本 ...');
  const result = await request(service, { action: 'history' });
  const list = Array.isArray(result.history) ? result.history : [];

  if (list.length === 0) {
    logger.warn('暂无历史版本');
    return;
  }

  logger.log(chalk.bold('\n远程历史版本:\n'));
  list.forEach(item => {
    logger.log(`${item.name}\t${item.size || '-'}\t${item.time || '-'}`);
  });
}

async function restore(file) {
  if (!file) {
    throw new Error('请指定要恢复的历史文件名');
  }

  const service = getSyncService();
  const configPath = configManager.getConfigPath();

  logger.progress(`正在恢复远程历史版本: ${file}`);
  const result = await request(service, {
    action: 'restore',
    file
  });

  if (typeof result.content !== 'string') {
    throw new Error('同步服务未返回恢复后的配置内容');
  }

  JSON.parse(result.content);
  const backupPath = backupLocalConfig(configPath);
  fs.writeFileSync(configPath, result.content, 'utf-8');

  if (backupPath) {
    logger.info(`本地旧配置已备份: ${backupPath}`);
  }
  logger.success(result.message || '历史版本恢复完成');
}

async function run(command, file) {
  try {
    if (command === 'push') return await push();
    if (command === 'pull') return await pull();
    if (command === 'history' || command === 'list') return await history();
    if (command === 'restore') return await restore(file);

    logger.error(`未知 sync 命令: ${command || ''}`);
    logger.log('用法:');
    logger.log('  zp-cli sync push');
    logger.log('  zp-cli sync pull');
    logger.log('  zp-cli sync history');
    logger.log('  zp-cli sync restore <历史文件名>');
    process.exit(1);
  } catch (err) {
    logger.error(`同步失败: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { run };
