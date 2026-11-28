// 青逝痕 Tenkinoko 制作
import { useState } from 'react';
import { FolderCog, FolderOpen, HardDrive, RotateCcw, Trash2 } from 'lucide-react';
import { DesktopDialog } from './DesktopDialog';
import type { ReportRecord } from './battleReports';
import type { ReportStorageController } from './useReportPersistence';

const dateFmt = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

export function ReportStorageButton({
  storage,
  history,
  onSelect,
  compact = false,
}: {
  storage: ReportStorageController;
  history: ReportRecord[];
  onSelect?(key: string): void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = storage.config?.count ?? history.length;

  return (
    <>
      <button
        type="button"
        className={compact ? 'lite-tool-btn d-storage-trigger' : 'd-button d-small d-storage-trigger'}
        title={storage.config ? `本地战报保存路径：${storage.config.dir}` : '本地战报持久化与路径设置'}
        onClick={() => setOpen(true)}
      >
        <FolderCog size={13} />
        <span>战报目录</span>
        {count > 0 && <em className="d-storage-count">{count}</em>}
      </button>

      {open && (
        <DesktopDialog title="本地战报保存与路径设置" onClose={() => setOpen(false)}>
          <div className="d-storage-dialog">
            <div className="d-storage-card">
              <div className="d-storage-head">
                <span className="d-storage-title">
                  <HardDrive size={14} />
                  当前保存位置
                </span>
                <span className={`d-storage-badge${storage.config?.isCustom ? ' is-custom' : ''}`}>
                  {storage.nativeSupported
                    ? (storage.config?.isCustom ? '自定义目录' : '默认目录 · 重装不丢失')
                    : '浏览器缓存兜底（升级新外壳后支持自定义文件夹）'}
                </span>
              </div>

              <div className="d-storage-path" title={storage.config?.dir ?? ''}>
                {storage.config?.dir ?? '本地缓存（升级含战报存储的外壳后自动落盘至「我的文档」）'}
              </div>

              <p className="d-storage-desc">
                每局战报自动按单文件落盘保存（上限 {storage.config?.maxCount ?? 100} 局），程序重启、热更新重载或重新安装均不会丢失历史记录；更换路径时将自动复制迁移已有战报。
              </p>

              {storage.nativeSupported && (
                <div className="d-storage-actions">
                  <button
                    type="button"
                    className="d-button d-primary d-small"
                    disabled={storage.busy}
                    onClick={() => void storage.chooseDir()}
                  >
                    <FolderCog size={13} />
                    {storage.busy ? '处理中…' : '更改保存路径'}
                  </button>
                  <button
                    type="button"
                    className="d-button d-small"
                    disabled={storage.busy}
                    onClick={() => void storage.openDir()}
                  >
                    <FolderOpen size={13} />
                    打开文件夹
                  </button>
                  {storage.config?.isCustom && (
                    <button
                      type="button"
                      className="d-button d-small"
                      disabled={storage.busy}
                      onClick={() => void storage.resetDir()}
                    >
                      <RotateCcw size={13} />
                      恢复默认路径
                    </button>
                  )}
                </div>
              )}

              {storage.notice && <div className="d-storage-msg is-ok" role="status">{storage.notice}</div>}
              {storage.error && <div className="d-storage-msg is-err" role="alert">{storage.error}</div>}
            </div>

            <div className="d-storage-list-wrap">
              <div className="d-storage-list-head">
                <span>已归档本地战报（{history.length} 局）</span>
              </div>
              {history.length === 0 ? (
                <div className="d-storage-empty">暂无已归档历史战报，完成对局或切换新局后会自动保存在此。</div>
              ) : (
                <ul className="d-storage-list">
                  {history.map(item => (
                    <li key={item.key} className="d-storage-row">
                      <button
                        type="button"
                        className="d-storage-open"
                        onClick={() => {
                          onSelect?.(item.key);
                          setOpen(false);
                        }}
                      >
                        <strong>{item.label}</strong>
                        <span>
                          {dateFmt.format(item.seenAt)}
                          {item.report.difficulty ? ` · ${item.report.difficulty}` : ''}
                          {item.report.rounds.length > 0 ? ` · ${item.report.rounds.length} 回合` : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="d-storage-del"
                        title="删除这条本地战报"
                        aria-label={`删除 ${item.label}`}
                        onClick={() => void storage.deleteRecord(item)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DesktopDialog>
      )}
    </>
  );
}
