import { useState } from 'react';
import { Check, Copy, RefreshCw, Smartphone, Wifi } from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { DesktopDialog } from './DesktopDialog';
import type { LanSyncBridge, LanSyncState } from './battleReports';

export function LanSyncDialog({
  open,
  state,
  api,
  onClose,
}: {
  open: boolean;
  state: LanSyncState;
  api: LanSyncBridge;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  if (!open) return null;

  const primaryHost = state.addresses[0] ? `${state.addresses[0]}:${state.port}` : `127.0.0.1:${state.port}`;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.setEnabled(!state.enabled);
    } finally {
      setBusy(false);
    }
  };

  const refreshPin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.refreshPin();
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };

  return (
    <DesktopDialog open={open} title="无线战术副屏 · PC ↔ 安卓局域网直连" onClose={onClose}>
      <div style={{ display: 'grid', gap: '12px', fontSize: '13px', maxWidth: '520px' }}>
        <p className="d-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          免 Root 将手机或平板变为 {PRODUCT_BRAND.shortName} 实体战术副屏：电脑全屏打游戏无需切窗，手机实时镜像开局 Ban、自动跟打回合、同步干员算力榜，并支持战报一键存入手机相册。数据仅在家庭/内网 Wi-Fi 传输，绝不出公网。
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '10px 12px',
            border: '1px solid #272e38',
            borderLeft: `3px solid ${state.enabled ? '#34d399' : '#64748b'}`,
            background: '#11151c',
            borderRadius: '2px',
          }}
        >
          <div>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f1f5f9' }}>
              <Wifi size={15} />
              {state.enabled ? `局域网广播运行中（已连 ${state.peerCount} 台设备）` : '局域网广播未开启'}
            </strong>
            <small className="d-muted">
              {state.enabled ? '手机与电脑连接同一 Wi-Fi 后输入下方地址与 4 位配对码' : '点击右侧开启本机内网配对通道'}
            </small>
          </div>
          <button
            type="button"
            className={`d-button${state.enabled ? '' : ' d-primary'}`}
            disabled={busy}
            onClick={() => void toggle()}
          >
            {state.enabled ? '停止广播' : '开启无线副屏'}
          </button>
        </div>

        {state.error && <p className="d-warning" style={{ margin: 0 }}>{state.error}</p>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '10px',
            padding: '12px',
            border: '1px solid #272e38',
            background: '#0d1117',
            borderRadius: '2px',
          }}
        >
          <div style={{ display: 'grid', gap: '6px' }}>
            <span className="d-muted" style={{ fontSize: '11.5px' }}>本机内网地址（任选其一填入手机端）</span>
            {state.addresses.length > 0 ? (
              state.addresses.map(ip => {
                const target = `${ip}:${state.port}`;
                return (
                  <div key={ip} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ fontSize: '14px', fontWeight: 700, color: '#00e5ff' }}>{target}</code>
                    <button
                      type="button"
                      className="d-button d-small"
                      onClick={() => void copyText(target, target)}
                    >
                      {copied === target ? <Check size={12} /> : <Copy size={12} />}
                      {copied === target ? '已复制' : '复制'}
                    </button>
                  </div>
                );
              })
            ) : (
              <span className="d-muted">未检测到局域网 IPv4，请检查 Wi-Fi / 以太网连接</span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              justifyItems: 'center',
              alignContent: 'center',
              gap: '4px',
              padding: '8px 14px',
              border: '1px solid rgba(255,230,0,0.4)',
              background: 'rgba(255,230,0,0.08)',
              borderRadius: '2px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#cbd5e1' }}>4 位安全配对码</span>
            <strong
              style={{
                fontSize: '22px',
                letterSpacing: '0.18em',
                fontFamily: 'var(--font-mono)',
                color: '#ffe600',
              }}
            >
              {state.pin}
            </strong>
            <button type="button" className="d-button d-small" disabled={busy} onClick={() => void refreshPin()}>
              <RefreshCw size={11} />换码
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
          <span className="d-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Smartphone size={14} />
            在手机端打开「无线副屏同步」填入 <code>{primaryHost}</code> 与配对码 <code>{state.pin}</code>
          </span>
        </div>
      </div>
    </DesktopDialog>
  );
}
