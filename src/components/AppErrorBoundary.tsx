// 青逝痕 Tenkinoko 制作
import React from 'react';

interface Props {
  children: React.ReactNode;
  compact?: boolean;
}

interface State {
  error: Error | null;
  autoRetried: boolean;
}

function clearCorruptedLocalState() {
  try {
    const keepFavs = localStorage.getItem('prts_mobile_favorites_v1');
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('prts_') || k.startsWith('prts:'))) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
    if (keepFavs) {
      try {
        if (Array.isArray(JSON.parse(keepFavs))) {
          localStorage.setItem('prts_mobile_favorites_v1', keepFavs);
        }
      } catch {
        // ignore corrupted favorites
      }
    }
  } catch {
    // ignore storage access errors
  }
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, autoRetried: false };
  private retryTimer: number | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[PRTS Fault Guard] Caught render error:', error);
    // 首次瞬态渲染异常自动尝试无感自愈一次
    if (!this.state.autoRetried) {
      this.retryTimer = window.setTimeout(() => {
        this.setState({ error: null, autoRetried: true });
      }, 180);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleResetAndReload = () => {
    clearCorruptedLocalState();
    window.location.reload();
  };

  private handleRelaunchDesktop = () => {
    const api = (window as unknown as { electronAPI?: { relaunchApp?: () => Promise<void> } }).electronAPI;
    if (api?.relaunchApp) {
      void api.relaunchApp();
    } else {
      this.handleResetAndReload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.compact) {
      return (
        <div
          role="alert"
          style={{
            height: '100vh',
            boxSizing: 'border-box',
            padding: '8px 10px',
            background: 'rgba(18, 12, 14, 0.96)',
            border: '1px solid #ff4d4f',
            color: '#f1f5f9',
            fontFamily: 'system-ui, "Microsoft YaHei UI", sans-serif',
            fontSize: '11px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <strong style={{ color: '#fca5a5' }}>悬浮条遇到显示异常（游戏运行不受影响）</strong>
            <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {error.message || '渲染状态异常'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{ padding: '2px 8px', background: '#ffe600', color: '#0b0d11', border: 'none', borderRadius: '2px', fontWeight: 700, fontSize: '10.5px', cursor: 'pointer' }}
            >
              立即恢复
            </button>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              style={{ padding: '2px 8px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', fontSize: '10.5px', cursor: 'pointer' }}
            >
              清理缓存重载
            </button>
          </div>
        </div>
      );
    }

    const hasDesktopRelaunch = Boolean(
      (window as unknown as { electronAPI?: { relaunchApp?: () => Promise<void> } }).electronAPI?.relaunchApp,
    );

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          boxSizing: 'border-box',
          padding: '24px 18px',
          background: '#090c11',
          color: '#f1f5f9',
          fontFamily: 'system-ui, "Microsoft YaHei UI", sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <section
          style={{
            maxWidth: '460px',
            width: '100%',
            background: '#111620',
            border: '1px solid #2b3648',
            borderLeft: '3px solid #ffe600',
            borderRadius: '4px',
            padding: '16px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ background: '#ffe600', color: '#0b0d11', fontWeight: 800, fontSize: '11px', padding: '1px 6px', borderRadius: '2px' }}>
              PRTS 守护
            </span>
            <strong style={{ fontSize: '15px' }}>界面遇到异常已自动拦截</strong>
          </div>
          <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 10px' }}>
            《明日方舟》游戏本体与网络连接<strong>完全不受影响</strong>。你可以点击下方按钮立即恢复界面；若因旧版缓存数据不兼容导致重复报错，可一键清理缓存重载（收藏阵容会保留）。
          </p>
          <div
            style={{
              padding: '6px 8px',
              background: '#0b0f16',
              border: '1px solid #1e293b',
              borderRadius: '2px',
              color: '#94a3b8',
              fontFamily: 'Consolas, monospace',
              fontSize: '11px',
              marginBottom: '12px',
              wordBreak: 'break-word',
            }}
          >
            原因：{error.message || '未知界面异常'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{ padding: '7px 14px', background: '#ffe600', color: '#0b0d11', border: 'none', borderRadius: '2px', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}
            >
              立即恢复界面
            </button>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              style={{ padding: '7px 12px', background: '#17202e', color: '#e2e8f0', border: '1px solid #2f3d52', borderRadius: '2px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              清理损坏缓存并重载
            </button>
            {hasDesktopRelaunch && (
              <button
                type="button"
                onClick={this.handleRelaunchDesktop}
                style={{ padding: '7px 12px', background: '#0f222c', color: '#67e8f9', border: '1px solid #00e5ff66', borderRadius: '2px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
              >
                重启终端进程
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }
}
