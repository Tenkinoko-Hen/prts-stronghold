# 接续工单：Windows 战报 Boss 伤害实局复测

## 当前进度

- 仓库：`Tenkinoko-Hen/prts-stronghold`
- 分支：`dev/windows-battle-report-1.4.17`
- 功能和离线自检已完成；未完成的是用户实局验证。确认分支后先运行 `git status -sb`、`git rev-parse --short HEAD`。
- 源码已推送并核对 GitHub 远端。换机时确认检出的开发分支包含修复提交 `f9732e6`。
- 原开发机测试包（不随 Git 同步）：`J:\PRTS\prts-stronghold\work\windows-latest\PRTS-Stronghold-Windows-x64.exe`
- 包 SHA-256：`CB121FFA1E308156759E43FAAF68A088ACD8B7544332B00CE9BF9FF13F0768CD`
- 上传范围仅限当前开发分支源码；不上传 EXE、真实战报 JSON、玩家名、网络地址或原始抓包，不合入 `main`，不创建 GitHub Release 或标签。

公司电脑没有工作副本时，从空目录执行：

```powershell
git clone --single-branch --branch dev/windows-battle-report-1.4.17 https://github.com/Tenkinoko-Hen/prts-stronghold.git
Set-Location prts-stronghold
git merge-base --is-ancestor f9732e6 HEAD
```

最后一条命令退出码应为 0。随后按[桌面自检流程](windows-battle-report-handoff.md#1-在新电脑启动)准备环境；若需要本地便携包，运行 `npm run package:win`，产物在新工作副本的 `work/windows-latest/`。

## 已实现与自测

- Boss 运行快照、达标信号或官方榜单在缺失阶段帧时，可按最近确认进度关联到 R14，并将回合依据标记为 `inferred`；界面提示“回合按最近确认进度关联，等待场景校正”。明确的阶段数据可校正推定结果。R15 不借用 R14 历史榜单。
- Boss 结束后迟到的同局运行快照继续归入原回合；同局稀疏更新、归档和重连不丢失已记录 Boss 数据，新局不会继承旧局数据。
- 离线测试：Python 43 项、TypeScript 72 项、Node 诊断 3 项全部通过；`npm run lint`、`npm run build`、Windows OCR `--battle-report-check` 和完整 Windows 便携包流程通过。
- 此修复只能保存采集通道实际收到的 Boss 专属数据。若实局诊断中 Boss 运行快照、榜单和达标信号仍均为 0，不能从屏幕浮字推算精确伤害，需继续调查采集通道与未识别消息 ID。

## 下一步实测

1. 先看游戏和 PRTS 是否已有运行实例，不要强制结束用户进程。用包含本轮修复的桌面运行或便携包测试；记录实际程序路径和源码提交，避免把旧程序结果归给当前源码。
2. 开局后在 PRTS 窗口按 `Ctrl+Shift+F9` 打开采集诊断，记录游戏回合、Boss 相关计数和下行累计值；不要复制或上传原始战报、抓包文件。
3. 切回合后再取一次诊断；Boss 开战、结算或结束后追加一次诊断。对照界面中的 R14/R15 伤害、榜单及回合依据，记录各时点的游戏回合和界面数值。
4. 只有在诊断显示采到 Boss 专属运行快照、榜单或达标信号，并且数值与游戏内结果可核对时，才能将伤害采集标为通过。若计数仍为 0，记录脱敏计数及未识别消息 ID，结论保持“待复测/采集未取得 Boss 数据”。
5. 用新局验证旧局 Boss 数据和回合不会残留。提交给开发者的复测材料只保留脱敏计数、观察到的回合和差异，不上传真实战报或原始网络数据。

更完整的诊断采样步骤见 [`windows-battle-report-handoff.md`](windows-battle-report-handoff.md)。
