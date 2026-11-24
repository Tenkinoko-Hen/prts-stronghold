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
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-worker.ps1 -Product stronghold
  ```
- **打包 Windows 便携 EXE**（如仅改前端/Electron 且 `work/windows-worker/runtime/PRTS-Worker/PRTS-Worker.exe` 已存在，可加 `-SkipWebBuild` 复用刚建好的 `dist/`）：
  ```powershell
  $env:PRTS_WINDOWS_OUTPUT = 'release'
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1 -Product stronghold -Version 1.4.21
  ```
- **打包 Android APK**（签名密钥保存在各机本地且不入 Git；若新电脑无本地密钥，可仅编 debug 包或自行拷贝本机 `.jks` 与密码文件）：
  ```powershell
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Product stronghold
  ```

### 3.4 换机收工前（离开当前电脑前执行）

1. 跑完 `npm test` 以及必要的构建检查（双产品：`npm run build:telemetry && npm run build`）。
2. 更新下方「4. 当前状态快照」（最新功能进展、已知问题、下一步计划）。
3. 检查 `git status --short` 确认无构建产物/密钥/临时文件，提交并推送到 `origin/main`。

---

## 4. 当前状态快照（每次里程碑更新）

- **最后更新**：2026-11-24
- **同步基线提交**：`5d8ed98` 之后（详见 `git log -n 5 --oneline`）
- **最近一次本地实测出包版本**：
  - Windows 便携包：`PRTS-Stronghold-1.4.20-Windows-x64.exe`（注意：若在新电脑打包最新 EXE，需先执行 `scripts/build-windows-worker.ps1` 生成本机 `work/windows-worker/runtime/PRTS-Worker/PRTS-Worker.exe`）
  - Android 攻略随行包：`PRTS-Stronghold-1.4.11-Android.apk`
- **近期已完成里程碑**：
  - 修复实局 4 项体验问题（`5d8ed98`）：新增开局 `1/3 确认本局信息` 画面 Windows 原生 OCR 禁选自动轮询与 `Ctrl+Shift+F8` 手动兜底；回合列表无论兜住与否均展示怪种、`≈0` 统一显示「无漏」、已获昵称全量展示去席位前缀；去除全局累计 `*` 星号；首领面板改为单行头像+六维属性条，点击弹窗查看详情与路线。
  - 落地 S1–S3 自研洁净室算力遥测（DPS）与单/多人全态战报体系：
    - **S1（协议深挖 + 算力核心 + 全态 UI）**：深挖卫戍 `300/302/306/341` 四席编队、策略家、本数与首领攻击干员映射；自研 `combat_meter.py` 定点数逻辑时钟三口径速率（`激战秒伤 1.5s` / `5s 脉冲` / `在场均伤`）、四维伤害+治疗、召唤物归主与场地装置隔离；`02 实时战报` 新增终末地风「算力遥测」矩阵、单人关卡/单人规程自适应视图及战报导出算力表。
    - **S2（PC 零注入只读采样 + 穿透微缩条）**：实现 `pc_inspector.py` 纯 `ReadProcessMemory` 双重逻辑帧/实例守卫只读采样器（零注入、不触发环境异常、自动校验客户端构建指纹并优雅降级）；新增桌面端 Electron 置顶鼠标穿透微缩条（`Ctrl+Shift+F10`）。
    - **S3（免 Root 安卓三态穿透条 + PC↔安卓无线副屏）**：`OverlayService.java` 升级三态并支持 `FLAG_NOT_TOUCHABLE` 100% 触控穿透微缩战术条；新增局域网 4 位配对码直连同步（PC `lan-sync.cjs` ↔ Android `LanSyncBridge.java`，同步 Ban、回合、实时 DPS 与 15 回合战报直存手机相册），补齐移动端结算快捷解析与实效秒伤/护甲抛光推演器。
- **下一步待验收 / 可继续事项**：
  - [ ] 打包最新 Windows 便携版与双产品 Android APK 进行实机联调，核验开局 OCR 兜底、卫戍单/多人战报、穿透微缩条与手机无线副屏体验。
  - [ ] 如需进一步开启 Windows 官服客户端特定构建版本的只读内存偏移表，可在 `pc_inspector.py` 的 `layout_registry` 按构建指纹注册对应 `FieldLayout`。
