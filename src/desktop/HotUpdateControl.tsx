// 青逝痕 Tenkinoko 制作
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Megaphone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { PRODUCT_BRAND } from '../brand/productBrand';
import { DesktopDialog } from './DesktopDialog';
import type { HotUpdatePatchInfo, HotUpdateState } from './battleReports';

export interface HotUpdateControlProps {
  variant?: 'desktop' | 'lite' | 'compact';
}

const dateTimeFmt = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCheckedAt(iso: string | null): string {
  if (!iso) return '尚未检查';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '尚未检查';
  return dateTimeFmt.format(parsed);
}

function activeKindLabel(kind: HotUpdateState['activeKind']): string {
  if (kind === 'stable') return '热更已生效';
  if (kind === 'pending') return '待确认';
  return '内置';
}

function statusLabel(status: HotUpdateState['status']): string {
  switch (status) {
    case 'checking':
      return '检查更新中';
    case 'up-to-date':
      return '已是最新版本';
    case 'available':
      return '发现可用更新';
    case 'downloading':
      return '正在下载补丁';
    case 'ready-to-restart':
      return '待重启生效';
    case 'error':
      return '检查/下载异常';
    default:
      return '就绪';
  }
}

export function HotUpdateControl({ variant = 'desktop' }: HotUpdateControlProps) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.hotUpdate : undefined;
  const [state, setState] = useState<HotUpdateState | null>(null);
  const [open, setOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<'check' | 'download' | 'restart' | 'rollback' | 'native' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastPatchRef = useRef<HotUpdatePatchInfo | null>(null);

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    const applyState = (next: HotUpdateState | null | undefined) => {
      if (!mounted || !next) return;
      if (next.availableUi) {
        lastPatchRef.current = next.availableUi;
      }
      setState(next);
    };
    const unsubscribe = api.onState(applyState);
    void api
      .confirmHealthy()
      .then(applyState)
      .catch(() => api.getState().then(applyState).catch(() => {}));
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [api]);

  if (!api || !state) return null;

  const isReady = Boolean(state.status === 'ready-to-restart' || state.stagedUiVersion);
  const isDownloading = state.status === 'downloading';
  const isChecking = state.status === 'checking';
  const hasActionableUpdate = Boolean(isReady || isDownloading || state.availableUi || state.nativeUpdate);

  if (variant === 'compact' && !hasActionableUpdate && !open) {
    return null;
  }

  const runAction = async (
    action: 'check' | 'download' | 'restart' | 'rollback' | 'native',
    fn: () => Promise<HotUpdateState | boolean | void>,
  ) => {
    if (busyAction !== null) return;
    setBusyAction(action);
    setLocalError(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'uiVersion' in result) {
        if (result.availableUi) {
          lastPatchRef.current = result.availableUi;
        }
        setState(result);
      }
    } catch (err) {
      setLocalError(err instanceof Error && err.message ? err.message : '更新操作失败，请稍后重试');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTriggerClick = () => {
    setLocalError(null);
    setOpen(true);
    if (!hasActionableUpdate && !isChecking && !isDownloading && state.status !== 'error') {
      void runAction('check', () => api.check());
    }
  };

  const iconSize = variant === 'compact' ? 11 : 12;
  let triggerText = `v${state.uiVersion}`;
  let triggerTitle = '检查热更新与版本信息';
  let TriggerIcon: typeof RefreshCw | null = isChecking ? RefreshCw : null;

  if (isReady) {
    triggerText = '重启更新';
    triggerTitle = `前端热更新 v${state.stagedUiVersion ?? state.uiVersion} 已就绪，点击查看或重启应用`;
    TriggerIcon = RefreshCw;
  } else if (isDownloading) {
    triggerText = variant === 'compact' ? `${state.downloadProgress}%` : `更新中 ${state.downloadProgress}%`;
    triggerTitle = `正在下载前端热更新 (${state.downloadProgress}%)`;
    TriggerIcon = Download;
  } else if (state.availableUi) {
    triggerText = variant === 'compact' ? '热更新' : `热更新 ${formatSize(state.availableUi.size)}`;
    triggerTitle = `发现可用前端热更新 v${state.availableUi.version} (${formatSize(state.availableUi.size)})`;
    TriggerIcon = Download;
  } else if (state.nativeUpdate) {
    triggerText = variant === 'compact' ? '新版' : `新版 v${state.nativeUpdate.version}`;
    triggerTitle = `发现新版客户端外壳 v${state.nativeUpdate.version}`;
    TriggerIcon = ArrowUpCircle;
  }

  const triggerClassName = [
    'd-hotupdate-btn',
    variant === 'compact' ? 'is-compact' : variant === 'lite' ? 'is-lite' : '',
    isReady ? 'is-ready' : hasActionableUpdate ? 'is-available' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const patchVersion = state.stagedUiVersion ?? state.availableUi?.version ?? '';
  const patchMeta =
    state.availableUi
    ?? (state.stagedUiVersion && lastPatchRef.current?.version === state.stagedUiVersion ? lastPatchRef.current : null);
  const effectiveError = localError || state.error;
  const rollbackMessage = state.lastRollbackReason === 'manual-rollback'
    ? '已手动回退到内置稳定版本，可随时重新检查更新'
    : '上次热更新启动异常，已自动回退到稳定版本';

  return (
    <>
      <button
        type="button"
        data-testid="hot-update-trigger"
        className={triggerClassName}
        title={triggerTitle}
        onClick={handleTriggerClick}
      >
        {TriggerIcon && <TriggerIcon size={iconSize} className={isChecking ? 'd-hotupdate-spin' : undefined} />}
        <span>{triggerText}</span>
      </button>

      {open && (
        <DesktopDialog title="版本与热更新" onClose={() => setOpen(false)}>
          <div className="d-hotupdate-body">
            <p className="d-hotupdate-subtitle">
              {PRODUCT_BRAND.shortName} 客户端增量热更新与版本护航（对局期间不主动打断，可随时延后应用）
            </p>

            {state.announcement && (
              <div className="d-hotupdate-notice is-info" role="status">
                <Megaphone size={14} />
                <span>{state.announcement}</span>
              </div>
            )}

            {state.lastRollbackReason && (
              <div className="d-hotupdate-notice is-safe" role="status">
                <ShieldCheck size={14} />
                <span>{rollbackMessage}</span>
              </div>
            )}

            {effectiveError && (
              <div className="d-hotupdate-notice is-error" role="alert">
                <AlertTriangle size={14} />
                <span>{effectiveError}</span>
              </div>
            )}

            <div className="d-hotupdate-meta">
              <div className="d-hotupdate-meta-cell">
                <span className="d-hotupdate-meta-label">当前外壳版本</span>
                <strong className="d-hotupdate-meta-val">v{state.nativeVersion}</strong>
              </div>
              <div className="d-hotupdate-meta-cell">
                <span className="d-hotupdate-meta-label">当前前端版本</span>
                <strong className="d-hotupdate-meta-val">
                  <span>v{state.uiVersion}</span>
                  <em className={`d-hotupdate-kind is-${state.activeKind}`}>{activeKindLabel(state.activeKind)}</em>
                </strong>
              </div>
              <div className="d-hotupdate-meta-cell">
                <span className="d-hotupdate-meta-label">最近检查时间</span>
                <strong className="d-hotupdate-meta-val">
                  <span>{formatCheckedAt(state.lastCheckedAt)}</span>
                  <small className="d-hotupdate-status-tag">{statusLabel(state.status)}</small>
                </strong>
              </div>
            </div>

            {(state.availableUi || state.stagedUiVersion) && (
              <section className="d-hotupdate-card" aria-label="前端热更新补丁">
                <header className="d-hotupdate-card-head">
                  <strong>
                    {isReady
                      ? `热更新已就绪 · v${patchVersion}`
                      : isDownloading
                        ? `正在下载热更新 · v${patchVersion}`
                        : `发现可用热更新 · v${patchVersion}`}
                  </strong>
                  {patchMeta && <span className="d-hotupdate-size">{formatSize(patchMeta.size)}</span>}
                </header>

                <p className="d-hotupdate-notes">
                  {patchMeta?.notes || (isReady
                    ? '热更新包已通过校验并写入隔离槽位，将在重启应用后生效；若启动异常将自动回退。'
                    : '包含前端界面与数据功能增量更新，无需重新安装客户端外壳。')}
                </p>

                {isDownloading && (
                  <div className="d-hotupdate-progress-row">
                    <div
                      className="d-hotupdate-progress"
                      role="progressbar"
                      aria-label="热更新下载进度"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={state.downloadProgress}
                    >
                      <div
                        className="d-hotupdate-progress-bar"
                        style={{ width: `${Math.max(0, Math.min(100, state.downloadProgress))}%` }}
                      />
                    </div>
                    <span className="d-hotupdate-progress-val">{state.downloadProgress}%</span>
                  </div>
                )}

                <div className="d-hotupdate-shields" aria-label="安全保护机制">
                  <span className="d-hotupdate-shield"><ShieldCheck size={12} />Ed25519 验签</span>
                  <span className="d-hotupdate-shield"><ShieldCheck size={12} />外壳兼容校验</span>
                  <span className="d-hotupdate-shield"><ShieldCheck size={12} />崩溃自动回滚</span>
                </div>
              </section>
            )}

            {state.nativeUpdate && (
              <section className="d-hotupdate-card is-native" aria-label="客户端外壳更新">
                <header className="d-hotupdate-card-head">
                  <strong>发现新版客户端整包 · v{state.nativeUpdate.version}</strong>
                  {state.nativeUpdate.size ? (
                    <span className="d-hotupdate-size">{formatSize(state.nativeUpdate.size)}</span>
                  ) : null}
                </header>
                <p className="d-hotupdate-notes">
                  {state.nativeUpdate.notes || '此更新包含原生内核或采集组件升级，请前往下载新版安装包完成覆盖安装。'}
                </p>
              </section>
            )}

            {!state.availableUi && !state.stagedUiVersion && !state.nativeUpdate && state.status === 'up-to-date' && (
              <div className="d-hotupdate-notice is-safe" role="status">
                <CheckCircle2 size={14} />
                <span>当前 {PRODUCT_BRAND.shortName} 已是最新版本，无需额外更新。</span>
              </div>
            )}

            <div className="d-hotupdate-actions">
              {isReady ? (
                <>
                  <button
                    type="button"
                    className="d-button d-primary"
                    disabled={busyAction !== null}
                    onClick={() => void runAction('restart', () => api.applyRestart())}
                  >
                    <RefreshCw size={13} />
                    <span>立即应用并重启</span>
                  </button>
                  <button type="button" className="d-button" onClick={() => setOpen(false)}>
                    本局打完再更
                  </button>
                </>
              ) : state.availableUi ? (
                <>
                  <button
                    type="button"
                    className="d-button d-primary"
                    disabled={isDownloading || busyAction !== null}
                    onClick={() => void runAction('download', () => api.downloadUi())}
                  >
                    <Download size={13} />
                    <span>{isDownloading ? `下载中 ${state.downloadProgress}%` : '下载热更新'}</span>
                  </button>
                  <button type="button" className="d-button" onClick={() => setOpen(false)}>
                    稍后再说
                  </button>
                </>
              ) : null}

              {state.nativeUpdate && (
                <button
                  type="button"
                  className={isReady || state.availableUi ? 'd-button' : 'd-button d-primary'}
                  disabled={busyAction !== null}
                  onClick={() => void runAction('native', () => api.openNativeDownload())}
                >
                  <ExternalLink size={13} />
                  <span>前往下载新版</span>
                </button>
              )}

              <div className="d-hotupdate-actions-tail">
                <button
                  type="button"
                  className="d-button"
                  disabled={isChecking || isDownloading || busyAction !== null}
                  onClick={() => void runAction('check', () => api.check())}
                >
                  <RefreshCw size={13} className={isChecking ? 'd-hotupdate-spin' : undefined} />
                  <span>{isChecking ? '检查中…' : '检查更新'}</span>
                </button>

                {state.activeKind !== 'builtin' && (
                  <button
                    type="button"
                    className="d-button d-hotupdate-rollback"
                    disabled={isDownloading || busyAction !== null}
                    onClick={() => void runAction('rollback', () => api.rollback())}
                  >
                    <RotateCcw size={13} />
                    <span>回退内置版本</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </DesktopDialog>
      )}
    </>
  );
}
