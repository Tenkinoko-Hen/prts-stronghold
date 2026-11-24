import React from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import type { BattleBanSyncState } from '../desktop/battleBanSync';

interface Props {
  sync: BattleBanSyncState;
  currentBanned: string[];
  onResync(): void;
}

const STATUS_HINT: Record<string, string> = {
  web: '网页预览模式：直接点选下方盟约标签筛选本局阵容。',
  starting: '正在连接本地抓包服务…',
  waiting: '等待 Windows 版明日方舟启动，开局后自动同步本局 Ban 盟约。',
  connecting: '游戏已启动，进入对局后自动同步本局 Ban 盟约。',
  permission: '需要以管理员身份运行才能自动抓包同步，也可直接在下方手动点选。',
  paused: '本地采集已暂停，可在下方手动点选本局 Ban 盟约。',
  unavailable: '当前网络暂未采集到对局数据，可在下方手动点选。',
  incompatible: '当前对局协议暂未识别，可在下方手动点选。',
  failed: '本地抓包服务未启动，请重启应用，或直接在下方手动点选。',
};

export function DesktopBanSync({ sync, currentBanned, onResync }: Props) {
  const synced = sync.bannedCovenants.length > 0;
  const sameAsSynced = synced
    && currentBanned.length === sync.bannedCovenants.length
    && sync.bannedCovenants.every(name => currentBanned.includes(name));

  let message = STATUS_HINT[sync.status] ?? '进入对局后将自动同步本局 Ban 盟约，也可在下方手动点选。';
  if (sync.status === 'listening') {
    if (synced) {
      message = `已从实时对局自动同步 ${sync.bannedCovenants.length} 项受限盟约（${sync.bannedCovenants.join('、')}）。`;
    } else if (sync.matchKey && !sync.hasDownlink) {
      message = '已连上对局但未收到服务端开局下行场景（安装 Npcap 后以管理员重启即可自动同步 Ban 与 Boss 伤害）；当前请直接在下方手动点选。';
    } else {
      message = '本地采集中：进入对局开局界面后自动读取本局 Ban 盟约，也可下方手动点选。';
    }
  }

  return (
    <section className="d-scan" aria-label="对局盟约自动同步">
      <div className="d-scan-status" aria-live="polite">
        <p className={synced ? 'd-success' : sync.status === 'permission' ? 'd-warning' : undefined}>
          <Radio size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
          {message}
        </p>
        {synced && !sameAsSynced && (
          <button type="button" className="d-button d-small" onClick={onResync}>
            <RefreshCw size={12} />恢复为本局自动同步结果
          </button>
        )}
      </div>
    </section>
  );
}
