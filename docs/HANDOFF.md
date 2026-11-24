# PRTS Stronghold 跨设备通用接续文档（HANDOFF）

本文件随 `origin/main` 自动同步，用于在多台电脑（如家里电脑 ↔ 公司/常用电脑）之间无缝切换继续开发。  
**换机开干时**先拉取最新代码并阅读本文件；**收工或换机前**更新底部「当前状态快照」并推送到 `origin/main`。

---

## 1. 仓库与协作约定

- **远程仓库**：`https://github.com/Tenkinoko-Hen/prts-stronghold.git`
- **唯一开发主线**：`main`（不新建长期平行分支，不重新引入 Git 子模块）
- **协作规范**：严格遵守仓库根目录 [AGENTS.md](../AGENTS.md)
  - 代码/文档改动并通过验证后，**自动提交并推送到 `origin/main`**（Conventional Commits + 中文摘要）。
  - **严禁提交**：`dist/`、`work/`、`release/`、`.exe`、`.apk`、任何签名密钥（`.jks` / `.p12` / `.pfx` / `.clixml`）、真实对局战报 JSON、玩家名、网络地址或原始抓包。
  - **禁止未经授权执行**：`git tag`、GitHub Release、`git push --force`。

---

## 2. 当前架构基线（请勿回退）

1. **单主线双产品架构**（品牌与配置集中在 `products/`）：
   - `products/stronghold/`（默认完整版）：`PRTS Stronghold`（`com.prts.stronghold` / `com.prts.stronghold.mobile`），含 3 域桌面终端（`01 战术跟打` · `02 实时战报` · `03 战术资料`）+ Android 攻略随行版。
   - `products/telemetry/`（独立纯净版 · A 模式）：`卫戍战报仪 · Stronghold Telemetry`（`com.stronghold.telemetry`），仅保留战报与 Boss 路线参照。
   - 共享源码禁止硬编码单一产品名，统一经 `src/brand/productBrand.ts`、`products/<id>/product.json` 或 Android 资源读取。
2. **Windows 桌面采集与启动**：
   - 已彻底移除桌面端 RapidOCR；统一为纯标准库 Python 抓包进程 `PRTS-Worker`（支持 0.2.19 协议、开局 `1/3 确认本局信息` 画面 Windows 原生 OCR 禁选兜底 + TCP 双通道同步、四席编队/策略家/本数解析与 Boss 参战干员映射、零注入 `ReadProcessMemory` 双重逻辑帧守卫算力采样）。
   - 默认管理员提权启动（`requestedExecutionLevel: 'requireAdministrator'` + `portable.requestExecutionLevel: 'admin'`），并提供可选置顶鼠标点击穿透微缩遥测条（`Ctrl+Shift+F10`）与局域网无线副屏广播服务（`electron/hud-overlay.cjs`、`electron/lan-sync.cjs`）。
   - 支持缺失 Npcap 检测 + 一键拉起官方安装器 + 装完自动热切换 Npcap 驱动通道（`electron/npcap-installer.cjs`、`src/desktop/NpcapSetupBanner.tsx`）。
3. **Android 端定位（免 Root 全适配）**：
   - 100% 面向未 Root 普通安卓手机/平板：`OverlayService` 支持「角标球 ↔ 锁定点击穿透微缩战术条 ↔ 完整面板」三态切换；支持同一局域网配对连接 PC 端变身无线战术副屏与战报相册同步器，并内置纯手机结算文本快捷提取与实效秒伤/护甲折损推演器。
4. **桌面视觉与交互规范**：
   - 统一为**明日方舟 PRTS × 终末地工业风**（`#0B0C0E` / `#131519` / `#1B1E24` 底色，`#FFE600` 终末地黄，`#00E5FF` PRTS 青，`#FF3B30` 危机红，`2px` 锐角切角、`.prts-reticle`、`.hazard-stripe`）。
   - 注意 Tailwind v4 `@layer utilities` 优先级低于未分层 `src/desktop/desktop.css`：新增组件输入框/卡片内边距请在 `desktop.css` 用语义类控制，改动后务必在 `1440×900` 与 `1024×700` 两个视口复检无遮挡。

---

## 3. 换机操作手册

### 3.1 换机开干前（在新电脑 / 切回本机时执行）

```powershell
# 1. 拉取远端最新主线（确保工作区干净）
git fetch origin
git status --short
git pull --ff-only origin main

# 2. 查看最近提交，确认上一台设备收工点
git log -n 10 --oneline

# 3. 如依赖有更新，安装 Node 依赖并跑一次基线测试
npm install
npm test
```

> **首次在新电脑克隆仓库时**：
> ```powershell
> git clone https://github.com/Tenkinoko-Hen/prts-stronghold.git
> cd prts-stronghold
> npm install
> npm test
> ```

### 3.2 验证与双产品构建（每次改动源码后必跑）

```powershell
npm test
npm run build:telemetry
npm run build
```

