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
   - `products/telemetry/`（独立纯净版 · A 模式 · **PRTS Stronghold Lite**）：`PRTS Stronghold Lite · 卫戍战报仪`（`com.stronghold.telemetry`），纯 PC 轻量战报工具，彻底剥离攻略、Boss 路线图与手机副屏，仅保留干员头像/字体与实时战报核心（40px+34px 极简顶栏、`1180×740` 总览、`460px` 侧边栏贴边 + 窗口记忆、牌库「追踪我场上干员」与桌面悬浮窗）。
   - 共享源码禁止硬编码单一产品名，统一经 `src/brand/productBrand.ts`、`products/<id>/product.json` 或 Android 资源读取。
2. **Windows 桌面采集与启动**：
   - 已彻底移除桌面端 RapidOCR；统一为纯标准库 Python 抓包进程 `PRTS-Worker`（支持实时协议解析、开局 `1/3 确认本局信息` 画面 Windows 原生 OCR 禁选兜底 + TCP 双通道同步、四席编队/策略家/本数解析与 Boss 参战干员映射、零注入 `ReadProcessMemory` 双重逻辑帧守卫算力采样）。
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

1. 确认无仍在运行的子代理/后台任务，所有待修改项已完成审批收尾。
2. 跑完 `npm test` 以及双产品构建检查（`npm run build:telemetry` → `npm run build`，保证 `dist/` 停留在默认 `stronghold`）。
3. 更新下方「4. 当前状态快照」（今日改动、最新验证结果、未完成项/已知问题、下次接续第一步）。
4. 检查 `git status --short` 确认无构建产物/密钥/真实战报等禁提文件，提交并推送到 `origin/main`（不打 tag、不发 Release）。

> **快捷口令约定（T3 Code / Antigravity）**：
> - 说 **「下班」** 时，自动执行上述 3.4 完整收口与推送流程，并返回最新 commit hash 与 3 行交接摘要。
> - 说 **「上班」** 时，自动执行 `git pull --ff-only origin main`，核对最新 `git log -n 5 --oneline` 与 `docs/HANDOFF.md`，然后按 Neon 规划审批 + Hydrogen 执行流程接续开发。

---

## 4. 当前状态快照（每次里程碑更新）

- **最后更新**：2026-11-27 14:44（修复 PC 宽屏模式「战术跟打」在回合推进 / 抓包更新 / 重连 / OCR→抓包切换时自动弹回「选择本局阵容」页的 P0 缺陷：① 后端 `electron/prts_battle_core/analyzer.py` 锁定同局首见非空 `banned_bonds` 并去重，换局按 `stage_seed` 重置；② 前端移除 `<MetaCompsView key={matchSyncId}>` 强拆重挂载、将 `guideStage` 提升至 `App.tsx` 受控管理、抽出纯函数 `decideBanSyncAction` 与 `normalizeBanSignature` 并在 `setBanState` updater 外统一同步状态；239/239 全栈单测 + Electron 45 真机 E2E 烟测 + 双产品 Worker 重建全绿）
- **同步基线提交**：见 `git log -n 5 --oneline`
- **最新验证结果**：
  - `npm test` **239/239 全绿**（`tsc --noEmit` 通过 + TS 132/132 + Node 41/41 + Python 66/66）
  - 真实 Electron 45 跟打全流程 E2E 烟测通过（R1 首帧、R2–R5 乱序 Ban 推进、R5 重连换 `matchKey` 均保持跟打页与自选阵容不弹回；真正新局 R1 正常重置回选阵容页）
  - 双产品 Windows Python Worker（`PRTS-Worker.exe` / `Telemetry-Worker.exe`）重建并自检通过
  - `npm run build:telemetry` → `npm run build` 双产品构建通过（`dist/` 停留在默认 `stronghold`）
