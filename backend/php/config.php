<?php
return [
    'admin_user' => 'admin',

    // 默认密码为 password，请部署后立即修改。
    // 生成方式: php -r "echo password_hash('你的密码', PASSWORD_DEFAULT), PHP_EOL;"
    'admin_password_hash' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uIu0Jm0H.G',

    // CLI API 默认密码为 password，请部署后立即修改为独立密码。
    'api_password_hash' => '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uIu0Jm0H.G',

    'data_dir' => __DIR__ . '/data',
    'config_file' => __DIR__ . '/data/.zp-cli.json',
    'history_dir' => __DIR__ . '/data/.history',
    'history_limit' => 10,
];
