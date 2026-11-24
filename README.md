# 卫戍协议战术终端 · PRTS Stronghold

《明日方舟》卫戍协议的非官方阵容、对局跟进与局内战报助手。支持本地识别盟约限制、推荐阵容、R1–R15 逐回合跟进、战术站位与 Boss 路线查询，以及 Windows 实时战报采集与 Android 局内战报归档。

## 单主线双产品架构

本仓库以 **`main` 为唯一源码主线**，通过 `products/` 目录中的声明式配置，按需构建两种彼此品牌与存储隔离的产品：

| 产品变体 | 名称与标识 | 定位与内容 | 应用 ID / 导出与相册 |
| --- | --- | --- | --- |
| `stronghold`（默认） | 卫戍协议战术终端 · PRTS Stronghold | 完整版：全套攻略、盟约识别、2D 站位、Boss 路线与内嵌战报 | `com.prts.stronghold` / `com.prts.stronghold.mobile`，导出 `PRTS战报`，相册 `Pictures/PRTS` |
| `telemetry`（A 模式） | 卫戍战报仪 · Stronghold Telemetry | 纯净战报版：仅保留实时战报与 Boss 路线参照，剥离攻略资源与桌面盟约 OCR | `com.stronghold.telemetry`，配置 `%APPDATA%\com.stronghold.telemetry`，导出 `卫戍战报仪`，相册 `Pictures/卫戍战报仪` |

日常开发、修复与实局验证全部直接在 `main` 上进行，不再维护平行分支或 Git 子模块；待战报功能成熟后，直接以 `-Product telemetry` 从同一份 `main` 源码打出独立双端包。

## 本地开发与自检

使用 Node.js 22.12+ 与 Python 3.12 x64：

- 安装依赖：`npm ci`
- 网页预览：`npm run dev`（主线完整版）或 `npm run dev:telemetry`（纯净战报版）；在开发模式下访问 `?battle-demo` 可离线预演战报三态界面。
- 全量自检：`npm test`（依次运行 `tsc --noEmit`、TypeScript 单测、Node 诊断与产品配置测试、Python 战报分析器测试）。
- 桌面开发运行：`npm run build && npm run desktop`（主线）或 `npm run desktop:telemetry`（纯净战报版）。

## 双端打包

### Windows（x64 便携包）

1. 构建后端运行库：
   - 主线完整版（RapidOCR + 战报核心）：`pwsh -File scripts/build-windows-ocr.ps1 -Product stronghold`
   - 独立战报版（纯 Python 标准库轻量 Worker，无 OCR 依赖）：`pwsh -File scripts/build-windows-ocr.ps1 -Product telemetry`
2. 打包便携 EXE（自动校验对应 `dist/product.json` 与 Worker，输出 EXE 及 `.sha256`）：
   - 主线：`pwsh -File scripts/build-windows.ps1 -Product stronghold -Version 1.4.17`
   - 独立战报：`pwsh -File scripts/build-windows.ps1 -Product telemetry -Version 1.0.0`

### Android（APK）

需要 JDK 17、Android SDK Platform 36 与 Build Tools 35.0.0（可用 `-SdkRoot`、`-JavaHome` 指定路径）：

- 主线完整版：`pwsh -File scripts/build-android.ps1 -Product stronghold`
- 独立战报版（剥离攻略图与盟约扫描，保留回合号自动识别）：`pwsh -File scripts/build-android.ps1 -Product telemetry`

两种安装包使用各自独立的应用包名与签名密钥，支持同机并装，构建过程在 `work/` 中适配清单与包名，不会污染工作区源码。

### 独立战报图标重新生成

图标源位于 `products/telemetry/app-icon.svg`。在装有 Pillow 与 PyMuPDF 的 Windows 环境执行 `python scripts/render-report-brand.py`，即可重新生成 `products/telemetry/` 下的桌面、托盘、启动画面、网页与 Android 图形资产。

## 资料来源与许可

这是非官方、非商业的玩家项目。游戏图像与设定归相应权利方所有；干员和盟约资料参考 [PRTS Wiki](https://prts.wiki/)，阵容资料参考社区攻略（出处见对应数据文件）。思源黑体附带 [SIL OFL 1.1 许可](public/assets/fonts/SourceHanSans-LICENSE.txt)。

战报核心沿用获准公开分发的 **ArkLogs Beta 0.2.6** 源码，保留原始来源标注；`prts_battle_core` 是本项目内的模块名，不改变其原有权属。敌人头像来自[可露希尔 Wiki](https://closure.wiki/zh-cn/stronghold-protocol/3)，领袖属性与路线参考 [WakingSeasons 卫戍工具](https://wakingseasons.github.io/garrison-tool/)，两者均不作为本局结算数据。

项目自有代码采用 [MIT 许可](LICENSE)。该许可不覆盖第三方游戏素材、图鉴资料、社区攻略或第三方依赖。
