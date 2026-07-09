# zp-cli PHP 配置同步服务

这是一个独立的 `.zp-cli.json` 同步服务，提供：

- Web 管理面板登录
- 查看、编辑、下载 `.zp-cli.json`
- CLI HTTP API：push / pull / history / restore
- 保存前自动备份历史版本
- 自动清理历史，只保留最近 N 次

## 部署

将 `backend/php` 目录上传到支持 PHP 的 Web 服务目录，例如：

```text
/var/www/zp-sync
```

访问：

```text
https://your-domain.com/zp-sync/index.php
```

CLI API 地址为：

```text
https://your-domain.com/zp-sync/api.php
```

## 修改密码

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

## 数据目录

默认数据保存到：

```text
backend/php/data/.zp-cli.json
backend/php/data/.history/
```

可在 `config.php` 中修改：

```php
'data_dir' => __DIR__ . '/data',
'config_file' => __DIR__ . '/data/.zp-cli.json',
'history_dir' => __DIR__ . '/data/.history',
'history_limit' => 10,
```

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

## 安全建议

- 使用 HTTPS 部署。
- 修改默认密码。
- 确保 `data` 目录不可被直接浏览下载。
- 如果使用 Nginx/Apache，建议禁止直接访问 `data` 目录。
