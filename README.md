# zp-cli

将本地代码通过 SSH 部署到远程服务器的命令行工具。支持单文件/目录上传，支持同一仓库不同子目录部署到不同服务器，并支持通过同步服务管理 `~/.zp-cli.json`。

## 安装

```bash
npm install -g @wxuns/zp-cli
```

## 快速开始

```bash
# 1. 生成配置文件模板
zp-cli init

# 2. 编辑配置文件，填入你的服务器信息
#    Windows: notepad %USERPROFILE%\.zp-cli.json
#    Linux/Mac: vim ~/.zp-cli.json

# 3. 上传文件
zp-cli upload ./dist/index.html
zp-cli upload ./dist
```

---

## 命令一览

| 命令 | 说明 |
|------|------|
| `zp-cli init` | 生成 demo 配置文件 `~/.zp-cli.json` |
| `zp-cli upload <路径>` | 上传文件或目录到远程服务器 |
| `zp-cli sync push/pull/history/restore` | 通过独立同步服务管理 `~/.zp-cli.json` |
| `zp-cli config show` | 查看当前配置内容 |
| `zp-cli config path` | 显示配置文件路径 |
| `zp-cli --help` | 查看帮助 |
| `zp-cli -v` | 查看版本 |

### upload 命令选项

```bash
zp-cli upload <路径> [选项]

选项:
  -s, --server <别名>       指定目标服务器（覆盖自动匹配）
  -r, --remote-path <路径>  指定远程目标路径（覆盖配置中的默认值）
```

### sync 命令

`sync` 用于管理 `~/.zp-cli.json` 的远端同步副本，不依赖 SSH 部署服务器。

```bash
zp-cli sync push                      # 推送本地 ~/.zp-cli.json 到同步服务
zp-cli sync pull                      # 从同步服务拉取配置覆盖本地
zp-cli sync history                   # 查看服务端历史版本
zp-cli sync restore <历史文件名>       # 恢复历史版本并同步到本地
```

别名：

```bash
zp-cli s push
zp-cli s pull
```

---

## 配置文件说明

配置文件路径：`~/.zp-cli.json`（Windows 下为 `%USERPROFILE%\.zp-cli.json`）

执行 `zp-cli init` 会生成如下 demo 配置：

```jsonc
{
  "syncService": {
    "url": "https://your-domain.com/zp-sync/api.php", // 同步服务 API 地址
    "apiPassword": "your-api-password"                 // 同步服务 API 密码
  },

  "servers": [
    {
      "alias": "test-server",          // 服务器别名，命令行中用于指定目标
      "host": "192.168.1.100",          // 服务器 IP 或域名
      "port": 22,                       // SSH 端口，默认 22
      "username": "root",               // SSH 登录用户名
      "password": "your-password",      // 密码认证（与 privateKeyPath 二选一）
      "privateKeyPath": "~/.ssh/id_rsa",// 私钥认证（与 password 二选一）
      "defaultRemotePath": "/home/www", // 默认远程目录（可被 --remote-path 覆盖）
      "rootPassword": "",               // root 密码，需要 su root 时填写
      "reuseMapping": ""                // 复用其他服务器别名的路径映射，例如 hw2 复用 hw
    }
  ],

  "mappings": [
    {
      "gitRemoteUrl": "git@github.com:yourorg/project.git",
      "serverAlias": "test-server",
      "remotePath": "/var/www/project",
      "subdirectoryMappings": {}
    }
  ]
}
```

### syncService 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 选填 | 同步服务 API 地址，例如 `https://your-domain.com/zp-sync/api.php` |
| `apiPassword` | string | 选填 | 调用同步服务的 API 密码。仅使用 `sync` 命令时需要 |

> `syncService` 只用于同步管理 `~/.zp-cli.json`，和 SSH 部署服务器无关。

### servers 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `alias` | string | **必填** | 服务器别名，用于 `--server` 参数和 `mappings` 中引用 |
| `host` | string | **必填** | 服务器 IP 或域名 |
| `port` | number | 选填 | SSH 端口，默认 `22` |
| `username` | string | **必填** | 登录用户名 |
| `password` | string | **条件必填** | 登录密码，与 `privateKeyPath` 至少填一个 |
| `privateKeyPath` | string | **条件必填** | SSH 私钥路径，与 `password` 至少填一个。支持 `~` |
| `defaultRemotePath` | string | 选填 | 默认远程部署目录，可被 `--remote-path` 覆盖 |
| `rootPassword` | string | 选填 | root 密码，需要提权操作时填写 |
| `reuseMapping` | string | 选填 | 复用其他服务器别名的路径映射。例如服务器 `hw2` 配置 `"reuseMapping": "hw"` 后，`--server hw2` 会使用 `targets.hw` 的远程路径 |

