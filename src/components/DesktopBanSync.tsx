// 青逝痕 Tenkinoko 制作
import React from 'react';
import { ClipboardPaste, Radio, RefreshCw, ScanLine } from 'lucide-react';
import type { BattleBanSyncState } from '../desktop/battleBanSync';
import { NpcapSetupBanner } from '../desktop/NpcapSetupBanner';

interface Props {
  sync: BattleBanSyncState;
  currentBanned: string[];
  onResync(): void;
  onScanWindow?(): void;
  onScanClipboard?(): void;
}

const STATUS_HINT: Record<string, string> = {
  web: '网页预览模式：直接点选下方盟约标签筛选本局阵容。',
  starting: '正在连接本地采集与开局画面识别服务…',
  waiting: '等待明日方舟启动：开局「确认本局信息」阶段将自动 OCR 识别禁选，进局后再由协议核验。',
  connecting: '游戏已启动：在「1/3 确认本局信息」界面会自动识别禁选，也可随时点下方按钮立即识别。',
  permission: '实时协议采集需管理员权限；当前仍可使用开局画面 OCR 自动/手动识别禁选。',
  paused: '实时采集已暂停，可使用画面 OCR 识别或手动点选本局 Ban 盟约。',
  unavailable: '当前网络暂未采到对局流，可使用画面 OCR 识别或手动点选。',
  incompatible: '当前对局协议暂未识别，可使用画面 OCR 识别或手动点选。',
  failed: '本地战报服务未启动，仍可使用画面 OCR 识别或直接在下方手动点选。',
};

export function DesktopBanSync({ sync, currentBanned, onResync, onScanWindow, onScanClipboard }: Props) {
  const synced = sync.bannedCovenants.length > 0 || sync.syncSource === 'ocr';
  const sameAsSynced = synced
    && currentBanned.length === sync.bannedCovenants.length
    && sync.bannedCovenants.every(name => currentBanned.includes(name));
  const scanning = sync.ocrStatus === 'scanning';

  let message = STATUS_HINT[sync.status] ?? '进入对局开局界面后将自动读取本局 Ban 盟约，也可手动点选。';
  if (scanning && sync.ocrMessage) {
    message = sync.ocrMessage;
  } else if (sync.ocrStatus === 'error' && sync.ocrMessage && !synced) {
    message = sync.ocrMessage;
  } else if (sync.syncSource === 'packet' && sync.bannedCovenants.length > 0) {
    message = `已从实时对局协议同步 ${sync.bannedCovenants.length} 项受限盟约（${sync.bannedCovenants.join('、')}）。`;
  } else if (sync.syncSource === 'ocr' && sync.ocrMessage) {
    message = sync.ocrMessage;
  } else if (sync.status === 'listening') {
    if (sync.matchKey && !sync.hasDownlink) {
      message = '已连上对局但未收到下行场景；可点下方「OCR 识别画面」兜底读取禁选，或安装 Npcap 获取完整协议。';
    } else {
      message = '本地守护中：打开「1/3 确认本局信息」将自动 OCR 读取禁选（置顶不遮挡游戏窗口），进局后自动协议复核。';
    }
  }

  const toneClass = sync.ocrStatus === 'error' && !synced
    ? 'd-warning'
    : synced
      ? (sync.syncSource === 'ocr' && !sync.ocrComplete ? 'd-warning' : 'd-success')
      : sync.status === 'permission' ? 'd-warning' : undefined;

  return (
    <section className="d-scan" aria-label="对局盟约自动同步与OCR兜底">
      <div className="d-scan-status" aria-live="polite">
        <p className={toneClass}>
          <Radio size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
          {message}
        </p>
        <div className="d-inline" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {sync.ocrAvailable && onScanWindow && (
            <button
              type="button"
              className="d-button d-small"
              disabled={scanning}
              onClick={onScanWindow}
              title="直接截取明日方舟窗口识别「1/3 确认本局信息」禁选（快捷键 Ctrl+Shift+F8）"
            >
              <ScanLine size={12} />{scanning ? '识别中…' : 'OCR 识别画面'}
            </button>
          )}
          {sync.ocrAvailable && onScanClipboard && (
            <button
              type="button"
              className="d-button d-small"
              disabled={scanning}
              onClick={onScanClipboard}
              title="从剪贴板粘贴截图识别盟约禁选"
            >
              <ClipboardPaste size={12} />粘贴截图
            </button>
          )}
          {synced && !sameAsSynced && (
            <button type="button" className="d-button d-small" onClick={onResync}>
              <RefreshCw size={12} />恢复自动识别结果
            </button>
          )}
        </div>
      </div>
      <NpcapSetupBanner
        api={window.electronAPI?.battleReports}
        npcapInstalled={sync.npcapInstalled}
        installState={sync.npcapInstall}
        compact
      />
    </section>
  );
}