- **已发布最新正式版本（`v2.1.0` · Latest，2026-11-27 15:01 同步刷新 PC 双包至 GitHub Release）**：
  - Release 页面：`https://github.com/Tenkinoko-Hen/prts-stronghold/releases/tag/v2.1.0`（PC 双包已基于 `ea4439a` 替换更新）
  - **PC 完整版**：`PRTS-Stronghold-Full-2.1.0-Win64.exe`（229.48 MiB / 240,628,926 字节，SHA-256: `ab7286d246cc52e865edcefcfb7bf9d13714bd15fec4fdc9cdfe56934cc2f73d`）
  - **PC 纯净版（Lite）**：`PRTS-Stronghold-Lite-2.1.0-Win64.exe`（126.64 MiB / 132,786,734 字节，SHA-256: `aae8d314af9ef472c8497108ac2a134b26c3ea225156fdb6d80c24c8661af8e3`）
  - **Android 完整版**：`PRTS-Stronghold-2.1.0-Android.apk`（143.04 MiB / 149,984,238 字节，VersionCode `210`，SHA-256: `2770e7bf4e538a8f3390217dbca106d582597d3fc10110402d0e53cb16e41db8`，v2/v3 签名校验通过）
  - **Android 纯净版（卫戍战报仪 Lite）**：`PRTS-Stronghold-Lite-2.1.0-Android.apk`（32.18 MiB / 33,746,446 字节，VersionCode `210`，SHA-256: `cf48ed430b4ed57a361229c5d5ef7c827a895e5d5f9e87f9cd2dfc559844d81c`，v2/v3 签名校验通过）
- **最近一次正式发布版本**：
  - **主线完整版（`v2.0.0` · Latest）**：
    - Windows 便携包：`PRTS-Stronghold-2.0.0-Windows-x64.exe`（229.42 MiB / 240,560,974 字节，SHA-256: `ff2d64b4…08a2b3e8`，已内置最新 `PRTS-Worker` 与去 AI 化文案）
    - Android 攻略随行包：`PRTS-Stronghold-2.0.0-Android.apk`（142.12 MiB / 149,025,407 字节，VersionCode `21`，SHA-256: `e1debc68…57d4f005c`，v2/v3 签名校验通过）
  - **纯 PC 轻量版（`lite-v2.0.1`）**：
    - Windows 便携包：`PRTS-Stronghold-Lite-Windows-x64-2.0.1.exe`（126.54 MiB / 132,685,303 字节，SHA-256: `971e8f64…cdcd21b6a`，剥离全部攻略、Boss 路线图与手机副屏，保留实时总览、牌库概率、伤害/Boss 统计、460px 侧边栏与桌面悬浮窗）
  - 宣传视频（输出至本地 `release/`，不入 Git）：`PRTS-Stronghold-2.0-Bilibili-16x9.mp4`（1920×1080）与 `PRTS-Stronghold-2.0-Douyin-9x16.mp4`（1080×1920）
  - 注意：若在新电脑打包最新 EXE，需先执行 `scripts/build-windows-worker.ps1 -Product stronghold`（或 `-Product telemetry` 打 Lite 版）生成本机 Worker；本机已安装并登录 `gh` CLI（大文件上传如遇代理重置可配合 `curl --http1.1 --limit-rate 3M`）。