> 注意：`npm run build:telemetry` 后必须再运行 `npm run build`，确保 `dist/` 停留在默认产品 `stronghold`。

### 3.3 本地打包命令（仅需出包测试时运行，产物输出到 `release/` 且不入库）

- **重建 Python 战报 Worker**（仅在首次换机出包，或修改了 `electron/battle-report*.py` / `electron/worker-requirements.txt` 时需要；需 64 位 Python 3.12+）：
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-worker.ps1 -Product stronghold
  ```
- **打包 Windows 便携 EXE**（如仅改前端/Electron 且 `work/windows-worker/runtime/PRTS-Worker/PRTS-Worker.exe` 已存在，可加 `-SkipWebBuild` 复用刚建好的 `dist/`）：
  ```powershell
  $env:PRTS_WINDOWS_OUTPUT = 'release'
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1 -Product stronghold -Version 1.4.21
  ```
- **打包 Android APK**（签名密钥保存在各机本地且不入 Git；若新电脑无本地密钥，可仅编 debug 包或自行拷贝本机 `.jks` 与密码文件）：
  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Product stronghold -Version 1.4.12 -VersionCode 11
  ```

### 3.4 换机收工前（离开当前电脑前执行）

1. 跑完 `npm test` 以及必要的构建检查（双产品：`npm run build:telemetry && npm run build`）。
2. 更新下方「4. 当前状态快照」（最新功能进展、已知问题、下一步计划）。
3. 检查 `git status --short` 确认无构建产物/密钥/临时文件，提交并推送到 `origin/main`。

---

## 4. 当前状态快照（每次里程碑更新）

- **最后更新**：2026-11-24（实测 8 项问题修复 + 图表化升级 + 新增「当局牌库」完成，待用户确认界面效果后打包）
- **同步基线提交**：见 `git log -n 5 --oneline`
- **最近一次本地实测出包版本**：
  - Windows 便携包：`PRTS-Stronghold-1.4.21-Windows-x64.exe`（239 MB，SHA-256: `274061cd…55cf7d`）
  - Android 攻略随行包：`PRTS-Stronghold-1.4.12-Android.apk`（147 MB，SHA-256: `d70ca824…bb1a6f`）
  - 注意：本次已新增 `electron/prts_battle_core/stronghold_catalog.json` 并修改 Python Worker，**下次打包 Windows EXE 前须重新执行 `scripts/build-windows-worker.ps1`**。
- **近期已完成里程碑**：
  - **实测问题全量修复 + 图表化视觉升级 + 「当局牌库」新功能**（165/165 测试全绿，双产品构建通过，`1440×900` / `1024×700` 界面预演已验收，暂未打包）：
    - 离线集成官方 V3_1 全量字典 `stronghold_catalog.json`（1,437 干员/衍生物 + 135 策略家 + 310 干员棋子 ID + 116 装备/陷阱 ID + 65 商店装备 + 26 模式元数据），修复英文 ID 泄露与 58 人整局牌库误当场内阵容（`+50`）问题。
    - 解除 `BOSS_ROUNDS = (14, 15)` 硬编码，完整支持单人极速模拟 R9 等动态首领回合与单兵结算文案；同步修复移动端 LAN 导入动态首领伤害与已淘汰回合过滤。
    - 队友淘汰席位自动灰态斜纹并标 `已淘汰 · R×`，不伪造 0 漏怪且持卡自动回流共享池；`我` 徽章严格锁定真实本机席位，新增 `回我视角` 与局末自动保留回放防白屏；忽略本机阵亡后观战 311 包。
    - 全视图图表化：算力遥测 5-KPI + SVG DPS 面积图 + 环形构成图；Boss 伤害削血进度条 + 席位/干员横向柱状图；实时战报各回合承压趋势柱状图。
    - 新增「当局牌库」标签页：实时余量扣除（普通=1/金卡=3/阵亡回流）、1–6 本沙盘切换、精准超几何单刷/5刷/10刷/期望资金/升本收益对比/三连三选一概率，支持一键导入当前攻略核心阵容。
    - 重构桌面微缩悬浮窗（`440×176` 克制尺寸、暗色细滚动条）：全量攻略文本无截断 + 首领战当回合干员输出/DPS 排行 + 普通波次漏怪/血量/在场干员一览。
  - 双端打包 v1.4.21 / v1.4.12，同步安卓战报图形化条形图与相册长图导出；修复 PowerShell 5.1 兼容问题。
  - 重构回合详情与累计面板为图形化兜底条形图（`0cd606c`）；修复实局 4 项体验问题（`5d8ed98`）；落地 S1–S3 洁净室算力遥测与无线副屏体系（`6b11d64`）。
- **下一步待验收 / 可继续事项**：
  - [ ] 等待用户审阅 `ui_preview_report.md` 5 屏界面截图并确认通过。
  - [ ] 用户确认后执行重建 Worker + Windows 便携 EXE + Android APK 双端打包与实机验证。
