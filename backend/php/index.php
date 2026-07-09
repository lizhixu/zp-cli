<?php
require __DIR__ . '/auth.php';

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    if (!zp_verify_csrf_token()) {
        $error = '登录请求校验失败，请刷新页面重试';
    } elseif (zp_check_admin_login($_POST['username'] ?? '', $_POST['password'] ?? '')) {
        $_SESSION['zp_cli_admin_logged_in'] = true;
        header('Location: index.php');
        exit;
    } else {
        $error = '用户名或密码错误';
    }
}

if (isset($_GET['download'])) {
    zp_require_login();
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename=".zp-cli.json"');
    echo zp_current_content();
    exit;
}

if (zp_is_logged_in() && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!zp_verify_csrf_token()) {
        $error = '表单校验失败，请刷新页面重试';
    } else {
        try {
            $action = $_POST['action'] ?? '';
            if ($action === 'save') {
                zp_write_config($_POST['content'] ?? '');
                $message = '配置保存成功';
            } elseif ($action === 'restore') {
                zp_restore_history($_POST['file'] ?? '');
                $message = '历史版本恢复成功';
            }
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
    }
}

if (!zp_is_logged_in()):
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zp-cli 配置管理登录</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f5f7fb;margin:0;padding:40px;color:#111827}
    body::before{content:"";position:fixed;inset:0;background:linear-gradient(135deg,#eef2ff 0%,#f8fafc 50%,#e8f0ff 100%);z-index:-1}
    .box{width:420px;margin:10vh auto 0;background:#fff;border-radius:14px;padding:32px 34px;box-shadow:0 16px 48px rgba(17,24,39,.08),0 2px 10px rgba(17,24,39,.04)}
    h2{margin:0 0 6px;font-size:22px}
    p.lead{margin:0 0 18px;color:#6b7280;font-size:14px}
    label{display:block;margin-top:14px;font-size:13px;color:#374151}
    input[type="text"],input[type="password"]{width:100%;box-sizing:border-box;margin-top:6px;padding:11px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff;transition:border-color .2s,box-shadow .2s}
    input:focus{outline:none;border-color:#1677ff;box-shadow:0 0 0 3px rgba(22,119,255,.15)}
    button{width:100%;box-sizing:border-box;margin-top:18px;padding:12px;border:0;border-radius:8px;font-size:15px;background:linear-gradient(180deg,#2563eb,#1d4ed8);color:#fff;cursor:pointer;transition:opacity .2s}
    button:hover{opacity:.95}
    .error{margin-top:14px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:13px}
    footer{margin-top:18px;text-align:center;color:#9ca3af;font-size:12px}
  </style>
</head>
<body>
  <div class="box">
    <h2>zp-cli 配置管理</h2>
    <p class="lead">登录后可在线查看、编辑、同步和恢复 `.zp-cli.json` 配置。</p>
    <form method="post">
      <input type="hidden" name="action" value="login">
      <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(zp_csrf_token()) ?>">
      <label>用户名<input type="text" name="username" autocomplete="username" required></label>
      <label>密码<input type="password" name="password" autocomplete="current-password" required></label>
      <button type="submit">登录</button>
    </form>
    <?php if ($error): ?><div class="error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <footer>默认账号 admin / password，上线前请立即修改密码</footer>
  </div>
</body>
</html>
<?php
exit;
endif;

$content = zp_current_content();
$history = zp_history_list();
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zp-cli 配置管理</title>
  <style>
    :root{--color-bg:#f5f7fb;--color-card:#ffffff;--color-text:#111827;--color-muted:#6b7280;--color-primary:#1677ff;--color-primary-dark:#1d4ed8;--color-danger:#d93026;--color-success:#0f8a3b;--color-border:#e5e7eb}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:linear-gradient(180deg,#f0f4ff 0%,#f7f8fb 100%);margin:0;color:var(--color-text)}
    header{background:linear-gradient(135deg,#0f172a 0%,#111827 100%);color:#fff;padding:18px 28px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10;box-shadow:0 6px 20px rgba(0,0,0,.18)}
    header strong{font-size:18px;letter-spacing:.02em}
    header .ops{display:flex;gap:10px;align-items:center}
    main{padding:22px 24px 32px;display:grid;grid-template-columns:minmax(480px,1fr) 420px;gap:22px;align-items:start}
    .card{background:var(--color-card);border:1px solid var(--color-border);border-radius:14px;padding:20px;box-shadow:0 12px 30px rgba(17,24,39,.06),0 1px 3px rgba(17,24,39,.04)}
    h3{margin:0 0 12px;font-size:17px;display:flex;align-items:center;gap:8px}
    .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
    button,.btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(180deg,var(--color-primary),var(--color-primary-dark));color:#fff;border:0;border-radius:8px;padding:9px 14px;cursor:pointer;text-decoration:none;font-size:14px;transition:transform .05s ease,opacity .2s ease}
    button:active,.btn:active{transform:translateY(1px)}
    .outline{background:transparent;color:var(--color-primary);border:1px solid var(--color-primary)}
    .danger{background:linear-gradient(180deg,#ef4444,#dc2626)}
    .success{background:linear-gradient(180deg,#16a34a,#15803d)}
    .muted{color:var(--color-muted);font-size:13px}
    .msg{color:var(--color-success);margin:0 0 12px;font-size:13px}
    .err{color:#b91c1c;margin:0 0 12px;font-size:13px}
    .status{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}
    .tag{display:inline-block;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:3px 9px;font-size:12px}
    #editor-wrap{border:1px solid #111827;border-radius:12px;overflow:hidden;background:#0f1117;height:min(78vh,960px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}
    aside ul{list-style:none;margin:0;padding:0}
    aside li{padding:12px 12px;border:1px solid var(--color-border);border-radius:12px;background:#fff;margin-bottom:10px;transition:box-shadow .2s,border-color .2s}
    aside li:hover{border-color:#93c5fd;box-shadow:0 8px 20px rgba(147,197,253,.18)}
    aside li .name{font-weight:600;word-break:break-all}
    aside li .meta{color:var(--color-muted);font-size:12px;margin-top:6px}
    aside form{margin-top:10px}
    aside .empty{padding:40px 12px;text-align:center;color:var(--color-muted);border:1px dashed var(--color-border);border-radius:12px}
    @media(max-width:1100px){main{grid-template-columns:1fr}}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
  <script>
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
  </script>
</head>
<body>
<header>
  <strong>zp-cli 配置管理</strong>
  <div class="ops">
    <span class="muted">快捷键 Ctrl / Cmd + S 保存</span>
    <a class="btn outline" href="?download=1">下载配置</a>
    <a class="btn danger" href="logout.php">退出登录</a>
  </div>
</header>
<main>
  <section class="card">
    <h3>当前 .zp-cli.json</h3>
    <?php if ($message): ?><p class="msg"><?= htmlspecialchars($message) ?></p><?php endif; ?>
    <?php if ($error): ?><p class="err"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <div class="toolbar">
      <form method="post" id="save-form" onsubmit="return syncEditorContent();">
        <input type="hidden" name="action" value="save">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(zp_csrf_token()) ?>">
        <input type="hidden" name="content" id="hidden-content">
      </form>
      <button type="button" onclick="return saveFromButton();">保存配置</button>
      <button type="button" class="success" onclick="formatEditorContent();">格式化 JSON</button>
    </div>
    <div id="editor-wrap"></div>
    <div class="status">
      <span class="tag" id="tag-file">当前文件 .zp-cli.json</span>
      <span class="tag" id="tag-size">原始大小 <?= htmlspecialchars((string)strlen($content)) ?> 字节</span>
      <span class="tag" id="tag-hint">使用 Monaco Editor，支持 JSON 折叠与校验</span>
    </div>
  </section>
  <aside class="card">
    <h3>历史版本</h3>
    <p class="muted">保存或 API push 前会自动备份，超过配置数量后自动清理。</p>
    <?php if (!$history): ?>
      <div class="empty">暂无历史版本</div>
    <?php else: ?>
      <ul>
      <?php foreach ($history as $index => $item): ?>
        <li>
          <div class="name"><?= htmlspecialchars($item['name']) ?></div>
          <div class="meta"><?= htmlspecialchars($item['time']) ?> · <?= htmlspecialchars((string)$item['size']) ?> bytes</div>
          <form method="post" onsubmit="return confirm('确认恢复该历史版本？');">
            <input type="hidden" name="action" value="restore">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(zp_csrf_token()) ?>">
            <input type="hidden" name="file" value="<?= htmlspecialchars($item['name']) ?>">
            <button type="submit">恢复</button>
          </form>
        </li>
      <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </aside>
</main>
<script>
  let editorInstance = null;

  function syncEditorContent() {
    if (!editorInstance) return true;
    const value = editorInstance.getValue();
    document.getElementById('hidden-content').value = value;
    return true;
  }

  function saveFromButton() {
    if (!syncEditorContent()) return;
    document.getElementById('save-form').submit();
  }

  function formatEditorContent() {
    if (!editorInstance) return;
    const value = editorInstance.getValue();
    try {
      const formatted = JSON.stringify(JSON.parse(value), null, 2);
      editorInstance.setValue(formatted);
    } catch (e) {
      alert('JSON 格式错误，无法格式化：\n' + e.message);
    }
  }

  require(['vs/editor/editor.main'], function () {
    const initialContent = <?= json_encode($content, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    editorInstance = monaco.editor.create(document.getElementById('editor-wrap'), {
      value: initialContent,
      language: 'json',
      theme: 'vs-dark',
      automaticLayout: true,
      tabSize: 2,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      renderWhitespace: 'none',
      fontFamily: 'Consolas, "Fira Code", "Cascadia Code", Menlo, monospace'
    });

    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFromButton();
      }
    });
  });
</script>
</body>
</html>
