// 青逝痕 Tenkinoko 制作
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderCog,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { StorageChooseRootResult, StorageOverview } from './battleReports';

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function sourceLabel(source: StorageOverview['source']): string {
  switch (source) {
    case 'env':
    case 'pointer-ini':
      return '已记住自定义路径（更新自动继承）';
    case 'portable-ini':
      return '绿色便携模式（同目录自动跟随）';
    case 'auto-exedir':
      return '非 C 盘自动随 EXE 目录';
    default:
      return '旧版默认位置（AppData）';
  }
}

export function StorageManagerPanel({ active = true }: { active?: boolean }) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [pendingTarget, setPendingTarget] = useState<StorageChooseRootResult | null>(null);
  const [migrateReports, setMigrateReports] = useState(true);

  const [selectedResidueIds, setSelectedResidueIds] = useState<string[]>([]);
  const [uninstallArmed, setUninstallArmed] = useState(false);
  const [uninstallIncludeReports, setUninstallIncludeReports] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.getOverview();
      setOverview(next);
      if (next) {
        setSelectedResidueIds(
          next.cDriveResidues
            .filter(item => item.canCleanNow && item.category !== 'reports')
            .map(item => item.id),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取存储信息失败');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (active && api) {
      void refresh();
    }
  }, [active, api, refresh]);

  if (!api) {
    return (
      <div className="d-storage-mgr-empty">
        <AlertTriangle size={16} />
        <div>
          <strong>当前外壳版本尚未内置存储迁移与 C 盘清理接口</strong>
          <p>
            本功能需要原生外壳支持（升级至新原生便携包后自动开启），可实现非 C 盘自动免弹窗落盘、C 盘首次启动弹窗选盘、软件内安全迁移与一键 C 盘残留清理。
            若现在需要清理 C 盘旧缓存，可直接运行配套工具 <code>PRTS-C盘残留与卸载清理.bat</code>。
          </p>
        </div>
      </div>
    );
  }

  const handleChooseTarget = async () => {
    setNotice('');
    setError('');
    setBusy('choose');
    try {
      const res = await api.chooseRoot();
      if (res.canceled) return;
      if (!res.ok) {
        setError(res.error || '所选路径不可用');
        setPendingTarget(null);
        return;
      }
      setPendingTarget(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择目录失败');
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmMigrate = async () => {
    if (!pendingTarget?.normalizedPath) return;
    setNotice('');
    setError('');
    setBusy('migrate');
    try {
      const res = await api.migrateRoot({
        targetDir: pendingTarget.normalizedPath,
        includeReports: migrateReports,
      });
      if (!res.ok) {
        setError(res.error || '启动迁移失败');
        setBusy(null);
        return;
      }
      setNotice(`已启动安全迁移至 ${res.newDataRoot}，软件即将自动退出并在迁移校验完成后重新启动…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动迁移失败');
      setBusy(null);
    }
  };

  const handleClearCache = async () => {
    setNotice('');
    setError('');
    setBusy('cache');
    try {
      const res = await api.clearCache();
      if (res.overview) setOverview(res.overview);
      setNotice(res.freedBytes > 0 ? `已清理浏览器与脚本缓存，释放 ${fmtBytes(res.freedBytes)}。` : '缓存已处于干净状态。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清理缓存失败');
    } finally {
      setBusy(null);
    }
  };

  const handleCleanSelected = async () => {
    if (selectedResidueIds.length === 0) return;
    setNotice('');
    setError('');
    setBusy('clean');
    try {
      const res = await api.cleanCDriveResidues({ ids: selectedResidueIds, uninstallAll: false });
      if (res.overview) {
        setOverview(res.overview);
        setSelectedResidueIds(
          res.overview.cDriveResidues
            .filter(item => item.canCleanNow && item.category !== 'reports')
            .map(item => item.id),
        );
      }
      if (res.failed && res.failed.length > 0) {
        setError(`部分目录仍被占用未能删除：${res.failed.join('、')}`);
      } else {
        setNotice(`已清理 ${res.cleanedCount ?? 0} 项 C 盘残留，释放 ${fmtBytes(res.freedBytes)}。`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '清理 C 盘残留失败');
    } finally {
      setBusy(null);
    }
  };

  const handleUninstallClean = async () => {
    if (!uninstallArmed) {
      setUninstallArmed(true);
      return;
    }
    setNotice('');
    setError('');
    setBusy('uninstall');
    try {
      const res = await api.cleanCDriveResidues({
        uninstallAll: true,
        includeReports: uninstallIncludeReports,
      });
      if (!res.ok) {
        setError(res.error || '启动卸载清理失败');
        setBusy(null);
        return;
      }
      if (res.exiting) {
        setNotice(`正在退出主程序并清理 C 盘全部 ${res.scheduledCount ?? 0} 个 PRTS 相关目录…`);
      } else {
        setNotice('C 盘当前未检测到任何 PRTS 相关残留目录。');
        setUninstallArmed(false);
        setBusy(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '卸载清理失败');
      setBusy(null);
    }
  };

  const toggleResidue = (id: string) => {
    setSelectedResidueIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  return (
    <div className="d-storage-mgr">
      {notice && (
        <div className="d-storage-mgr-banner is-ok" role="status">
          <CheckCircle2 size={14} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="d-storage-mgr-banner is-err" role="alert">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Section 1: Active Data Root & Two-Phase Safe Migration */}
      <section className={`d-panel d-storage-mgr-card${overview?.isOnSystemDrive ? ' is-warn' : ' is-safe'}`}>
        <header className="d-storage-mgr-head">
          <div className="d-storage-mgr-title">
            <HardDrive size={15} />
            <h3>应用数据存储位置与安全迁移</h3>
            {overview && (
              <span className={`d-storage-mgr-pill${overview.isOnSystemDrive ? ' is-warn' : ' is-ok'}`}>
                {overview.isOnSystemDrive ? '当前位于 C 盘 · 建议迁移' : '非 C 盘 · 零 C 盘侵占'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="d-button d-small"
            disabled={loading || busy !== null}
            onClick={() => void refresh()}
          >
            <RefreshCw size={12} className={loading ? 'd-hotupdate-spin' : undefined} />
            <span>刷新统计</span>
          </button>
        </header>

        <div className="d-storage-mgr-path-row">
          <code className="d-storage-mgr-path" title={overview?.effectiveRoot ?? ''}>
            {overview?.effectiveRoot ?? '正在读取存储路径…'}
          </code>
          {overview && <small className="d-storage-mgr-source">{sourceLabel(overview.source)}</small>}
        </div>

        {overview && (
          <div className="d-storage-mgr-kpis">
            <div className="d-storage-mgr-kpi">
              <small>运行解包缓存</small>
              <strong>{fmtBytes(overview.sizes.runtimeCacheBytes)}</strong>
            </div>
            <div className="d-storage-mgr-kpi">
              <small>配置 / 热更 / BGM</small>
              <strong>{fmtBytes(overview.sizes.profileBytes)}</strong>
            </div>
            <div className="d-storage-mgr-kpi">
              <small>历史战报存档</small>
              <strong>{fmtBytes(overview.sizes.reportsBytes)}</strong>
            </div>
            <div className="d-storage-mgr-kpi">
              <small>浏览器缓存</small>
              <strong>{fmtBytes(overview.sizes.browserCacheBytes)}</strong>
            </div>
            <div className="d-storage-mgr-kpi">
              <small>C 盘当前可用</small>
              <strong>{fmtBytes(overview.freeBytesOnCDrive)}</strong>
            </div>
          </div>
        )}

        <p className="d-storage-mgr-hint">
          <ShieldCheck size={13} />
          <span>
            更改路径采用<strong>退出后先复制、再校验、最后切换指针并清理旧目录</strong>的两阶段原子迁移，不会因 Chromium 文件锁损坏 BGM 音频或配置；后续覆盖新版 EXE 将自动沿用新路径。
          </span>
        </p>

        <div className="d-storage-mgr-actions">
          <button
            type="button"
            className="d-button d-primary d-small"
            disabled={busy !== null}
            onClick={() => void handleChooseTarget()}
          >
            <FolderCog size={13} />
            <span>{busy === 'choose' ? '选择中…' : '更改存储路径并迁移…'}</span>
          </button>
          <button
            type="button"
            className="d-button d-small"
            disabled={busy !== null || !overview}
            onClick={() => void api.openDir(overview?.effectiveRoot)}
          >
            <FolderOpen size={13} />
            <span>打开数据目录</span>
          </button>
          <button
            type="button"
            className="d-button d-small"
            disabled={busy !== null || !overview}
            onClick={() => void handleClearCache()}
          >
            <Sparkles size={13} />
            <span>{busy === 'cache' ? '清理中…' : '清理浏览器缓存'}</span>
          </button>
        </div>

        {pendingTarget?.ok && pendingTarget.normalizedPath && (
          <div className="d-storage-mgr-confirm">
            <div className="d-storage-mgr-confirm-head">
              <strong>待确认迁移目标：</strong>
              <code>{pendingTarget.normalizedPath}</code>
              {pendingTarget.freeBytes != null && (
                <small>目标盘剩余 {fmtBytes(pendingTarget.freeBytes)}</small>
              )}
            </div>
            {pendingTarget.warning && (
              <p className="d-storage-mgr-warn-line">
                <AlertTriangle size={12} />
                <span>{pendingTarget.warning}</span>
              </p>
            )}
            <label className="d-storage-mgr-check">
              <input
                type="checkbox"
                checked={migrateReports}
                onChange={e => setMigrateReports(e.target.checked)}
              />
              <span>同步迁移历史战报到新目录下（取消勾选则保留当前战报路径）</span>
            </label>
            <div className="d-storage-mgr-actions">
              <button
                type="button"
                className="d-button d-primary d-small"
                disabled={busy !== null}
                onClick={() => void handleConfirmMigrate()}
              >
                <FolderCog size={13} />
                <span>{busy === 'migrate' ? '正在启动迁移…' : '确认迁移并自动重启'}</span>
              </button>
              <button
                type="button"
                className="d-button d-small"
                disabled={busy !== null}
                onClick={() => setPendingTarget(null)}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: C-Drive Residue & Uninstall Cleanup Tool */}
      <section className="d-panel d-storage-mgr-card">
        <header className="d-storage-mgr-head">
          <div className="d-storage-mgr-title">
            <Trash2 size={15} />
            <h3>C 盘残留与卸载清理工具</h3>
            {overview && (
              <span className={`d-storage-mgr-pill${overview.cDriveTotalBytes > 0 ? ' is-warn' : ' is-ok'}`}>
                {overview.cDriveTotalBytes > 0
                  ? `检测到 C 盘占用 ${fmtBytes(overview.cDriveTotalBytes)}`
                  : 'C 盘无残留（0 B）'}
              </span>
            )}
          </div>
        </header>

        {overview && overview.cDriveResidues.length === 0 ? (
          <div className="d-storage-mgr-clean-ok">
            <CheckCircle2 size={15} />
            <span>未在 C 盘发现任何 PRTS 运行缓存、旧配置或热更残留文件。</span>
          </div>
        ) : (
          <div className="d-storage-mgr-list">
            {(overview?.cDriveResidues ?? []).map(item => {
              const checked = selectedResidueIds.includes(item.id);
              return (
                <label key={item.id} className={`d-storage-mgr-row${item.isActive ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    disabled={!item.canCleanNow || busy !== null}
                    checked={checked}
                    onChange={() => toggleResidue(item.id)}
                  />
                  <div className="d-storage-mgr-row-info">
                    <div className="d-storage-mgr-row-top">
                      <strong>{item.label}</strong>
                      <span className={`d-storage-mgr-tag${item.isActive ? ' is-lock' : item.category === 'pointer' ? ' is-ptr' : ' is-free'}`}>
                        {item.isActive ? '当前使用中（需迁移或退出后清理）' : item.category === 'pointer' ? '仅彻底卸载清理' : '可立即安全清理'}
                      </span>
                    </div>
                    <code title={item.path}>{item.path}</code>
                    <small>{item.description}</small>
                  </div>
                  <b className="d-storage-mgr-row-size">{fmtBytes(item.bytes)}</b>
                </label>
              );
            })}
          </div>
        )}

        <div className="d-storage-mgr-uninstall-box">
          <div className="d-storage-mgr-actions">
            <button
              type="button"
              className="d-button d-primary d-small"
              disabled={busy !== null || selectedResidueIds.length === 0}
              onClick={() => void handleCleanSelected()}
            >
              <Trash2 size={13} />
              <span>
                {busy === 'clean'
                  ? '清理中…'
                  : `清理已选 C 盘残留（${selectedResidueIds.length} 项）`}
              </span>
            </button>

            <button
              type="button"
              className={`d-button d-small d-hotupdate-rollback${uninstallArmed ? ' is-armed' : ''}`}
              disabled={busy !== null || !overview || overview.cDriveResidues.length === 0}
              onClick={() => void handleUninstallClean()}
            >
              <Trash2 size={13} />
              <span>
                {busy === 'uninstall'
                  ? '正在退出并清理…'
                  : uninstallArmed
                    ? '再次点击确认：退出并清空 C 盘全部 PRTS 文件'
                    : '彻底卸载清理（退出并清空 C 盘全部相关文件）'}
              </span>
            </button>

            {uninstallArmed && (
              <button
                type="button"
                className="d-button d-small"
                disabled={busy !== null}
                onClick={() => setUninstallArmed(false)}
              >
                取消
              </button>
            )}
          </div>

          {uninstallArmed && (
            <label className="d-storage-mgr-check is-danger">
              <input
                type="checkbox"
                checked={uninstallIncludeReports}
                onChange={e => setUninstallIncludeReports(e.target.checked)}
              />
              <span>同时删除「我的文档」中的历史战报（默认不勾选，以防误删对局记录）</span>
            </label>
          )}
        </div>
      </section>
    </div>
  );
}
