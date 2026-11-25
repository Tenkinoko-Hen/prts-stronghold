# 接续工单：曼波配音与宣传视频制作（公司端接续）

## 1. 当前进度与基线

- **仓库**：`Tenkinoko-Hen/prts-stronghold`
- **分支**：`main`
- **最新代码基线**：包含 `84cfd8d`（在前期 `v2.0.1` MuMu 贴边抽屉基础上，已进一步合并全四端与 MuMu 贴边双轨盟约态势、双波同屏预告、双悬浮窗瘦身及 Android Lite 免 Root 采集与 360dp 窄条 HUD）。
- **本轮已完成**：配音选型、试听对比、语速定版、Electron 实机截图 + FFmpeg 双画幅（16:9 / 9:16）硬字幕混流视频流水线均已在家用电脑跑通并验证。
- **当前状态**：**声线与速率已最终敲定，等待用户在公司电脑提出具体视频需求 / 新版分镜文案后再正式开工制作。**
- **家里电脑本地工具目录（未入 Git，仅作对照）**：`J:\PRTS\tts-dubber\`（含 `fish-mambo.mjs`、`dubber.mjs`、`capture-v201-assets.cjs`、`render-v201-videos.cjs`、`.env`、`voices.json` 及试听样音）；视频成片统一放 `release/`（已 `.gitignore`，严禁提交）。

公司电脑拉取最新基线：

```powershell
git pull --ff-only origin main
git status -sb
git log -n 5 --oneline
```

---

## 2. 已最终锁定的配音声线（直接沿用，无需重新试音）

用户在多轮对比（Gemini 3.8 TTS 日V捏声线 / 跨语种日系 JK / Fish Audio 曼波 4 选 1）后，已明确锁定以下方案：

- **TTS 引擎**：**Fish Audio REST API**（`POST https://api.fish.audio/v1/tts`）
- **锁定声线**：**01 · 曼波**（《赛马娘》诗歌剧原味，Fish Audio 社区使用量第 1）
- **模型 `reference_id`**：`0f08cacd3e354471a4b94dd00b4cc4a3`
- **推理模型请求头 (`model`)**：`s2.1-pro-free`（若返回不支持则依次回退 `s2.1-pro`、`s1`、`speech-1.6`）
- **锁定速率**：`prosody.speed = 1.0`（实测约 **5.1 字/秒**，用户明确确认“现在的速率就 OK 了”，无需调快或调慢）
- **音频格式**：`format: "wav"`（带标准 RIFF 头，可直接拼接混流）

### 密钥与安全约定

