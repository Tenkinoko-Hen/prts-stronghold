# PRTS Stronghold 仓库协作与自动提交规范

## 1. Git 自动提交与推送

- 在本仓库完成代码或文档改动，并通过对应验证（涉及源码改动至少运行 `npm test`）后，**自动整理 Git 提交并推送到 `origin/main`**，无需每次另行确认。
- 提交说明沿用仓库风格（Conventional Commits + 中文摘要，如 `feat(report): ...`、`fix(app): ...`、`refactor(app): ...`、`docs(readme): ...`）。
- **禁止自动执行的操作**：
  - 严禁提交或推送任何构建产物（`dist/`、`work/`、`release/`、`.exe`、`.apk`）、签名密钥（`.jks`、`.p12`、`.pfx`、`.clixml`）、真实对局战报 JSON、玩家名、网络地址或原始抓包。
  - 未获用户明确指示时，不创建 Git 标签（`git tag`）、不发布 GitHub Release、不执行强推（`git push --force`）。

## 2. 单主线双产品架构约定

- 本仓库以 **`main` 为唯一开发主线**，日常开发、修复与实局验证优先在主线完成；不重新引入 Git 子模块或长期平行分支。
- 产品品牌、图标、应用 ID、签名路径与导出署名集中在 `products/`：
  - `products/stronghold/`（默认主线）：PRTS Stronghold 完整版，战报导出前缀 `PRTS战报`，Android 相册 `Pictures/PRTS`，沿用 `com.prts.stronghold` / `com.prts.stronghold.mobile`。
  - `products/telemetry/`（独立纯净版 · A 模式）：卫戍战报仪 · Stronghold Telemetry，仅保留战报与 Boss 路线参照，剥离攻略图与桌面盟约 OCR，使用 `com.stronghold.telemetry` 与独立签名。
- 共享战报代码（前端、Electron、Android Java）必须通过 `src/brand/productBrand.ts`、`products/<id>/product.json` 或 Android 资源读取品牌与路径，**禁止在共享源码中硬编码单一产品名称**；切换构建产品（`-Product stronghold | telemetry`）不得弄脏工作区已跟踪文件。

## 3. 跨设备接续同步

- 跨电脑（如家里电脑 ↔ 常用电脑）接续开发时，优先执行 `git pull --ff-only origin main` 并阅读 [docs/HANDOFF.md](docs/HANDOFF.md) 与 `git log -n 10 --oneline` 以恢复最新上下文。
- 完成重要里程碑或准备换机收工时，同步更新 `docs/HANDOFF.md` 中的「当前状态快照」并一并推送到 `origin/main`。
