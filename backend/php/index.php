<?php
require __DIR__ . '/auth.php';

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    if (zp_check_admin_login($_POST['username'] ?? '', $_POST['password'] ?? '')) {
        $_SESSION['zp_cli_admin_logged_in'] = true;
        header('Location: index.php');
        exit;
    }
    $error = '用户名或密码错误';
}

if (isset($_GET['download'])) {
    zp_require_login();
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename=".zp-cli.json"');
    echo zp_current_content();
    exit;
}

if (zp_is_logged_in() && $_SERVER['REQUEST_METHOD'] === 'POST') {
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

if (!zp_is_logged_in()):
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zp-cli 配置管理登录</title>
  <style>
    body{font-family:Arial,"Microsoft YaHei",sans-serif;background:#f5f7fb;margin:0;padding:40px;color:#222}
    .box{max-width:360px;margin:80px auto;background:#fff;border-radius:10px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    input,button{width:100%;box-sizing:border-box;padding:12px;margin-top:12px;border:1px solid #ddd;border-radius:6px;font-size:14px}
    button{background:#1677ff;color:#fff;border:0;cursor:pointer}
    .error{color:#d93026;margin-top:12px}
  </style>
</head>
<body>
  <div class="box">
    <h2>zp-cli 配置管理</h2>
    <form method="post">
      <input type="hidden" name="action" value="login">
      <input name="username" placeholder="用户名" required>
      <input type="password" name="password" placeholder="密码" required>
      <button type="submit">登录</button>
    </form>
    <?php if ($error): ?><div class="error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
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
    body{font-family:Arial,"Microsoft YaHei",sans-serif;background:#f5f7fb;margin:0;color:#222}
    header{background:#111827;color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
    main{padding:24px;display:grid;grid-template-columns:1fr 360px;gap:20px}
    textarea{width:100%;height:70vh;box-sizing:border-box;font-family:Consolas,monospace;font-size:13px;line-height:1.5;border:1px solid #ddd;border-radius:8px;padding:14px}
    .card{background:#fff;border-radius:10px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.06)}
    button,.btn{display:inline-block;background:#1677ff;color:#fff;border:0;border-radius:6px;padding:9px 14px;cursor:pointer;text-decoration:none;font-size:14px}
    .danger{background:#d93026}.muted{color:#666;font-size:13px}.msg{color:#0f8a3b}.err{color:#d93026}
    ul{padding-left:18px}li{margin-bottom:10px;word-break:break-all}
  </style>
</head>
<body>
<header>
  <strong>zp-cli 配置管理</strong>
  <div><a class="btn" href="?download=1">下载配置</a> <a class="btn danger" href="logout.php">退出</a></div>
</header>
<main>
  <section class="card">
    <h3>当前 .zp-cli.json</h3>
    <?php if ($message): ?><p class="msg"><?= htmlspecialchars($message) ?></p><?php endif; ?>
    <?php if ($error): ?><p class="err"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <form method="post">
      <input type="hidden" name="action" value="save">
      <textarea name="content" spellcheck="false"><?= htmlspecialchars($content) ?></textarea>
      <p><button type="submit">保存配置</button></p>
    </form>
  </section>
  <aside class="card">
    <h3>历史版本</h3>
    <p class="muted">保存或 API push 前会自动备份，超过配置数量后自动清理。</p>
    <?php if (!$history): ?>
      <p class="muted">暂无历史版本</p>
    <?php else: ?>
      <ul>
      <?php foreach ($history as $item): ?>
        <li>
          <div><?= htmlspecialchars($item['name']) ?></div>
          <div class="muted"><?= htmlspecialchars($item['time']) ?> / <?= htmlspecialchars((string)$item['size']) ?> bytes</div>
          <form method="post" onsubmit="return confirm('确认恢复该历史版本？');">
            <input type="hidden" name="action" value="restore">
            <input type="hidden" name="file" value="<?= htmlspecialchars($item['name']) ?>">
            <button type="submit">恢复</button>
          </form>
        </li>
      <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </aside>
</main>
</body>
</html>
