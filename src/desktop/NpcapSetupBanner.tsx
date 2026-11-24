// 青逝痕 Tenkinoko 制作
import React from 'react';
import { CheckCircle2, Download, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import type { BattleReportsBridge, NpcapInstallState } from './battleReports';

interface Props {
  api?: BattleReportsBridge;
  npcapInstalled?: boolean;
  installState?: NpcapInstallState;
  compact?: boolean;
}

export function NpcapSetupBanner({ api, npcapInstalled, installState, compact = false }: Props) {
  if (!api?.installNpcap) return null;
  if (npcapInstalled && installState?.status !== 'installed') return null;
  if (npcapInstalled === undefined) return null;

  const busy = installState?.status === 'downloading' || installState?.status === 'installing';
  const done = npcapInstalled && installState?.status === 'installed';
  const errored = installState?.status === 'error';

  return (
    <div className={`d-npcap-banner${compact ? ' is-compact' : ''}${done ? ' is-done' : ''}`} role="status" aria-live="polite">
      <div className="d-npcap-copy">
        <strong>
          {done ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
          {done ? 'Npcap 驱动通道已就绪' : '未检测到 Npcap 驱动'}
        </strong>
        <p className={errored ? 'd-warning' : undefined}>
          {installState?.message
            || '不装 Npcap 仅能采到基础结算；安装官方 Npcap 后可自动热切换，获取开局 Ban 同步、4 人昵称与全队 Boss 伤害。'}
        </p>
      </div>
      {!done && (
        <div className="d-npcap-actions">
          <button
            type="button"
            className="d-button d-primary d-small"
            disabled={busy}
            onClick={() => void api.installNpcap?.()}
          >
            <Download size={13} />
            {installState?.status === 'downloading' ? '正在下载…'
              : installState?.status === 'installing' ? '等待安装完成…'
                : '一键安装 Npcap'}
          </button>
          {api.openNpcapPage && (
            <button
              type="button"
              className="d-button d-small"
              disabled={busy}
              onClick={() => void api.openNpcapPage?.()}
            >
              <ExternalLink size={12} />打开官网
            </button>
          )}
          {api.recheckNpcap && (
            <button
              type="button"
              className="d-button d-small"
              disabled={busy}
              onClick={() => void api.recheckNpcap?.()}
            >
              <RefreshCw size={12} />重新检测
            </button>
          )}
        </div>
      )}
    </div>
  );
}