- **严禁提交任何 `.env` 或 API Key 到 Git**。
- 公司电脑使用时，请由用户提供或自行填入本地环境变量 / 工具目录 `.env`：
  - `FISH_API_KEY`（来源：[Fish Audio API Keys](https://fish.audio/zh-CN/go-api/api-keys)）
  - `FISH_MODEL_ID=0f08cacd3e354471a4b94dd00b4cc4a3`
  - `FISH_SPEED=1.0`
  - `FISH_TTS_MODEL=s2.1-pro-free`

### 零依赖 Node.js 调用模板（公司端 1 分钟可重建）

```javascript
const res = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    "Content-Type": "application/json",
    model: process.env.FISH_TTS_MODEL || "s2.1-pro-free",
  },
  body: JSON.stringify({
    text,
    reference_id: "0f08cacd3e354471a4b94dd00b4cc4a3",
    format: "wav",
    prosody: {
      speed: 1.0,
      volume: 0,
      normalize_loudness: true,
    },
  }),
});
const wavBuffer = Buffer.from(await res.arrayBuffer());
```

> 备注（历史备选，仅在用户主动要求换回时参考）：Fish Audio 其他已测热门曼波备选为 `561fcedfdf0e4e1399d1bc4930d50c0e`（赛马娘曼波欧耶版）、`b255ca2902514f69bc22243436a94e4f`、`eb409eb717f0449b853c49d18fe00ca1`。

---

## 3. 已确认的视频制片偏好与实测避坑清单

### 3.1 用户偏好规格
- **双片组合**：B站横屏 `1920×1080`（全景导览向） + 抖音竖屏 `1080×1920`（痛点爆破向），视觉沿用 **明日方舟 PRTS × 终末地工业风**（`#0B0C0E` 底色、`#FFE600` 终末地黄、`#00E5FF` / `#22D3EE` PRTS 青、思源黑体 `SourceHanSansCN-VF.woff2`）。
- **硬字幕 + 混音**：
  - 底部烧录同步硬字幕（并同步导出 `.srt` 供 B站 CC 字幕上传）；抖音 9:16 硬字幕须排版在底部安全区上方（约 `y = 1585..1735`），避免被抖音昵称与简介遮挡。
  - 保留原版科技感电子 BGM 垫底混音（BGM `volume=0.19` 淡入淡出，人声 `volume=1.18`，`amix=normalize=0`）。
  - 章节间使用 `#FFE600` 竖向激光扫描转场（`xfade=transition=wiperight:duration=0.34` + `drawbox` 扫光条）。

### 3.2 已踩并解决的 5 个关键技术坑（公司 AI 直接复用）
1. **专有名词发音与字幕分离**：TTS 输入文本里将 `MuMu` 写为 `木木模拟器`、`2.0.1` 写为 `二点零点一`（画面硬字幕照常显示 `MuMu 模拟器` / `v2.0.1`），避免读成“缪缪”；避免用“呐呐”（易读作“奶奶”）。
2. **先合成语音、再按实测时长定帧数**：先生成所有镜头的 `.wav` 并计算每镜精确帧数 `Math.round(sec * 30)`，用 FFmpeg `-frames:v` 分段编码后 `-c:v copy` 拼接，确保整片 **0 帧累积漂移** 且语音保持原生 `1.0x` 无变调。
3. **Electron 实机截图防截到启动页**：对 `vite` 演示路由（`/?mumu-demo=coop_elim`、`/?mumu-demo=coop_boss`、`/?lite-demo=coop_boss`、`/?lite-demo=coop_elim&rail=1`、`/?battle-demo`）截屏时，必须轮询等待 `!document.getElementById('app-startup')` 消失后再点击标签截图，并注入完整 `window.electronAPI` mock（覆盖 `windowLayout / battleReports / covenantOcr / hud / lanSync`）以完整呈现 `置顶 / 吸附 / 收起 / 全屏` 等按钮。
4. **Windows 高分屏满屏无留边渲染**：Electron 离屏渲染 `1920×1080` / `1080×1920` 场景图层时，不要直接开超出显示器高度的窗口，也不要用 CDP `Page.captureScreenshot`（在 `offscreen: true` 下易阻塞）。应使用逻辑小窗（16:9 用 `960×540`，9:16 用 `450×800`）+ Electron CLI 参数 `--force-device-scale-factor=2` + 页面内 `document.body.style.transform = scale(innerWidth/DESIGN_W, innerHeight/DESIGN_H)`，配合 `capturePage()` 即可实现 100% 满屏无留边且快速输出。
5. **免全局安装依赖**：在仓库外新建独立临时/工具目录（避免污染 `prts-stronghold` 的 Git 工作区），安装 `ffmpeg-static` 即可完成转码、混音与 MP4 压制；不要改动 `prts-stronghold` 业务源码。

---

## 4. 公司端接续执行步骤

1. 先执行 `git pull --ff-only origin main`，并查阅 `git log -n 10 --oneline` 与 `docs/HANDOFF.md`，确认包含最新功能（如 `84cfd8d` 全四端双轨盟约态势、双波同屏预告、双悬浮窗瘦身、Android Lite 等），避免视频内容停留在旧版。
2. 等待用户给出具体视频需求（目标版本、想重点突出的功能、单片还是双片、是否需要新文案）。
3. 确认公司电脑的 `FISH_API_KEY` 已就绪（优先放于独立于 Git 仓库外的工具目录 `.env`），直接锁定 **01 曼波（`0f08cacd3e354471a4b94dd00b4cc4a3`，`speed=1.0`）** 合成逐镜配音并缓存。
4. 按最新 UI 路由截屏、合成满屏带硬字幕与 20% 电子 BGM 的成片至 `release/`，**交付前务必对成片做逐帧画面与音频听检**（核对无启动页残留、无留边、无字幕截断、无发音错词）。
5. 收尾确认 `git status --short` 干净，不提交任何音频、视频、截图或密钥文件。
