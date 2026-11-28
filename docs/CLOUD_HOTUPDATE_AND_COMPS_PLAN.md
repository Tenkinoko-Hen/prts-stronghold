# PRTS Stronghold 云端热更新与社区阵容库方案定案（跨设备接续基线）

本文件记录已拍板的 Cloudflare 零绑卡方案、已落地的三层热更新架构，以及待后续开工的「社区阵容库（`04 阵容工坊`）」定案规则，供跨设备（含家里电脑 Antigravity）无缝接续执行。

---

## 1. 云端底座与已就绪资源（方案 A · 选 2：零绑卡 / $0 永久免费额度）

- **架构**：Cloudflare Workers + D1 SQLite + GitHub Release 边缘缓存反代（**严禁把 PRTS 业务塞进现有 AWS `qq-astrbot` 服务器**，该机仅可作为可选审核通知端）。
- **已就绪的 Cloudflare 资源**（不含任何密钥/Token）：
  - Account ID：`9ba31ae41706d09e9de0ce6584ed97e8`
  - Workers 子域：`qingshihen.workers.dev`（100,000 请求/天免费）
  - D1 数据库：`prts-stronghold-db`（Database ID：`d3aac764-0363-4228-a1fb-96b4db217fd6`，5 GB / 500 万行读/天免费）
  - 自定义域名：`arknightsprts.ggff.net`（Free 计划；NS 已全球生效为 `cris.ns.cloudflare.com`、`paityn.ns.cloudflare.com`）
  - 规划绑定自定义域名：
    - `api.arknightsprts.ggff.net` → `prts-stronghold-api` Worker（清单、社区阵容 API、管理接口）
    - `cdn.arknightsprts.ggff.net` → 同一 Worker 的 `/releases/:tag/:filename`（严格白名单反代 `Tenkinoko-Hen/prts-stronghold` GitHub Release 资产并写入 Cloudflare 边缘缓存）

---

## 2. 已落地的三层分级热更新系统（Phase 1 · 已完成代码与实机验收）

### 2.1 核心模块
- [electron/hot-update.cjs](../electron/hot-update.cjs)：纯 Node 零新增依赖热更新引擎，支持：
  - **L1 数据热更**：验签 + SHA-256 校验后免重启即时落盘生效（公告/数据补丁）。
  - **L2 前端 UI 增量覆盖热更**：下载约 **1.7 MB** 增量 ZIP（跳过 `assets/{aegir-guide,aistudio,avatars,boss-routes,community,fonts,strategies}` 静态大资源，[electron/main.cjs](../electron/main.cjs) 的 `prts://` 协议层缺失文件自动回退本地内置 `dist/`），严格校验 `product.json.id`、Ed25519 签名、SHA-256、CRC32、防路径穿越与 30 MiB 体积上限。
  - **A/B 槽位 + 15 秒健康看门狗 + 崩溃自动回滚**：新槽位进入 `pendingUi`，需前端挂载调用 `confirmHealthy()` 才晋升 `stable`；连续 2 次启动失败、15 秒未就绪或 `render-process-gone` 自动秒退至上一稳定槽或内置 `dist/`；外壳升级（`nativeVersion` 变更）自动作废旧热更槽。
  - **L3 原生外壳/Worker 整包提示**：仅提示与校验允许域名并跳转下载，绝不强行打断对局。
- [electron/hot-update-pubkey.cjs](../electron/hot-update-pubkey.cjs)：打包进 ASAR 的 Ed25519 公钥（**私钥仅存在本地仓外 `work/secrets/hot-update-ed25519.pem`，严禁入 Git；换机签发补丁需私下拷贝该私钥文件**）。
- [src/desktop/HotUpdateControl.tsx](../src/desktop/HotUpdateControl.tsx)：已接入 PC 完整版（[src/App.tsx](../src/App.tsx)）、PC 纯净版 Lite（[src/desktop/TelemetryApp.tsx](../src/desktop/TelemetryApp.tsx)）与模拟器抽屉（[src/desktop/MumuDrawerApp.tsx](../src/desktop/MumuDrawerApp.tsx)）。
- [scripts/build-hot-patch.cjs](../scripts/build-hot-patch.cjs)：本地一键把当前 `dist/` 打成增量覆盖 ZIP 并做 Ed25519 签名自验，输出 `.zip` 与 `.manifest.json`。
- [cloudflare/](../cloudflare/)：已包含 `wrangler.toml`、`schema.sql`（含 `releases` 与 Phase 2 `comps`/`comp_votes`/`rate_limits` 建表）、`src/worker.mjs` 与 `worker.test.mjs`。

