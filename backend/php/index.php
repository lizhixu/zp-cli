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
            } elseif ($action === 'delete_history') {
                zp_delete_history($_POST['file'] ?? '');
                $message = '历史版本删除成功';
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
    :root{--ant-primary:#1677ff;--ant-primary-hover:#4096ff;--ant-text:#262626;--ant-text-secondary:#595959;--ant-text-tertiary:#8c8c8c;--ant-border:#d9d9d9;--ant-border-light:#f0f0f0;--ant-bg:#f0f2f5;--ant-error:#ff4d4f;--ant-error-bg:#fff2f0;--ant-radius:8px;--ant-shadow:0 6px 16px 0 rgba(0,0,0,.08),0 3px 6px -4px rgba(0,0,0,.12),0 9px 28px 8px rgba(0,0,0,.05)}
    *{box-sizing:border-box}
    body{min-height:100vh;margin:0;padding:48px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--ant-bg);color:var(--ant-text)}
    body::before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 18% 18%,rgba(22,119,255,.12),transparent 28%),radial-gradient(circle at 82% 8%,rgba(64,150,255,.10),transparent 24%);pointer-events:none}
    .box{position:relative;width:min(420px,100%);margin:8vh auto 0;background:#fff;border:1px solid var(--ant-border-light);border-radius:var(--ant-radius);padding:32px;box-shadow:var(--ant-shadow)}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}
    .brand-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--ant-primary);color:#fff;font-weight:700;box-shadow:0 6px 12px rgba(22,119,255,.22)}
    h2{margin:0 0 4px;font-size:22px;line-height:1.3;font-weight:600;color:var(--ant-text)}
    p.lead{margin:0;color:var(--ant-text-secondary);font-size:14px;line-height:1.7}
    label{display:block;margin-top:16px;font-size:14px;color:var(--ant-text)}
    input[type="text"],input[type="password"]{width:100%;margin-top:8px;padding:8px 11px;border:1px solid var(--ant-border);border-radius:6px;font-size:14px;line-height:22px;background:#fff;color:var(--ant-text);transition:border-color .2s,box-shadow .2s}
    input:hover{border-color:var(--ant-primary-hover)}
    input:focus{outline:none;border-color:var(--ant-primary);box-shadow:0 0 0 2px rgba(5,145,255,.1)}
    button{width:100%;margin-top:22px;padding:9px 15px;border:1px solid var(--ant-primary);border-radius:6px;font-size:14px;line-height:22px;background:var(--ant-primary);color:#fff;cursor:pointer;box-shadow:0 2px 0 rgba(5,145,255,.1);transition:background .2s,border-color .2s,box-shadow .2s}
    button:hover{background:var(--ant-primary-hover);border-color:var(--ant-primary-hover)}
    .error{margin-top:16px;padding:9px 12px;border:1px solid #ffccc7;border-radius:6px;background:var(--ant-error-bg);color:#cf1322;font-size:14px;line-height:1.6}
    footer{margin-top:20px;text-align:center;color:var(--ant-text-tertiary);font-size:12px;line-height:1.6}
  </style>
</head>
<body>
  <div class="box">
    <div class="brand">
      <div class="brand-icon">ZP</div>
      <div>
        <h2>zp-cli 配置管理</h2>
        <p class="lead">登录后可在线查看、编辑、同步和恢复 `.zp-cli.json` 配置。</p>
      </div>
    </div>
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
    :root{--ant-primary:#1677ff;--ant-primary-hover:#4096ff;--ant-primary-active:#0958d9;--ant-success:#52c41a;--ant-danger:#ff4d4f;--ant-danger-hover:#ff7875;--ant-text:#262626;--ant-text-secondary:#595959;--ant-text-tertiary:#8c8c8c;--ant-border:#d9d9d9;--ant-border-light:#f0f0f0;--ant-bg:#f0f2f5;--ant-bg-container:#fff;--ant-bg-hover:#f5f5f5;--ant-primary-bg:#e6f4ff;--ant-radius:8px;--ant-shadow:0 1px 2px 0 rgba(0,0,0,.03),0 1px 6px -1px rgba(0,0,0,.02),0 2px 4px 0 rgba(0,0,0,.02)}
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--ant-bg);color:var(--ant-text);font-size:14px}
    header{height:64px;background:var(--ant-bg-container);border-bottom:1px solid var(--ant-border-light);padding:0 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .brand{display:flex;align-items:center;gap:12px;min-width:0}
    .brand-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:8px;background:var(--ant-primary);color:#fff;font-size:14px;font-weight:700;box-shadow:0 4px 10px rgba(22,119,255,.2)}
    header strong{display:block;font-size:18px;line-height:1.3;font-weight:600;color:var(--ant-text)}
    header .subtitle{margin-top:2px;color:var(--ant-text-tertiary);font-size:12px;line-height:1.4}
    header .ops{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
    main{min-height:calc(100vh - 64px);padding:24px;display:grid;grid-template-columns:minmax(520px,1fr) 420px;gap:24px;align-items:start}
    .left-column{position:sticky;top:88px;height:calc(100vh - 112px);display:flex;flex-direction:column}
    .card{background:var(--ant-bg-container);border:1px solid var(--ant-border-light);border-radius:var(--ant-radius);box-shadow:var(--ant-shadow);overflow:hidden}
    .card-head{min-height:56px;padding:16px 20px;border-bottom:1px solid var(--ant-border-light);display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .card-body{padding:20px}
    .editor-body{min-height:0;display:flex;flex:1;flex-direction:column}
    h3{margin:0;font-size:16px;line-height:24px;font-weight:600;color:var(--ant-text)}
    .card-desc{margin:4px 0 0;color:var(--ant-text-secondary);font-size:13px;line-height:1.6}
    .toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
    button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:4px 15px;border:1px solid var(--ant-primary);border-radius:6px;background:var(--ant-primary);color:#fff;cursor:pointer;text-decoration:none;font-size:14px;line-height:22px;box-shadow:0 2px 0 rgba(5,145,255,.1);transition:color .2s,background .2s,border-color .2s,box-shadow .2s}
    button:hover,.btn:hover{background:var(--ant-primary-hover);border-color:var(--ant-primary-hover);color:#fff}
    button:active,.btn:active{background:var(--ant-primary-active);border-color:var(--ant-primary-active)}
    .outline{background:#fff;color:var(--ant-primary);border-color:var(--ant-border);box-shadow:none}
    .outline:hover{color:var(--ant-primary-hover);background:#fff;border-color:var(--ant-primary-hover)}
    .danger{background:#fff;color:var(--ant-danger);border-color:var(--ant-danger);box-shadow:none}
    .danger:hover{background:#fff;color:var(--ant-danger-hover);border-color:var(--ant-danger-hover)}
    .success{background:#fff;color:var(--ant-success);border-color:#b7eb8f;box-shadow:none}
    .success:hover{background:#f6ffed;color:#73d13d;border-color:#95de64}
    .link-btn{height:auto;padding:0;border:0;background:transparent;color:var(--ant-primary);box-shadow:none}
    .link-btn:hover{background:transparent;color:var(--ant-primary-hover)}
    .muted{color:var(--ant-text-tertiary);font-size:13px}
    .msg,.err{margin:0 0 16px;padding:9px 12px;border-radius:6px;font-size:14px;line-height:1.6}
    .msg{color:#389e0d;background:#f6ffed;border:1px solid #b7eb8f}
    .err{color:#cf1322;background:#fff2f0;border:1px solid #ffccc7}
    .status{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0}
    .tag{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid #91caff;border-radius:4px;background:var(--ant-primary-bg);color:#0958d9;font-size:12px;line-height:22px}
    #editor-wrap{min-height:320px;flex:1;border:1px solid var(--ant-border);border-radius:6px;overflow:hidden;background:#fff}
    aside ul{list-style:none;margin:0;padding:0;overflow-y:auto;max-height:calc(100vh - 240px)}
    aside li{padding:14px 16px;border:1px solid var(--ant-border-light);border-radius:6px;background:#fff;margin-bottom:12px;transition:background .2s,border-color .2s,box-shadow .2s}
    aside li:hover{background:#fafafa;border-color:#91caff;box-shadow:0 2px 8px rgba(22,119,255,.08)}
    aside li .name{font-weight:600;line-height:1.5;word-break:break-all;color:var(--ant-text)}
    aside li .name a{color:var(--ant-text);text-decoration:none;transition:color .2s}
    aside li .name a:hover{color:var(--ant-primary)}
    aside li .meta{color:var(--ant-text-tertiary);font-size:12px;margin-top:6px;line-height:1.5}
    aside form{margin:0}
    .history-ops{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}
    .history-ops .btn,.history-ops button{height:28px;padding:2px 11px;font-size:13px}
    aside .empty{padding:42px 12px;text-align:center;color:var(--ant-text-tertiary);border:1px dashed var(--ant-border);border-radius:6px;background:#fafafa}
    @media(max-width:1100px){header{height:auto;min-height:64px;padding:12px 16px;align-items:flex-start;gap:12px;flex-direction:column}header .ops{justify-content:flex-start}.muted.shortcut{display:none}main{grid-template-columns:1fr;padding:16px}.left-column{position:static;height:calc(100vh - 32px)}#editor-wrap{min-height:360px}}
    @media(max-width:640px){.card-head{flex-direction:column}.toolbar,.history-ops{width:100%}button,.btn{flex:1}.link-btn{flex:0}.danger{flex:0 1 auto}}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
  <script>
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
  </script>
</head>
<body>
<header>
  <div class="brand">
    <div class="brand-icon">ZP</div>
    <div>
      <strong>zp-cli 配置管理</strong>
      <div class="subtitle">在线编辑、同步与恢复 .zp-cli.json</div>
    </div>
  </div>
  <div class="ops">
    <span class="muted shortcut">快捷键 Ctrl / Cmd + S 保存</span>
    <a class="btn outline" href="?download=1">下载配置</a>
    <a class="btn danger" href="logout.php">退出登录</a>
  </div>
</header>
<main>
  <section class="card left-column">
    <div class="card-head">
      <div>
        <h3>当前 .zp-cli.json</h3>
        <p class="card-desc">修改后点击保存配置，或使用快捷键快速保存。</p>
      </div>
    </div>
    <div class="card-body editor-body">
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
        <span class="tag" id="tag-hint">Monaco Editor · JSON 折叠与校验</span>
      </div>
    </div>
  </section>
  <aside class="card">
    <div class="card-head">
      <div>
        <h3>历史版本</h3>
        <p class="card-desc">保存或 API push 前会自动备份，点击记录可在左侧预览。</p>
      </div>
    </div>
    <div class="card-body">
      <?php if (!$history): ?>
        <div class="empty">暂无历史版本</div>
      <?php else: ?>
        <ul>
        <?php foreach ($history as $item): ?>
          <?php
            $historyContent = file_get_contents(zp_config()['history_dir'] . '/' . $item['name']);
            $encodedHistory = rawurlencode($historyContent ?? '');
          ?>
          <li>
            <div class="name">
              <a href="#" onclick="loadHistoryContent('<?= $encodedHistory ?>', '<?= htmlspecialchars($item['name'], ENT_QUOTES) ?>'); return false;"><?= htmlspecialchars($item['name']) ?></a>
            </div>
            <div class="meta"><?= htmlspecialchars($item['time']) ?> · <?= htmlspecialchars((string)$item['size']) ?> bytes</div>
            <div class="history-ops">
              <a href="#" class="btn outline" onclick="loadHistoryContent('<?= $encodedHistory ?>', '<?= htmlspecialchars($item['name'], ENT_QUOTES) ?>'); return false;">预览</a>
              <form method="post" onsubmit="return confirm('确认恢复该历史版本？');">
                <input type="hidden" name="action" value="restore">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(zp_csrf_token()) ?>">
                <input type="hidden" name="file" value="<?= htmlspecialchars($item['name']) ?>">
                <button type="submit" class="danger">恢复</button>
              </form>
              <form method="post" onsubmit="return confirm('确认删除该历史版本？删除后不可恢复。');">
                <input type="hidden" name="action" value="delete_history">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(zp_csrf_token()) ?>">
                <input type="hidden" name="file" value="<?= htmlspecialchars($item['name']) ?>">
                <button type="submit" class="danger">删除</button>
              </form>
            </div>
          </li>
        <?php endforeach; ?>
        </ul>
      <?php endif; ?>
    </div>
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

  function loadHistoryContent(encodedContent, name) {
    if (!editorInstance) return;
    try {
      const text = decodeURIComponent(encodedContent.replace(/\+/g, '%20'));
      editorInstance.setValue(text);
      document.getElementById('tag-file').textContent = '查看历史 ' + name;
    } catch (e) {
      alert('历史内容加载失败：' + e.message);
    }
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
      theme: 'vs',
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