> **条件必填**：`password` 和 `privateKeyPath` 至少填一个。同时存在时优先使用 `privateKeyPath`。

### mappings 字段

每条映射将一个 Git 仓库关联到服务器部署路径。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `gitRemoteUrl` | string | **必填** | Git 远程仓库地址，支持 SSH 和 HTTPS 两种格式（自动归一化匹配） |
| `serverAlias` | string | **条件必填** | 目标服务器别名，有子映射时可省略 |
| `remotePath` | string | **条件必填** | 远程部署根路径，有子映射时可省略 |
| `subdirectoryMappings` | object | 选填 | 子目录映射，可将仓库不同子目录部署到不同路径/服务器 |

> **条件必填**：如果所有文件都通过 `subdirectoryMappings` 映射到具体服务器和路径，则顶层 `serverAlias` 和 `remotePath` 可省略。否则必须填写。
>
> **优先级**：子目录映射 > 映射顶层 `serverAlias` / `remotePath`

### 子目录映射（subdirectoryMappings）

支持两种格式：

**格式一：字符串 — 同服务器不同路径**

```json
"subdirectoryMappings": {
  "web": "/var/www/project/frontend"
}
```

上传 `./web/index.js` → 部署到 `/var/www/project/frontend/index.js`

**格式二：对象 — 部署到不同服务器**

```json
"subdirectoryMappings": {
  "api": {
    "serverAlias": "backend-server",
    "remotePath": "/opt/services/api"
  }
}
```

上传 `./api/main.py` → 部署到 `backend-server` 的 `/opt/services/api/main.py`

**支持多级子目录匹配：**

```json
"subdirectoryMappings": {
  "hw/data": {
    "serverAlias": "hw",
    "remotePath": "/home/vsp/vsc/tomcat/webapps/VSC/EPG/jsp/defaultv6hy/data"
  }
}
```

上传 `./hw/data/index.json` → 部署到 `hw` 的 `/home/vsp/vsc/tomcat/webapps/VSC/EPG/jsp/defaultv6hy/data/index.json`

> 多个映射同时命中时，会优先使用最长匹配。例如同时存在 `hw` 和 `hw/data`，上传 `./hw/data/a.json` 会优先匹配 `hw/data`。
>
> 映射 key 支持仓库根目录名前缀。例如 Git 根目录为 `specialArea` 时，`hw/hy` 和 `specialArea/hw/hy` 都可以匹配本地 `./hw/hy`。

**同一个子目录部署到不同服务器/路径：**

```json
"subdirectoryMappings": {
  "hw/data": {
    "targets": {
      "hw": "/home/vsp/vsc/tomcat/webapps/VSC/EPG/jsp/defaultv6hy/data",
      "zx": "/home/zxin10/was/tomcat/webapps/iptvepg/frame1003/main/data"
    }
  }
}
```

使用时通过 `--server` 选择目标：

```bash
zp-cli up ./hw/data --server hw
zp-cli up ./hw/data --server zx
```

也支持简写格式：

```json
"subdirectoryMappings": {
  "hw/data": {
    "hw": "/home/vsp/vsc/tomcat/webapps/VSC/EPG/jsp/defaultv6hy/data",
    "zx": "/home/zxin10/was/tomcat/webapps/iptvepg/frame1003/main/data"
  }
}
```

如果不指定 `--server` 且同一子目录配置了多个目标，会提示你指定服务器。

如果多台服务器路径结构相同，可以在服务器配置里使用 `reuseMapping` 复用路径映射：

```json
"servers": [
  {
    "alias": "hw",
    "host": "117.146.223.166"
  },
  {
    "alias": "hw2",
    "host": "117.146.223.143",
    "reuseMapping": "hw"
  }
]
```

此时执行：

```bash
zp-cli up ./hw/data --server hw2
```

会连接 `hw2` 服务器，但路径映射使用 `targets.hw`。

