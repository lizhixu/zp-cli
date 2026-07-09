# zp-cli PHP 配置同步服务

这是一个独立的 `.zp-cli.json` 配置管理与同步服务，适合部署到支持 PHP 的 Web 环境中，为 `zp-cli sync` 命令提供远端配置存储能力。

## 功能

- Web 管理面板登录
- 查看、编辑、下载 `.zp-cli.json`
- 历史版本预览、恢复、删除
- CLI HTTP API：push / pull / history / restore
- 保存前自动备份历史版本
- 自动清理历史，只保留最近 N 次

## 文件说明

```text
backend/php/
├── index.php       # Web 管理面板
├── api.php         # CLI 同步 API
├── auth.php        # 鉴权、CSRF、配置读写、历史版本工具函数
├── config.php      # 账号、密码 hash、数据目录等配置
├── logout.php      # 管理面板退出登录
├── .htaccess       # Apache 访问限制示例
└── data/           # 配置文件和历史备份目录，运行后自动创建
```

## 环境要求

- PHP 7.4+ 或 PHP 8.x
- Web 服务器支持 PHP，例如 Apache / Nginx + PHP-FPM
- PHP 进程对 `data` 目录有读写权限

管理面板使用 Monaco Editor（通过 jsDelivr CDN）。如果内网无法访问 CDN，请自行替换 `index.php` 中的 `loader.js` 地址。

## 部署

### 1. 上传目录

将 `backend/php` 目录上传到 PHP Web 服务目录，例如：

```text
/var/www/zp-sync
```

对应访问地址示例：

```text
https://your-domain.com/zp-sync/index.php
```

CLI API 地址示例：

```text
https://your-domain.com/zp-sync/api.php
```

### 2. 配置 Web 服务

Apache 可直接使用目录内的 `.htaccess`，默认会阻止访问：

```text
config.php
data/
```

Nginx 建议增加类似规则，禁止直接访问敏感文件和数据目录：

```nginx
location ~ /zp-sync/(config\.php|data/) {
    deny all;
}
```

### 3. 设置目录权限

确保 PHP 进程可以写入 `data` 目录。如果目录不存在，程序会尝试自动创建。

```bash
mkdir -p /var/www/zp-sync/data/.history
chown -R www-data:www-data /var/www/zp-sync/data
chmod -R 750 /var/www/zp-sync/data
```

> `www-data` 需要按实际 PHP 运行用户调整。

### 4. 修改默认密码

默认 Web 登录密码和 API 密码都是：

```text
password
```

上线前必须修改 `config.php` 中的 hash。

生成 hash：

```bash
php -r "echo password_hash('你的管理密码', PASSWORD_DEFAULT), PHP_EOL;"
php -r "echo password_hash('你的 API 密码', PASSWORD_DEFAULT), PHP_EOL;"
```

然后分别替换：

```php
'admin_password_hash' => '...',
'api_password_hash' => '...',
```

## 配置项

`config.php` 默认配置示例：

```php
return [
    'admin_user' => 'admin',
    'admin_password_hash' => '...',
    'api_password_hash' => '...',
    'data_dir' => __DIR__ . '/data',
    'config_file' => __DIR__ . '/data/.zp-cli.json',
    'history_dir' => __DIR__ . '/data/.history',
    'history_limit' => 10,
];
```

| 配置项 | 说明 |
|--------|------|
| `admin_user` | Web 管理面板登录用户名 |
| `admin_password_hash` | Web 管理面板登录密码 hash |
| `api_password_hash` | CLI API 密码 hash |
| `data_dir` | 数据目录 |
| `config_file` | 当前 `.zp-cli.json` 保存路径 |
| `history_dir` | 历史备份目录 |
| `history_limit` | 自动保留的历史版本数量 |

## 数据目录

默认数据保存到：

```text
backend/php/data/.zp-cli.json
backend/php/data/.history/
```

每次通过 Web 面板保存或 API push 前，都会先备份当前配置到 `.history` 目录。

## Web 管理面板

访问：

```text
https://your-domain.com/zp-sync/index.php
```

登录后可进行：

- 在线编辑当前 `.zp-cli.json`
- 格式化 JSON
- 下载当前配置
- 预览历史版本
- 恢复历史版本
- 删除历史备份

## CLI 配置

在本地 `~/.zp-cli.json` 中添加：

```json
{
  "syncService": {
    "url": "https://your-domain.com/zp-sync/api.php",
    "apiPassword": "你的 API 密码"
  }
}
```

使用：

```bash
zp-cli sync push
zp-cli sync pull
zp-cli sync history
zp-cli sync restore .zp-cli-20260709-120000.json
```

## API 说明

API 地址：

```text
https://your-domain.com/zp-sync/api.php
```

所有请求使用 `POST`，并通过表单字段传参。

公共字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `password` | 是 | API 密码 |
| `action` | 是 | 操作类型 |

支持的 `action`：

| action | 说明 | 额外字段 |
|--------|------|----------|
| `push` | 上传并覆盖服务端配置 | `content` |
| `pull` | 拉取服务端当前配置 | - |
| `history` / `list` | 查看历史版本列表 | - |
| `restore` | 恢复指定历史版本 | `file` |

## 安全建议

- 使用 HTTPS 部署。
- 上线前立即修改默认 Web 登录密码和 API 密码。
- 禁止直接访问 `config.php` 和 `data` 目录。
- 不要将 `data` 目录提交到 Git。
- 定期检查历史备份数量和磁盘空间。
- 如部署在公网，建议增加 Web 服务器层面的访问限制。
