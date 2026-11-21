# 工单：复测 Windows 实局战报（1.4.17，未发布）

> 给另一台电脑上的 Codex：请接续 `Tenkinoko-Hen/prts-stronghold` 的 `dev/windows-battle-report-1.4.17` 分支，先读 `docs/windows-battle-report-handoff.md`，完成桌面自检，再配合我打一次实局，对照两次采集诊断核实回合和漏怪。没有实局就标为待复测。不要合入 `main`、打标签或发布。

**当前状态：待实局复测。** 源码基线是 `489c554428e02ae2b535c8725dda556ee19127ef`。上一台电脑的一局只收到 194 个下行数据段，共 194 字节；「全量场景」和「阶段更新」均为 0。这说明那次没有取得可用场景，不能据此判断新电脑的采集结果。

## 1. 在新电脑启动

准备 Windows 10/11 x64、Git、Node.js 22.12+、Python 3.12 x64 和 PowerShell 7。以下从新目录开始；已有工作副本先用 `git status -sb` 核对分支和本地改动，不要覆盖。先在普通 PowerShell 中执行，`python` 应指向上述 64 位解释器。

```powershell
git clone --single-branch --branch dev/windows-battle-report-1.4.17 https://github.com/Tenkinoko-Hen/prts-stronghold.git
Set-Location prts-stronghold
npm ci
pwsh -File .\scripts\build-windows-ocr.ps1
npm run build
.\work\windows-ocr\runtime\PRTS-OCR\PRTS-OCR.exe --battle-report-check
node --import tsx --test (git ls-files -- '*.test.ts')
```

自检应输出 `PRTS_BATTLE_REPORT_READY`，它只证明分析器可加载。源码基线的 6 个 TypeScript 测试文件此前共通过 43 项；在新机以实际输出为准。旧机的 `work/`、便携包、回放素材和 44 项离线回归不随仓，不是新机自检的前置条件。

## 2. 做一次现场对照

1. 在同一仓库目录，用**管理员 PowerShell** 执行 `npm run desktop`。打开桌面端「战报」，若按钮显示「启用采集」就点它。网页预览不能验证实时采集。
2. 在本机 Windows 原生游戏客户端进入自己的对局。开局时记下游戏实际回合，打开「战报 → 采集诊断」并点「复制诊断」。桌面窗口获得焦点时，`Ctrl+Shift+F9` 也能打开。
3. 至少经历一次回合切换或本路结算后，在同一局再取一次诊断。记下当时游戏回合、本路实际漏怪数，以及战报在对应回合显示的值。没有观察到结算就记「未观察」，不要填 0。

回填时注明测试日期和 `git rev-parse --short HEAD` 输出的提交号：

| 时点 | 游戏回合 / 战报回合 | 本路漏怪：游戏 / 战报 | 采集通道 | 下行段数 / 字节 | 全量场景 | 阶段更新 | 自路结算 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 开局 | | | | | | | |
| 切回合或结算后 | | | | | | | |

**如何判定：** 这一局要分别回答两件事：有没有收到全量场景或阶段更新，以及战报回合、本路漏怪是否与实际一致。若两项场景计数仍为 0、只有结算增加，结论写「仅收到结算」，不要标为场景采集通过。若不一致，记下首次出现差异的回合和两边的值；没有实局条件则停在「自检完成，实局待复测」。只回填脱敏计数和观察结果，不上传玩家名、网络地址、原始抓包或真实战报 JSON。

## 3. 有差异时从哪里查

| 观察到的问题 | 对应源码 |
| --- | --- |
| 没收到场景或阶段更新 | [本地采集与分析](../electron/prts_battle_core/)、[桌面诊断计数](../electron/battle-reports.cjs) |
| 已有场景或结算，回合、漏怪显示却不同 | [战报 JSON 解析](../src/desktop/battleReportData.ts)、[战报界面](../src/desktop/BattleReportsView.tsx) |

历史回放可作对照：R6、R8、R9 的漏怪分别为 5、1、1，合计 7；完整 JSON 记录的 R14 Boss 贡献为 35%（168,000 伤害）。这些数字不是新对局的预期值。网站预告不能用来推断本局席位或 Boss 伤害；缺实战记录就保留未知。

`prts_battle_core` 是已获准公开分发的 ArkLogs Beta 0.2.6 源码在本仓库的模块名，原始署名已保留；资料网站与来源见 [README](../README.md#资料来源)。本工单只接续开发分支，不上传安装包，不创建 Release。
