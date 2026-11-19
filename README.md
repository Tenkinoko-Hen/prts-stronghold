# 卫戍协议战术终端 · PRTS Stronghold

《明日方舟》卫戍协议的非官方阵容与对局助手。支持本地识别盟约限制、推荐阵容、R1–R15 逐回合跟进，以及战术站位和 Boss 路线查询。

1.4.11 统一 Windows、安卓和悬浮球的 PRTS 黑白菱形图标。Windows 在解包期间显示启动画面，主窗口出现后自动收起。回合切换与详情弹窗加入短动效，并遵循系统的减弱动态效果设置。

1.4.10 新增「阿戈尔 · 歌蕾蒂娅二队」，更新「阿戈尔 · Pith 稳场」。进入任一攻略的「阿戈尔站位」、桌面「2D 战术站位」或手机「资料 → 阿戈尔」，可按用途查看 39 张离线配图及出处；可确认的地图站位按道中与 Boss 战区分。

## 下载

从 [GitHub Releases](https://github.com/Tenkinoko-Hen/prts-stronghold/releases) 下载对应版本。每个版本附 Windows EXE、Android APK 及对应的 SHA-256 校验文件。

- Windows 10/11 x64：直接运行便携 EXE，支持窗口置顶。
- Android 8.0 及以上：安装 APK。横屏时可从悬浮球打开或收起攻略。已安装同签名版本的用户可直接覆盖安装。

## 本地开发

使用 Node.js 22.12 或更新的受支持版本。运行 `npm ci` 安装依赖，再用 `npm run dev` 打开网页预览。`npm run lint` 检查类型，`npm run build` 生成前端产物。

Windows 用 `scripts/build-windows-ocr.ps1` 准备 Python 3.12 x64 OCR 运行库。执行 `npm run build` 后运行 `pwsh -File scripts/build-windows.ps1 -Version 1.4.11`，在 `work/windows-1.4.11` 生成带图标和启动画面的便携 EXE。

Android 使用 JDK 17、Android SDK Platform 36 和 Build Tools 35.0.0。运行 `scripts/build-android.ps1`，可用 `-SdkRoot`、`-JavaHome` 指定工具路径。版本取自 `android/AndroidManifest.xml`。

## 资料来源

这是非官方、非商业的玩家项目。游戏图像与设定归相应权利方所有；干员和盟约资料参考 [PRTS Wiki](https://prts.wiki/)，阵容资料还参考了社区攻略，出处见对应数据文件。思源黑体附带 [SIL OFL 1.1 许可](public/assets/fonts/SourceHanSans-LICENSE.txt)。第三方资料保留各自的权利归属。

项目自有代码采用 [MIT 许可](LICENSE)。该许可不覆盖第三方游戏素材、图鉴资料、社区攻略或第三方依赖。

## 版本发布

用 `vX.Y.Z` 标签标记对应源码，为 Windows 和 Android 构建同版本的安装包。核验后在同一个 Release 附上 EXE、APK、两份 `.sha256` 和更新说明。Android 更新沿用包名和原签名，签名资料只留在构建机。