- **近期已完成里程碑**：
  - **小米 14 真机实测 4 项 Android Bug 根治**（198/198 全栈测试 + Android 920 项 Java 测试 + 双产品构建全绿）：
    - **HUD 文本与本数修复（`MatchReport.tsx` / `OverlayService.java`）**：抓包运行或手动录 0 回合时不再以旧记录本 `R1 · 已录 0 回合` 覆盖悬浮窗；未选跟打阵容时底栏显示清晰实时引导，顶栏优先展示我方抓包真实商店本数。
    - **Android 实战四席盟约完整显示（`build-android.ps1` / `StrongholdEnemyCatalog.java` / `StrongholdWireDecoder.java` / `BattleCaptureState.java`）**：APK 打包接入 143 干员 `assets/operator_reference.json` 静态兜底与弯引号归一化，过滤 `position < 0` 整备区，修正 `独行` 恰好 1 人激活判定，彻底解决 `squadBondsBySeat` 为空时 HUD/弹窗不显示盟约的问题。
    - **极速模拟（18 项）与单人规程等级 15（26 项）Ban 选扫描（`CovenantDetector.java` / `CovenantScanState.java` / `CovenantScanService.java` / `covenantScan.ts` / `CovenantScanner.tsx`）**：放开全高裁剪读取左上角模式标题与底缘文字；增补小米 14 20:9 宽屏高偏移圆心采样（`3.85/4.35 × th`）；支持极速模拟 18/18 自动完成并标记其余 8 项受限，以及单人模拟双屏累积、底排 6 枚零歧义探测与明确上滑提示。
  - **Android Full / Lite 出怪与漏怪怪物图标全链路补齐 + 移动端 999 层盟约高亮**（196/196 全栈测试 + Android 879 项直跑测试 + 双产品构建全绿）：
    - **统一敌怪图集解析（`MobileCapturePanel.tsx` / `EnemyPortraitAtlas.java`）**：导出 `resolveEnemyPortraitIndex` 与 `MobileEnemyIcon`，Web 与 Java 双端统一支持 `boss_1..boss_17` 映射及 `_2`/`_3` 去尾缀回退。
    - **Android Full / Lite WebView 同构（`MobileApp.tsx` / `TelemetryMobileApp.tsx` / `telemetryMobile.css`）**：双端战报/实况页统一补齐带实机怪物图标的「漏怪怪种条」「未来两波出怪」与「Boss 排行卡」，四席盟约支持 `0..999` 钳位、100+/500+ 金黄/橙金高亮与 `+N` 溢出提示，并清零残留 `Microsoft YaHei UI` / `Consolas`。
    - **Android 原生悬浮窗（`OverlayService.java`）**：Full 与 Lite 漏兜页均开启双波并排出怪图标行（按品牌分色：Full `#FFE600` / Lite `#22D3EE`）+ 底部漏怪实机图标条。
  - **协防兜底条高对比度升级 + 全端 8 盟约 / 999 层叠层适配**（192/192 全栈测试 + Android 872 项直跑测试 + 双产品构建全绿）：
    - **协防进度条卡片（`battleReports.css` / `BattleReportRounds.tsx`）**：升级四席位色条为高饱和渐变（含 4 席亮紫 `#7c3aed -> #c084fc`）、10px 25% 微刻度轨道与右侧亮边高光；强化 `is-out` / `is-in` / `is-peer` 卡片左侧 3px 主题强调边与标题对比度，数字升级为等宽带框徽章并标 `只`。
    - **8 盟约 + 999 层全端适配（`combatTelemetry.ts` / `covenantBonds.ts` / `SeatTelemetryStrip.tsx` / `HudStripApp.tsx` / `OverlayService.java`）**：新增 `active_bonds` 解析与 `0..999` 钳位及 `high (>=100)` / `max (>=500)` 终末地金黄/橙金分级；PC 主界面宽屏支持最多 8 盟约自动换行、紧凑 4 盟约 `+N` 溢出悬浮全览；PC HUD 与 Android 原生悬浮窗单行展示最高 3 枚胶囊 + 醒目 `+N`（非穿透态可点击展开/Toast 查阅全部盟约），保持零横向裁切、零垂直滚动条。
  - **全端 HUD 字体统一 + 2K/小米 14 字号重构 + 5 项实局数据口径 Bug 根治**（191/191 全栈测试 + Android 872 项直跑测试 + CDP 三档零裁切实测全绿）：
    - **PC 悬浮窗（`hud-overlay.cjs` / `HudStripApp.tsx` / `hudTelemetryViewModel.ts`）**：全量中文字体统一回 `Source Han Sans CN`（`var(--font-sans)`），仅纯数字/短码走 `var(--font-mono)`；新增持久化 3 档缩放（`sm 500×248` / `md 580×280` 2K 默认 / `lg 660×316`）与顶栏 `小/中/大` 快捷切换，最低字号 `≥11px`（`sm ≥10.5px`），三档漏兜 2×2+高漏底栏一屏零滚动条无裁切，底部双波无半截头像裁切。
    - **Android 原生悬浮窗（`OverlayService.java`）**：彻底移除 `Typeface.MONOSPACE`，统一 `prtsSans` + `prtsNumeric`（`sans-serif-condensed` + `tnum`），按小米 14 6.36" 横屏（`~840×378dp`）提档至 `10–12.5sp`、横屏宽 `448dp`。
    - **5 项实测数据修复**：① `covenantBonds.ts` 接入 143 干员 `operatorReference.json` 兜底与引号归一化，同步 `BattleCaptureState.java` 跨席查找，修复 1/2/4 席盟约漏显；② `HudStripApp` 漏兜统一复用 `roundMetrics`，并修复全队均漏回合误显 `1` 与误标 `零逃`（同步修 `SeatTelemetryStrip.tsx`）；③ `buildHudBossTeamData` 改为逐席合并 `bossDamage/bossOfficial/bossUplink/bossPercent`，修复 R14 4 人榜漏掉 `#3` 席位；④ `BattleReportPanels.tsx` 统一 R15 Boss 排行分母、合作圆环中心为全队输出、清洗弯引号并优化状态文案；⑤ `stats.py` 负数坐标归入整备，`SeatLineupsStrip` 未分整备时标 `持有 X 枚`，R11 队友互兜按施救者席位着色并去重胶囊。
  - **全四端终版 UI 同构升级 + MuMu 防挡收起联动 + 双悬浮窗瘦身闭环（`84cfd8d`，1,064 项全栈/Fuzz/真机 DOM 验证全绿，已出 `2.0.6` 全四端测试包）**：
    - `src/desktop/covenantBonds.ts` + `SeatTelemetryStrip.tsx`：统一 PC Full `02 实时战报`、PC Lite `总览` 与 MuMu 贴边抽屉的四席双轨态势条（`兜(青)/漏(橙+红)` + `♥HP` + `1–6本` + 在阵干员去重与转职装备 `+1` 实时激活盟约 + 淘汰灰态回流提示）。
    - `electron/mumu-layout.cjs` / `hud-overlay.cjs` / `main.cjs` + `MumuDrawerApp.tsx` / `TelemetryApp.tsx` / `HudStripApp.tsx`：PC Full 与 PC Lite 同步支持 `inside-right` 防遮挡黄条一键收起至 `460×188` 顶部微缩 HUD ⇄ 恢复贴边，Lite 460px 窄栏自动折叠多禁选胶囊，PC HUD 升级双波并排与零漏底栏自动折叠，并严格区分 Full 黄 `#FFE600` / Lite 青 `#22D3EE`（含异常守护卡）。
    - `src/mobile/MobileApp.tsx` / `mobileSession.ts` + `android/.../OverlayService.java`：Android Full 补齐第 4 页签「战报」（5 页签 `[识别|方案|跟进|战报|资料]` 闭环），原生横屏悬浮窗纵向瘦身 `-43%` 至 `~136dp`（Full/Lite 统一 `376dp` 2×2 宽卡、下两波单行同排、零漏底栏自动 `View.GONE`、双品牌分色）。
  - **PC 端自动适配 MuMu 模拟器 + 方案 A 右侧贴边战术抽屉专属 UI**（172/172 测试全绿，双产品构建通过）：
    - `electron/prts_battle_core/windows_capture.py` & `live.py`：纯 Win32 `ctypes` 识别 `Arknights.exe`（优先级最高）与 MuMu 家族进程及标题匹配 `明日方舟 / Arknights` 的可见未最小化窗口坐标（`DwmGetWindowAttribute` 优先、回退 `GetWindowRect`），`game_connections` 针对 MuMu 过滤回环与 `5037/5555/7555/16384–16500` 控制面端口，去重上报 `source` 事件。
    - `electron/mumu-layout.cjs` / `main.cjs` / `hud-overlay.cjs` / `battle-reports.cjs` / `preload.cjs`：未检测到 MuMu 运行明日方舟时 100% 沿用原有 PC 流程；检测到后完整版自动切入 `mumu-drawer`（右侧留白足够则零遮挡贴外侧右边，空间不足则叠放至 MuMu 内侧最右 28% 并置顶），支持一键「全屏（尊重本次会话手动切回）」、「收起至 MuMu 顶部微缩悬浮条（悬浮条提供『展开抽屉』一键恢复）」、「重新吸附」及退出 MuMu 自动复原。
    - 新建 `src/desktop/MumuDrawerApp.tsx` + `src/desktop/mumuDrawer.css`（终末地黄 `#FFE600` × PRTS 青 `#00E5FF` 4 签抽屉：`总览` / `跟打` / `牌库` / `战报`），与标准三域共享 `records` / 禁选 / 阵容 / 回合状态；Lite 版同步共享底层 MuMu 抓包并标识来源；支持 `?mumu-demo=1` / `?mumu-demo=coop_boss` 演示预览。
  - **PRTS Stronghold Lite（资深玩家战报仪）PC 端完整 UI 落地**（`products/telemetry/` 升级，166/166 测试全绿，双产品构建通过）：
    - 彻底剥离阵容/站位攻略与 `boss-routes` 路线图（仅保留 `avatars` + `fonts`），视觉切换为低疲劳 PRTS 遥测青 `#22D3EE` + 哑光钢蓝 `#3698CC` 深黑仪器风。
    - 重构 `TelemetryApp.tsx` 与 `telemetryLite.css` 为 40px+34px 极简双行仪器顶栏，新增默认首页 `LiteCockpitView.tsx`（实时驾驶舱：四席态势条 + 波次出怪雷达 + 近期回合速览 + 场上/心仪牌池盯防 + 实时算力 Top 5 / Boss 削血自动切换，以及待机三段式自检面板）。
    - `electron/main.cjs` + `preload.cjs` 新增 `windowLayout` IPC，支持一键切换 `1180×740` 宽屏驾驶舱 ↔ `460px` 右侧贴边伴随窄栏（自动置顶并持久化上次窗口形态与位置）。
    - `BattleReportDeckPool.tsx` 与 `HudStripApp.tsx` 补齐无攻略模式下的「追踪我场上干员」与本席在阵干员自动盯防；`MobileApp.tsx` 配对 PC Lite 时自动切换无线副屏为无攻略纯净态。
    - 浏览器实测覆盖 `?lite-demo=coop_elim`、`coop_boss`、`standby` 与 `460×820` 窄栏全页无遮挡无横向溢出。
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
- **未完成项 / 已知问题与次日上班接续第一步**：
  - **次日上班第一步（优先）**：在公司/常用电脑执行 `git pull --ff-only origin main`，检查 `git log -n 5 --oneline`，并结合最新 `2.0.6` 全四端本地实测反馈推进收尾：
    1. **PC / MuMu 实机验收**：实测 `PRTS-Stronghold-Full-2.0.6-Win64.exe` 与 `PRTS-Stronghold-Lite-2.0.6-Win64.exe` 在普通 PC 端及 MuMu 12 下的外侧贴边 / 内侧防挡黄条一键收起至顶部 HUD / `460×188` 双波与 2×2 盟约悬浮窗，以及 `Ctrl+Shift+F9` 诊断面板下的 MuMu 抓包稳定性；
    2. **Android 实机验收**：实测 `PRTS-Stronghold-2.0.6-Android.apk`（5 页签「战报」闭环）与 `卫戍战报仪-Android-2.0.6.apk` 的局内横屏 `~136dp` 原生悬浮窗零遮挡表现、2×2 盟约显示与免 Root VPN 断线/加速器冲突自愈；
    3. **发布决策**：实机验收确认无微调需求后，按需决定是否统一打正式版本并发布 GitHub Release（`v2.0.6` / `lite-v2.0.6`）。
