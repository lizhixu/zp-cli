<?php
session_start();

function zp_config()
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function zp_ensure_dirs()
{
    $config = zp_config();
    if (!is_dir($config['data_dir'])) {
        mkdir($config['data_dir'], 0750, true);
    }
    if (!is_dir($config['history_dir'])) {
        mkdir($config['history_dir'], 0750, true);
    }
}

function zp_json($success, $message = '', $data = [])
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function zp_is_logged_in()
{
    return !empty($_SESSION['zp_cli_admin_logged_in']);
}

function zp_require_login()
{
    if (!zp_is_logged_in()) {
        header('Location: index.php');
        exit;
    }
}

function zp_csrf_token()
{
    if (empty($_SESSION['zp_csrf_token'])) {
        $_SESSION['zp_csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['zp_csrf_token'];
}

function zp_verify_csrf_token()
{
    $token = $_POST['csrf_token'] ?? '';
    return is_string($token) && hash_equals(zp_csrf_token(), $token);
}

function zp_check_admin_login($username, $password)
{
    $config = zp_config();
    return hash_equals($config['admin_user'], $username)
        && password_verify($password, $config['admin_password_hash']);
}

function zp_check_api_password($password)
{
    $config = zp_config();
    return password_verify($password, $config['api_password_hash']);
}

function zp_safe_history_name($file)
{
    return is_string($file) && preg_match('/^\.zp-cli-\d{8}-\d{6}\.json$/', $file);
}

function zp_timestamp()
{
    return date('Ymd-His');
}

function zp_current_content()
{
    $config = zp_config();
    if (!file_exists($config['config_file'])) {
        return "{}\n";
    }
    return file_get_contents($config['config_file']);
}

function zp_validate_json($content)
{
    json_decode($content, true);
    return json_last_error() === JSON_ERROR_NONE;
}

function zp_backup_current()
{
    zp_ensure_dirs();
    $config = zp_config();
    if (!file_exists($config['config_file'])) {
        return null;
    }

    $backup = $config['history_dir'] . '/.zp-cli-' . zp_timestamp() . '.json';
    copy($config['config_file'], $backup);
    return $backup;
}

function zp_clean_history()
{
    $config = zp_config();
    $limit = max(1, intval($config['history_limit']));
    $files = glob($config['history_dir'] . '/.zp-cli-*.json') ?: [];
    usort($files, function ($a, $b) {
        return filemtime($b) <=> filemtime($a);
    });

    foreach (array_slice($files, $limit) as $file) {
        @unlink($file);
    }
}

function zp_write_config($content)
{
    if (!zp_validate_json($content)) {
        throw new RuntimeException('配置内容不是合法 JSON');
    }

    zp_ensure_dirs();
    $config = zp_config();
    zp_backup_current();

    if (file_put_contents($config['config_file'], $content, LOCK_EX) === false) {
        throw new RuntimeException('写入配置文件失败');
    }

    @chmod($config['config_file'], 0600);
    zp_clean_history();
}

function zp_history_list()
{
    zp_ensure_dirs();
    $config = zp_config();
    $files = glob($config['history_dir'] . '/.zp-cli-*.json') ?: [];
    usort($files, function ($a, $b) {
        return filemtime($b) <=> filemtime($a);
    });

    return array_map(function ($file) {
        return [
            'name' => basename($file),
            'size' => filesize($file),
            'time' => date('Y-m-d H:i:s', filemtime($file)),
        ];
    }, $files);
}

function zp_restore_history($name)
{
    if (!zp_safe_history_name($name)) {
        throw new RuntimeException('非法历史文件名');
    }

    $config = zp_config();
    $file = $config['history_dir'] . '/' . $name;
    if (!file_exists($file)) {
        throw new RuntimeException('历史文件不存在');
    }

    $content = file_get_contents($file);
    zp_write_config($content);
    return $content;
}

function zp_delete_history($name)
{
    if (!zp_safe_history_name($name)) {
        throw new RuntimeException('非法历史文件名');
    }

    $config = zp_config();
    $file = $config['history_dir'] . '/' . $name;
    if (!file_exists($file)) {
        throw new RuntimeException('历史文件不存在');
    }

    if (!unlink($file)) {
        throw new RuntimeException('历史版本删除失败');
    }
}
