<?php
require __DIR__ . '/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    zp_json(false, '只支持 POST 请求');
}

$password = $_POST['password'] ?? '';
if (!zp_check_api_password($password)) {
    http_response_code(401);
    zp_json(false, 'API 密码错误');
}

$action = $_POST['action'] ?? '';

try {
    if ($action === 'push') {
        $content = $_POST['content'] ?? '';
        zp_write_config($content);
        zp_json(true, '配置推送完成');
    }

    if ($action === 'pull') {
        zp_json(true, '配置拉取完成', [
            'content' => zp_current_content(),
        ]);
    }

    if ($action === 'history' || $action === 'list') {
        zp_json(true, '历史版本读取完成', [
            'history' => zp_history_list(),
        ]);
    }

    if ($action === 'restore') {
        $file = $_POST['file'] ?? '';
        $content = zp_restore_history($file);
        zp_json(true, '历史版本恢复完成', [
            'content' => $content,
        ]);
    }

    zp_json(false, '未知 action');
} catch (Throwable $e) {
    http_response_code(400);
    zp_json(false, $e->getMessage());
}
