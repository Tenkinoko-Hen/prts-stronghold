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

- **最后更新**：2026-11-25（正式发布 **PRTS Stronghold 2.0.0** 双端包到 GitHub Releases `v2.0.0`，并产出 B站 16:9 横屏与抖音 9:16 竖屏全功能宣传视频）
- **同步基线提交**：见 `git log -n 5 --oneline`
- **最近一次正式发布版本（`v2.0.0`）**：
  - Windows 便携包：`PRTS-Stronghold-2.0.0-Windows-x64.exe`（229.3 MiB / 240,483,805 字节，SHA-256: `3afecf46…b532542`，已内置最新 `PRTS-Worker` 与 `stronghold_catalog.json`）
  - Android 攻略随行包：`PRTS-Stronghold-2.0.0-Android.apk`（142.1 MiB / 149,025,407 字节，VersionCode `21`，SHA-256: `d417ba79…de8cc871`，v2/v3 签名校验通过；已修复 Android 11–15 冷启动在 `setContentView` 前调用 `getInsetsController()` 导致的闪退）
  - 宣传视频（输出至本地 `release/`，不入 Git）：`PRTS-Stronghold-2.0-Bilibili-16x9.mp4`（1920×1080）与 `PRTS-Stronghold-2.0-Douyin-9x16.mp4`（1080×1920）
  - 注意：若在新电脑打包最新 EXE，需先执行 `scripts/build-windows-worker.ps1 -Product stronghold` 生成本机 `work/windows-worker/runtime/PRTS-Worker/PRTS-Worker.exe`。