### 2.2 云端上线状态（2026-11-28 已完成上线与全链路验通 ✅）
1. 已在远端 D1 `prts-stronghold-db` 执行 `schema.sql` 建表（`releases` / `comps` / `comp_votes` / `rate_limits`），写入 Worker Secret `ADMIN_TOKEN` 并完成 `prts-stronghold-api` 线上部署。
2. 已通过 `cloudflare/wrangler.toml` 的 `custom_domain = true` 自动绑定并验通 `https://api.arknightsprts.ggff.net`（`/health`、`/v1/manifest.json`、Bearer 鉴权 `PUT /v1/admin/manifest`）与 `https://cdn.arknightsprts.ggff.net`（GitHub Release 白名单边缘缓存反代）。
3. 已启用生产签名密钥对 `prts-hot-2026-v2`（公钥已同步写入 [electron/hot-update-pubkey.cjs](../electron/hot-update-pubkey.cjs)，私钥存放在家里电脑仓外 `work/secrets/hot-update-ed25519.pem`），并已完成本地 `v2.2.0` PC 双便携包打包与 `1.73 MiB` 签名增量补丁自验。

---

## 3. 社区在线阵容库定案（Phase 2 · 暂未开工，须先过模拟 UI）

用户已拍板的 4 项硬约束（后续开工时必须 100% 遵守）：

1. **入口位置**：PC 完整版顶栏**单独设立 `04 阵容工坊`**（不塞进 `01 战术跟打` 选阵容页）；PC Lite 纯净版严守 A 模式边界，**绝不引入社区阵容库**。
2. **编辑器一期范围（默认精简版）**：
   - 复用 [src/data/strongholdData.ts](../src/data/strongholdData.ts) 的 `MetaCompGuide` 结构（纯 JSON ≤ 32 KB，禁止用户自由传图，全部复用内置干员头像/盟约图标）。
   - 字段涵盖：基础信息（名称/作者昵称/难度/策略家）+ 盟约点选 + 前/中/后期干员点选 + R1–R15 节奏与装备建议 + **从官方阵容一键克隆魔改** + **分享码（Base64/Gzip 或 `.prtscomp.json`）导入导出**。
   - **暂不做 2D 网格逐格摆站位**（留作二期）。
3. **审核与风控规则（先发后审）**：
   - 提交须通过 Schema（≤ 32 KB）+ 官方干员/盟约白名单 + 敏感词过滤，通过即上架；
   - 单 IP / 设备每日**最多上传 10 套**；
   - 被 **3 台独立设备举报** → 标记预警（`warning_flag = 1`，前端展示谨慎提示，可选通知管理员）；
   - 被 **10 台独立设备举报** → **自动下架**（`status = 'hidden'`）；
   - 保留管理员 `ADMIN_TOKEN` 手动下架 / 恢复 / 官方精选置顶接口。
4. **样式前置验收**：正式写社区阵容库业务前，先在本地起 Vite 模拟 UI（使用内置 Mock 数据，涵盖 `04 阵容工坊` 广场页 + 编辑器页 + 与 `01 战术跟打` 联动）供用户实看确认样式后再合入与联调云端 API。

---

## 4. 顺手待补的小优化项（来自群友实机反馈复核）

- ✅ [src/desktop/BattleReportPanels.tsx](../src/desktop/BattleReportPanels.tsx)（已于 2026-11-28 完成并补单测）：当未装 Npcap 导致 `下行 0` 但仍有部分上行 Boss 伤害（`本端上报口径`）时，在首领总览卡片内显式展示 `.d-report-npcap-hint` 提示「当前未检测到 Npcap 下行（仅本端上报口径），队友昵称/头像与部分队友首领伤害可能缺失」。
