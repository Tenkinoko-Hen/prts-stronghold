@echo off
chcp 65001 >nul 2>&1
title PRTS Stronghold - C Drive Residue & Uninstall Cleanup Tool
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference = 'SilentlyContinue'; ^
Write-Host '============================================================' -ForegroundColor Yellow; ^
Write-Host '  PRTS Stronghold / Lite - C 盘残留与彻底卸载清理工具' -ForegroundColor Yellow; ^
Write-Host '============================================================' -ForegroundColor Yellow; ^
Write-Host ''; ^
$procs = Get-Process -Name 'PRTS Stronghold','PRTS Stronghold Lite','PRTS-Worker' -ErrorAction SilentlyContinue; ^
if ($procs) { ^
  Write-Host '[提示] 检测到 PRTS 程序正在运行，清理前需要先关闭它们。' -ForegroundColor Cyan; ^
  $ans = Read-Host '是否立即关闭运行中的 PRTS 进程？(Y/N，默认 Y)'; ^
  if ($ans -eq '' -or $ans -match '^[Yy]') { ^
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue; ^
    Start-Sleep -Milliseconds 600; ^
  } else { ^
    Write-Host '已取消操作。请手动关闭 PRTS 后重新运行本脚本。' -ForegroundColor Red; ^
    Pause; exit 0; ^
  } ^
} ^
function DirSizeMB([string]$p) { ^
  if (-not (Test-Path $p)) { return 0 } ^
  $s = (Get-ChildItem $p -File -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum; ^
  if (-not $s) { return 0 } ^
  return [math]::Round($s / 1MB, 2); ^
} ^
$items = @( ^
  @{ Group='cache';   Label='Full 运行解包缓存';       Path=\"$env:LOCALAPPDATA\PRTS-Cache\PRTS Stronghold\" }, ^
  @{ Group='cache';   Label='Lite 运行解包缓存';       Path=\"$env:LOCALAPPDATA\PRTS-Cache\PRTS Stronghold Lite\" }, ^
  @{ Group='cache';   Label='临时目录解包缓存';        Path=\"$env:TEMP\PRTS-Cache\" }, ^
  @{ Group='profile'; Label='Full 配置 / 热更 / BGM';  Path=\"$env:APPDATA\PRTS Stronghold\" }, ^
  @{ Group='profile'; Label='历史/开发配置残留';       Path=\"$env:APPDATA\prts-stronghold\" }, ^
  @{ Group='profile'; Label='Lite 配置文件';           Path=\"$env:APPDATA\com.stronghold.telemetry\" }, ^
  @{ Group='pointer'; Label='路径引导指针';            Path=\"$env:LOCALAPPDATA\PRTS-Stronghold\" }, ^
  @{ Group='reports'; Label='我的文档 Full 历史战报';  Path=\"$env:USERPROFILE\Documents\PRTS Stronghold\" }, ^
  @{ Group='reports'; Label='我的文档 Lite 历史战报';  Path=\"$env:USERPROFILE\Documents\PRTS Stronghold Lite\" } ^
); ^
$found = @(); $totalMB = 0; ^
Write-Host '正在扫描 C 盘 PRTS 相关目录...' -ForegroundColor Gray; ^
foreach ($it in $items) { ^
  if (Test-Path $it.Path) { ^
    $mb = DirSizeMB $it.Path; ^
    $totalMB += $mb; ^
    $it.MB = $mb; ^
    $found += $it; ^
    Write-Host ('  - [{0,-7}] {1,-22} {2,8:N2} MB  ({3})' -f $it.Group, $it.Label, $mb, $it.Path); ^
  } ^
} ^
if ($found.Count -eq 0) { ^
  Write-Host ''; ^
  Write-Host '[完成] C 盘未发现任何 PRTS 残留文件，非常干净！' -ForegroundColor Green; ^
  Pause; exit 0; ^
} ^
Write-Host ''; ^
Write-Host ('合计占用 C 盘：{0:N2} MB' -f $totalMB) -ForegroundColor Yellow; ^
Write-Host ''; ^
Write-Host '请选择清理模式：'; ^
Write-Host '  [1] 仅清理 C 盘运行解包缓存（保留配置、本地 BGM 与历史战报）'; ^
Write-Host '  [2] 清理 C 盘全部缓存、热更与配置（仅保留「我的文档」中的历史战报）'; ^
Write-Host '  [3] 彻底卸载清理：删除上述 C 盘全部 PRTS 文件（包含历史战报与路径指针）'; ^
Write-Host '  [0] 取消退出'; ^
$mode = Read-Host '请输入选项 (1/2/3/0)'; ^
if ($mode -notin @('1','2','3')) { Write-Host '已取消。'; Pause; exit 0 } ^
$allowed = switch ($mode) { ^
  '1' { @('cache') } ^
  '2' { @('cache','profile','pointer') } ^
  '3' { @('cache','profile','pointer','reports') } ^
}; ^
$freed = 0; $removed = 0; ^
foreach ($it in $found) { ^
  if ($allowed -contains $it.Group) { ^
    Remove-Item -Path $it.Path -Recurse -Force -ErrorAction SilentlyContinue; ^
    if (-not (Test-Path $it.Path)) { ^
      $freed += $it.MB; $removed++; ^
      Write-Host ('  [已删除] {0} ({1:N2} MB)' -f $it.Path, $it.MB) -ForegroundColor Green; ^
    } else { ^
      Write-Host ('  [占用中] 未能完全删除：{0}' -f $it.Path) -ForegroundColor Red; ^
    } ^
  } ^
} ^
$parentCache = \"$env:LOCALAPPDATA\PRTS-Cache\"; ^
if ((Test-Path $parentCache) -and -not (Get-ChildItem $parentCache -Force -ErrorAction SilentlyContinue)) { ^
  Remove-Item -Path $parentCache -Force -ErrorAction SilentlyContinue; ^
} ^
Write-Host ''; ^
Write-Host ('清理完成：已清除 {0} 个目录，释放约 {1:N2} MB C 盘空间。' -f $removed, $freed) -ForegroundColor Green; ^
if ($mode -eq '3') { Write-Host '如需彻底卸载，再手动删除你存放的主程序 EXE 文件即可。' -ForegroundColor Cyan } ^
Pause"
