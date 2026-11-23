# 卫戍协议 · PRTS 战报终端

《明日方舟》卫戍协议的非官方局内战报工具。战报在 `battle-report` 分支维护，主线 `main` 按战报发布版本嵌入。

## 下载

从[独立战报 1.0.0](https://github.com/Tenkinoko-Hen/prts-stronghold/releases/tag/battle-report-v1.0.0) 下载 Windows EXE、Android APK 与 SHA-256 校验文件。

- Windows 10/11 x64 打开便携 EXE 后默认置顶。管理员模式可采集本机对局，查看逐回合协防、出怪与 Boss 伤害，导出完整 PNG 或离线 HTML。历史列表保存于本次运行期间。
- Android 8.0 及以上安装 APK 并授予悬浮窗权限，在游戏内点悬浮球打开战报。支持回合号识别，漏怪、协防、Boss 总伤和出怪由玩家手动记录。图片保存到相册 `Pictures/PRTS`，HTML 可自行选择位置。

## 本地开发

使用 Node.js 22.12 或更新的受支持版本。运行 `npm ci` 安装依赖，再用 `npm run dev` 打开网页预览。`npm run lint` 检查类型，`npm run build` 生成前端产物。

Windows 需要 Python 3.12 x64。运行 `npm run package:win` 生成独立便携包，也可运行 `python electron/ocr-helper.py --battle-report-check` 验证分析器。

Windows 战报入口为 `src/desktop/BattleReportsView.tsx`，Electron 桥接在 `electron/battle-reports.cjs`，分析器在 `electron/prts_battle_core/`。安卓入口为 `src/mobile/MatchReport.tsx`，本机记录与导出使用 `SessionBridge.java` 和 `ReportFiles.java`。

Android 使用 JDK 17、Android SDK Platform 36 和 Build Tools 35.0.0。运行 `scripts/build-android.ps1`，可用 `-SdkRoot`、`-JavaHome` 指定工具路径。版本取自 `android/AndroidManifest.xml`。

## 资料来源

这是非官方、非商业的玩家项目。游戏图像与设定归相应权利方所有；干员和盟约资料参考 [PRTS Wiki](https://prts.wiki/)，阵容资料还参考了社区攻略，出处见对应数据文件。思源黑体附带 [SIL OFL 1.1 许可](public/assets/fonts/SourceHanSans-LICENSE.txt)。第三方资料保留各自的权利归属。

战报核心沿用获准公开分发的 **ArkLogs Beta 0.2.6** 源码，保留原始来源标注；`prts_battle_core` 是本项目内的模块名，不改变其原有权属。敌人头像来自[可露希尔 Wiki](https://closure.wiki/zh-cn/stronghold-protocol/3)，领袖属性与路线参考 [WakingSeasons 卫戍工具](https://wakingseasons.github.io/garrison-tool/)，两者均不作为本局结算数据。

项目自有代码采用 [MIT 许可](LICENSE)。该许可不覆盖第三方游戏素材、图鉴资料、社区攻略或第三方依赖。

## 版本发布

以 `battle-report-vX.Y.Z` 标记独立战报源码，发布时设 `make_latest=false`。Android 独立包沿用 `com.prts.dossier.review` 及原签名。主线使用 `vX.Y.Z` 标签并在自己的构建中固定所嵌入的战报提交。
