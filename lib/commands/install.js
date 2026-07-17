/**
 * install.js - 右键菜单安装/卸载（Windows 注册表）
 *
 * zp-cli install menu   → 添加右键菜单
 * zp-cli uninstall menu → 移除右键菜单
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

const MENU_LABEL = '用 zp-cli 上传';
const KEY_NAME = 'zp-cli-upload';
const SCRIPT_NAME = 'zp-cli-upload.cmd';
const VBS_NAME = 'zp-cli-upload.vbs';
const PS_NAME = 'zp-cli-upload.ps1';

// 注册表路径：文件+文件夹 / 文件夹背景
// 使用 AllFilesystemObjects 替代 * 以兼容 Win11 新菜单
const REG_KEYS = [
  { path: `HKCR\\AllFilesystemObjects\\shell\\${KEY_NAME}`, type: 'item' },
  { path: `HKCR\\Directory\\Background\\shell\\${KEY_NAME}`, type: 'background' },
];

function checkPlatform() {
  if (process.platform !== 'win32') {
    logger.error('右键菜单功能仅支持 Windows 系统');
    process.exit(1);
  }
}

function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getScriptPath() {
  return path.join(os.homedir(), '.zp-cli', SCRIPT_NAME);
}

function getVbsPath() {
  return path.join(os.homedir(), '.zp-cli', VBS_NAME);
}

function getPsPath() {
  return path.join(os.homedir(), '.zp-cli', PS_NAME);
}

function ensureScriptDir() {
  const dir = path.dirname(getScriptPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 生成 PowerShell 上传脚本
 *   zp-cli-upload.ps1 -Mode Background -WorkDir <工作目录>
 *   zp-cli-upload.ps1 -Mode Queue -WorkDir <工作目录>
 */
function writePowerShellScript() {
  const lines = [
    'param(',
    '  [Parameter(Mandatory=$true)][string]$Mode,',
    '  [Parameter(Mandatory=$true)][string]$WorkDir',
    ')',
    '$ErrorActionPreference = "Stop"',
    '$queueFile = Join-Path $env:TEMP "zp-cli-upload-queue.txt"',
    '$lockDir = Join-Path $env:TEMP "zp-cli-upload-lock.dir"',
    'chcp 65001 > $null',
    '',
    'try {',
    '  Set-Location -LiteralPath $WorkDir',
    '  if ($Mode -eq "Background") {',
    '    & zp-cli upload .',
    '  } else {',
    '    $lastWrite = [DateTime]::MinValue',
    '    $stableCount = 0',
    '    for ($i = 0; $i -lt 50; $i++) {',
    '      Start-Sleep -Milliseconds 200',
    '      if (Test-Path -LiteralPath $queueFile) {',
    '        $currentWrite = (Get-Item -LiteralPath $queueFile).LastWriteTimeUtc',
    '      } else {',
    '        $currentWrite = [DateTime]::MinValue',
    '      }',
    '      if ($currentWrite -ne [DateTime]::MinValue -and $currentWrite -eq $lastWrite) {',
    '        $stableCount++',
    '      } else {',
    '        $stableCount = 0',
    '        $lastWrite = $currentWrite',
    '      }',
    '      if ($stableCount -ge 6) { break }',
    '    }',
    '    if (Test-Path -LiteralPath $queueFile) {',
    '      $files = @(Get-Content -LiteralPath $queueFile | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)',
    '    } else {',
    '      $files = @()',
    '    }',
    '    if ($files.Count -eq 0) {',
    '      Write-Host "[zp-cli] No files to upload."',
    '    } else {',
    '      $baseDir = Split-Path -Parent $files[0]',
    '      if ($baseDir -and (Test-Path -LiteralPath $baseDir)) {',
    '        Set-Location -LiteralPath $baseDir',
    '      }',
    '      $uploadArgs = @()',
    '      foreach ($file in $files) {',
    '        try {',
    '          $relative = Resolve-Path -LiteralPath $file -Relative -ErrorAction Stop',
    '        } catch {',
    '          $relative = $null',
    '        }',
    '        if ($relative -and -not $relative.StartsWith("..")) {',
    '          $uploadArgs += $relative',
    '        } else {',
    '          $uploadArgs += $file',
    '        }',
    '      }',
    '      $displayArgs = $uploadArgs | ForEach-Object { if ($_ -match "\\s") { "`"$_`"" } else { $_ } }',
    '      Write-Host ("zp-cli up " + ($displayArgs -join " "))',
    '      & zp-cli up @uploadArgs',
    '    }',
    '  }',
    '} catch {',
    '  Write-Host "[zp-cli] Error: $($_.Exception.Message)"',
    '} finally {',
    '  Remove-Item -LiteralPath $queueFile -Force -ErrorAction SilentlyContinue',
    '  Remove-Item -LiteralPath $lockDir -Recurse -Force -ErrorAction SilentlyContinue',
    '}',
    '$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")',
  ];

  fs.writeFileSync(getPsPath(), lines.join('\r\n'));
}