- **近期已完成里程碑**：
  - **Boss 伤害多图组合看板 + 导出战报文档重构与干员头像内嵌 + 悬浮窗双页模式 + 双端出包 v1.4.23 / v1.4.14**（`e0e78fd`，166/166 测试全绿，双产品构建通过）：
    - `BattleReportPanels.tsx` / `battleReports.css` 重构 `BossDamage` 为 2 层互补图看板：顶部 4 格 KPI 速读 + 按席位归因分段首领削血条（修复未结算时混用旧 `boss_ratio` 导致的占比冲突）；下方双栏组合「SVG 环形占比图 + 紧凑阵亡未参战标签」与「规整刻度微网格参战干员输出排行（带头像与席位同色标识）」。
    - `battleReportExport.ts` / `battleReportPortraits.ts` / `battleReportDocument.ts` / `battleReportDocument.css` 全面重构离线 HTML / PNG 导出文档为 PRTS × 终末地 `// 简报` 工业 BI 版式：新增离线 `data:image/png` 干员头像精灵图拼接（零外链、零 `src=`、100% 满足原 CSP 规范），覆盖席位阵容头像、Boss 干员排行与算力明细；同步新增内嵌 SVG 回合承压柱图与 Boss 分段血条/环形图组合。
    - `HudStripApp.tsx` 普通波次升级为解锁态可切换双页（`牌池+出怪` ↔ `队友态势`），自动记忆偏好并锁定穿透态保持所选页；跨窗口监听 `localStorage` 同步「当局牌库」心仪目标（无心仪时自动追踪 `hud.syncGuide` 同步的当前阵容核心干员），实时显示余量/单刷率/`在售`/红警`池空` + 带头像本波/下波出怪预告；首领战自动切参战干员伤害条 + DPS。
    - 修复 `electron/prts_battle_core/stats.py` `deployed_count` 混入装备/陷阱坐标导致 `在场 > 持有` 的溢出 bug，以及 `src/data/prtsAvatars.ts` `resolveOperatorAvatars` 未剥离引号导致 `“暴躁铁皮”` 显示文字回退的问题（补齐双端回归测试）。
  - **手机专用横屏无线副屏 + PRTS Wiki 装备全图标 + 实测体验优化**（`bb9f2ae`，165/165 测试全绿，双产品构建通过）：
    - 安卓原生新增 `PRTSDisplay.setSecondScreenMode` 桥接（`MainActivity.java` / `GuideWebView.java` / `LanSyncBridge.java`）：配对连接电脑后自动收起悬浮窗并切入全屏沉浸横屏 + 屏幕常亮，断开即自动恢复竖屏回到手机攻略界面；前端新建 `MobileSecondScreen.tsx` / `secondScreen.css`（支持 `态势总览` / `阵容攻略` / `当局牌库` / `战报兜底` / `算力/Boss` 自由切换及待开局态）；`lan-sync.cjs` 局末保留最后战报防白屏。
    - 离线合入 PRTS Wiki 全部 136 枚卫戍协议道具官方图标（`src/desktop/equipPortraits.png` + `equipPortraits.json` + `EquipIcon.tsx`），65/65 商店装备 100% 匹配。
    - 修复 `BattleReportDeckPool.tsx` 切页重置心仪干员/装备问题（按对局键持久化，新局自动重置）。
    - 精简 `BattleReportRounds.tsx` 承压趋势图高度至 `82px` 并限制选中列宽；悬浮窗普通波次增加 `普通波次 · 首领战自动切 DPS` 透明提示。
  - **终末地 `// 简报` 工业 BI 图表重构 + 悬浮窗角色头像 + 全端字体统一 + 双端打包 v1.4.22 / v1.4.13**：
    - 新建 `src/desktop/prtsChartKit.ts`，全量收敛图表为克制哑光终末地工业色板（钢蓝 `#3698CC` / 战术赭黄 `#D8BF4B` / 告警红 `#D64840` + 微网格底纹），实现平滑无过冲单调样条 DPS 趋势图（含均值虚线与峰值直标）、规整坐标轴的 SVG 回合承压分组柱图与各阶牌池「余量蓝 / 消耗黄」堆叠柱图、0–100% 标尺对比条与 5 阶哑光环形图。
    - 悬浮窗（`440×176`）全面补齐干员头像 Icon（首领战每行 18px 头像 + 普通波次在场标签 16px 头像）与统一暗色细滚动条。
    - 全端（PC 主界面 / 图表 SVG / 悬浮窗 / 导出文档 / Android 端与相册长图）统一为 **Source Han Sans CN（思源黑体）+ Bahnschrift / DIN Alternate 工业等宽数字**，清零 Consolas/system-ui 混杂；同时修复 `build-android.ps1` 非提权壳层 `Set-Acl` 权限报错（改用 `[IO.Directory]::SetAccessControl`）。
  - **实测问题全量修复 + 「当局牌库」新功能**（`9c32238`，165/165 测试全绿）：
    - 离线集成官方 V3_1 全量字典 `stronghold_catalog.json`（1,437 干员/衍生物 + 135 策略家 + 310 干员棋子 ID + 116 装备/陷阱 ID + 65 商店装备 + 26 模式元数据），修复英文 ID 泄露与 58 人整局牌库误当场内阵容（`+50`）问题。
    - 解除 `BOSS_ROUNDS = (14, 15)` 硬编码，完整支持单人极速模拟 R9 等动态首领回合与单兵结算文案；同步修复移动端 LAN 导入动态首领伤害与已淘汰回合过滤。
    - 队友淘汰席位自动灰态斜纹并标 `已淘汰 · R×`，不伪造 0 漏怪且持卡自动回流共享池；`我` 徽章严格锁定真实本机席位，新增 `回我视角` 与局末自动保留回放防白屏；忽略本机阵亡后观战 311 包。
    - 新增「当局牌库」标签页：实时余量扣除（普通=1/金卡=3/阵亡回流）、1–6 本沙盘切换、精准超几何单刷/5刷/10刷/期望资金/升本收益对比/三连三选一概率，支持一键导入当前攻略核心阵容。
- **下一步待验收 / 可继续事项**：
  - [ ] 实机联调双端新包 `v1.4.23` / `v1.4.14`：核验手机横屏无线副屏自动横屏与断开回退、装备全图标与心仪持久化、悬浮窗双页模式（`牌池+出怪` ↔ `队友态势`）、Boss 多图组合看板以及带干员头像的离线 HTML/PNG 战报导出。
