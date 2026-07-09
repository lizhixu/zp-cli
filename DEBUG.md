# zp-cli 本地调试指南

## npm link 全局链接

将本地项目链接到全局，使 `zp-cli` 命令直接指向本地代码，修改代码后立即生效。

### 链接

```bash
cd D:/epg/codes/zp-cli
npm link
```

执行后 `zp-cli` 命令将指向当前目录，可以直接使用：

```bash
zp-cli --help
zp-cli init
zp-cli upload ./some-file --server <服务器别名> --remote-path /tmp/test
zp-cli sync history
```

### 取消链接

```bash
cd D:/epg/codes/zp-cli
npm unlink -g zp-cli
```

或直接全局卸载：

```bash
npm uninstall -g zp-cli
```

### 验证链接状态

```bash
# 查看 zp-cli 命令指向的路径
which zp-cli

# 应输出类似：
# /c/Users/<用户名>/AppData/Roaming/npm/zp-cli -> /d/epg/codes/zp-cli/bin/zp-cli.js
```

---

## 调试流程

### 1. 基础命令测试

```bash
# 帮助信息
zp-cli --help
zp-cli upload --help
zp-cli init --help
zp-cli sync history

# 版本
zp-cli -v

# 配置路径
zp-cli config path

# 查看配置
zp-cli config show
```

### 2. 初始化配置

```bash
# 生成 demo 配置
zp-cli init

# 编辑配置文件，填入真实的服务器信息
notepad %USERPROFILE%\.zp-cli.json
```

### 3. 上传测试

```bash
# 指定服务器和远程路径（跳过 Git 匹配）
zp-cli upload ./test.txt --server <服务器别名> --remote-path /tmp/test.txt

# 上传目录
zp-cli upload ./dist --server <服务器别名> --remote-path /tmp/dist

# 在 Git 仓库内，自动匹配（需要先配好 mappings）
zp-cli upload ./vue_zte3.0/dist
```

### 4. 同步服务测试

先在 `~/.zp-cli.json` 中配置：

```json
"syncService": {
  "url": "http://127.0.0.1:8080/api.php",
  "apiPassword": "password"
}
```

启动 PHP 内置服务：

```bash
cd backend/php
php -S 127.0.0.1:8080
```

测试 CLI：

```bash
zp-cli sync push
zp-cli sync history
zp-cli sync pull
```

浏览器访问：

```text
http://127.0.0.1:8080/index.php
```

默认用户名/密码：`admin` / `password`。

### 5. 查看部署结果

```bash
# 登录服务器验证（根据实际配置替换信息）
ssh <用户名>@<服务器地址> "ls -la /tmp/"
```

---

## 常见问题

### 命令找不到

```bash
# 检查 npm 全局 bin 目录是否在 PATH 中
npm config get prefix

# Windows 下通常在：
# C:\Users\<用户名>\AppData\Roaming\npm
```

### 修改代码后不生效

npm link 后修改代码会立即生效，无需重新 link。如果出现缓存问题：

```bash
# 重新 link
npm unlink -g zp-cli
npm link
```

### 权限问题（Linux/Mac）

```bash
sudo npm link
```

### Windows 上 tar 命令报错

确保使用 Git Bash 终端运行，Git Bash 自带 tar 命令。或安装 WSL。