/**
 * 生成 VBS 队列脚本。
 * Explorer 多选时会对每个文件分别调用一次右键命令；这里用隐藏 VBS 先把文件写入队列，
 * 只有抢到锁的那一次会打开一个终端，等待短时间后一次性上传队列中的全部文件。
 */
function writeVbsScript() {
  const psPath = getPsPath();
  const lines = [
    'Option Explicit',
    'Dim shell, fso, args, queueFile, lockDir, workDir, filePath, owner, f, psScript, cmd, wrote, n',
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set args = WScript.Arguments',
    'If args.Count < 2 Then WScript.Quit 1',
    'queueFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\\zp-cli-upload-queue.txt"',
    'lockDir = shell.ExpandEnvironmentStrings("%TEMP%") & "\\zp-cli-upload-lock.dir"',
    'filePath = args(1)',
    'workDir = args(0)',
    'If Len(workDir) = 0 Or Not fso.FolderExists(workDir) Then',
    '  If fso.FolderExists(filePath) Then',
    '    workDir = fso.GetParentFolderName(filePath)',
    '  Else',
    '    workDir = fso.GetParentFolderName(filePath)',
    '  End If',
    'End If',
    'owner = False',
    '',
    'On Error Resume Next',
    'If fso.FolderExists(lockDir) Then',
    '  If DateDiff("s", fso.GetFolder(lockDir).DateLastModified, Now) > 600 Then',
    '    fso.DeleteFolder lockDir, True',
    '  End If',
    'End If',
    'Err.Clear',
    'fso.CreateFolder lockDir',
    'If Err.Number = 0 Then',
    '  owner = True',
    '  If fso.FileExists(queueFile) Then',
    '    If DateDiff("s", fso.GetFile(queueFile).DateLastModified, Now) > 60 Then',
    '      fso.DeleteFile queueFile, True',
    '    End If',
    '  End If',
    'End If',
    'wrote = False',
    'For n = 1 To 50',
    '  Err.Clear',
    '  Set f = fso.OpenTextFile(queueFile, 8, True)',
    '  If Err.Number = 0 Then',
    '    f.WriteLine filePath',
    '    f.Close',
    '    wrote = True',
    '    Exit For',
    '  End If',
    '  WScript.Sleep 100',
    'Next',
    'On Error GoTo 0',
    'If Not wrote Then WScript.Quit 1',
    '',
    'If owner Then',
    `  psScript = "${psPath.replace(/\\/g, '\\\\')}"`,
    '  cmd = "cmd.exe /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & psScript & """ -Mode Queue -WorkDir """ & workDir & """"',
    '  shell.Run cmd, 1, False',
    'End If',
  ];

  fs.writeFileSync(getVbsPath(), lines.join('\r\n'));
}

/**
 * 生成 .cmd 辅助脚本
 *   zp-cli-upload.cmd -bg <工作目录> → 背景模式
 */
function writeScript() {
  ensureScriptDir();
  writePowerShellScript();
  writeVbsScript();

  const psPath = getPsPath();
  const lines = [
    '@echo off',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + psPath + '" -Mode Background -WorkDir "%~2"',
  ];

  fs.writeFileSync(getScriptPath(), lines.join('\r\n'));
}

/**
 * 安装右键菜单
 */
function installMenu() {
  checkPlatform();
  logger.info('正在安装右键菜单...');

  writeScript();
  const scriptPath = getScriptPath();
  const vbsPath = getVbsPath();

  const commands = {
    item: `wscript.exe "${vbsPath}" "%V" "%1"`,
    background: `"${scriptPath}" -bg "%V"`,
  };

  for (const { path: key, type } of REG_KEYS) {
    const cmd = commands[type];

    // 写入菜单名称
    if (!run(`reg add "${key}" /ve /d "${MENU_LABEL}" /f`)) {
      logger.error(`写入注册表失败: ${key}`);
      process.exit(1);
    }

    // 写入执行命令
    if (!run(`reg add "${key}\\command" /ve /d "${cmd}" /f`)) {
      logger.error(`写入命令失败: ${key}\\command`);
      process.exit(1);
    }
  }

  logger.success('右键菜单安装成功！');
  logger.log('  → 右键任意文件/文件夹即可看到「' + MENU_LABEL + '」');
  logger.log('  → 多选文件时会合并到一个终端中上传');
  logger.log('  → 脚本位置: ' + scriptPath);
}

/**
 * 卸载右键菜单
 */
function uninstallMenu() {
  checkPlatform();
  logger.info('正在卸载右键菜单...');

  let removed = 0;
  for (const { path: key } of REG_KEYS) {
    if (run(`reg delete "${key}" /f`)) {
      removed++;
    }
  }

  for (const filePath of [getScriptPath(), getVbsPath(), getPsPath()]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  if (removed > 0) {
    logger.success(`右键菜单已卸载（移除 ${removed} 项）`);
  } else {
    logger.log('未发现已安装的右键菜单');
  }
}

module.exports = { installMenu, uninstallMenu };