**对象格式字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serverAlias` | string | 条件必填 | 单目标对象格式中的目标服务器别名 |
| `remotePath` | string | 条件必填 | 单目标对象格式中的部署路径 |
| `targets` | object | 条件必填 | 多目标格式，key 为服务器别名，value 为部署路径或 `{ remotePath }` 对象 |
| `defaultServerAlias` | string | 选填 | 多目标格式未指定 `--server` 时默认使用的服务器别名 |

**完整示例：**

```json
{
  "servers": [
    { "alias": "web-server",     "host": "10.0.0.1", "username": "root", "password": "xxx" },
    { "alias": "backend-server", "host": "10.0.0.2", "username": "root", "password": "xxx" }
  ],
  "mappings": [
    {
      "gitRemoteUrl": "git@github.com:yourorg/mono-repo.git",
      "serverAlias": "web-server",
      "remotePath": "/var/www/mono",
      "subdirectoryMappings": {
        "web": "/var/www/mono/frontend",
        "api": {
          "serverAlias": "backend-server",
          "remotePath": "/opt/services/api"
        },
        "config": "/etc/mono-repo"
      }
    }
  ]
}
```

对应部署结果：

| 上传路径 | 目标服务器 | 远程路径 |
|---------|-----------|---------|
| `./web/index.js` | web-server | `/var/www/mono/frontend/index.js` |
| `./api/main.py` | **backend-server** | `/opt/services/api/main.py` |
| `./config/app.conf` | web-server | `/etc/mono-repo/app.conf` |
| `./README.md` | web-server | `/var/www/mono/README.md` |

**纯子目录映射示例**（顶层不设 serverAlias/remotePath，全部由子映射决定）：

```json
{
  "servers": [
    { "alias": "web-server",     "host": "10.0.0.1", "username": "root", "password": "xxx" },
    { "alias": "backend-server", "host": "10.0.0.2", "username": "root", "password": "xxx" }
  ],
  "mappings": [
    {
      "gitRemoteUrl": "git@github.com:yourorg/full-stack.git",
      "subdirectoryMappings": {
        "frontend": {
          "serverAlias": "web-server",
          "remotePath": "/var/www/frontend"
        },
        "backend": {
          "serverAlias": "backend-server",
          "remotePath": "/opt/services/backend"
        }
      }
    }
  ]
}
```

| 上传路径 | 目标服务器 | 远程路径 |
|---------|-----------|---------|
| `./frontend/index.html` | web-server | `/var/www/frontend/index.html` |
| `./backend/app.py` | **backend-server** | `/opt/services/backend/app.py` |
| `./README.md` | ❌ 报错 | 未匹配到子映射，且无顶层回退路径 |

---

## Git URL 匹配规则

配置中的 `gitRemoteUrl` 和实际仓库的 `origin` 地址会自动归一化后匹配，以下写法等价：

```
git@github.com:org/repo.git          ←→  https://github.com/org/repo.git
ssh://git@github.com:22/org/repo.git ←→  git@github.com:org/repo.git
git@gitlab.com:group/sub/repo.git    ←→  https://gitlab.com/group/sub/repo.git
```

---

## 部署流程

执行 `zp-cli upload` 时的完整流程：

```
1. 检查本地路径是否存在
2. 读取 ~/.zp-cli.json 配置
3. 确定目标服务器和远程路径
   ├─ 命令行指定了 --server / --remote-path → 直接使用
   └─ 未指定 → 读取 .git/config 获取 origin 地址 → 匹配 mappings
4. 建立 SSH 连接
5. 如果是目录 → 本地 tar -czf 打包
6. 上传文件到服务器 /tmp 临时目录
7. 在服务器上解压/复制到目标路径
8. 清理远程临时文件
9. 关闭连接
```

---

## 常见问题

**Q: 报错"配置文件不存在"**
A: 先执行 `zp-cli init` 生成配置文件。

**Q: 报错"无法自动确定部署目标"**
A: 当前目录不在 Git 仓库内，或配置文件中没有匹配的映射。可以用 `--server` 和 `--remote-path` 手动指定。

**Q: 如何部署到同一台服务器的不同目录？**
A: 在 `subdirectoryMappings` 中用字符串格式配置即可。

**Q: 如何将仓库的不同子目录部署到不同服务器？**
A: 在 `subdirectoryMappings` 中用对象格式，指定 `serverAlias` 和 `remotePath`。

**Q: Windows 上打包报错？**
A: 确保系统中有 `tar` 命令（Git Bash 自带）。或使用 WSL。

---

## 项目结构

```
zp-cli/
├── package.json
├── bin/
│   └── zp-cli.js              # 主入口
├── lib/
│   ├── commands/
│   │   ├── init.js             # 生成 demo 配置
│   │   ├── upload.js           # 上传部署逻辑
│   │   └── sync.js             # 独立配置同步服务命令
│   ├── core/
│   │   ├── configManager.js    # 配置读写
│   │   ├── gitHelper.js        # Git 仓库感知、URL 归一化、路径映射
│   │   └── sshDeployer.js      # SSH 连接、打包、上传、解压
│   └── utils/
│       └── logger.js           # 终端彩色输出
├── backend/
│   └── php/                    # 同步服务参考实现
└── README.md
```

## License

MIT
