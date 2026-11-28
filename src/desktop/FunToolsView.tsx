// 青逝痕 Tenkinoko 制作
import React, { useEffect, useRef, useState } from 'react';
import {
  Disc3,
  Music2,
  Play,
  Power,
  Radio,
  RotateCcw,
  Sparkles,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  RADIO_PRESETS,
  RADIO_SLOTS,
  isSlotCustomized,
  phaseDisplayLabel,
  type RadioSlotId,
  type TacticalRadioController,
} from './tacticalRadio';

type FunToolTab = 'radio';

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fmtBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RadioNowPlaying({
  visible,
  isPlaying,
  enabled,
  activeTrackLabel,
  getPlaybackClock,
}: {
  visible: boolean;
  isPlaying: boolean;
  enabled: boolean;
  activeTrackLabel: string;
  getPlaybackClock: () => { currentTime: number; duration: number };
}) {
  const [clock, setClock] = useState({ currentTime: 0, duration: 0 });

  useEffect(() => {
    if (!visible || !isPlaying) {
      setClock({ currentTime: 0, duration: 0 });
      return;
    }
    const sync = () => setClock(getPlaybackClock());
    sync();
    const id = window.setInterval(sync, 1000);
    return () => window.clearInterval(id);
  }, [getPlaybackClock, isPlaying, visible]);

  const pct = isPlaying && clock.duration > 0
    ? Math.min(100, Math.round((clock.currentTime / clock.duration) * 100))
    : 0;

  return (
    <>
      <div className="d-radio-now">
        <Disc3 size={14} className={isPlaying && visible ? 'd-radio-spin' : ''} />
        <span className="d-radio-now-title">
          {isPlaying && activeTrackLabel
            ? `正在播放：${activeTrackLabel}`
            : enabled
              ? '监听中 · 进入对应游戏阶段将自动淡入播放（也可点击下方任意槽位试听）'
              : '电台待机 · 开启后自动按游戏阶段无缝切歌，全程不修改游戏任何文件'}
        </span>
        {isPlaying && (
          <span className="d-radio-time">
            {fmtTime(clock.currentTime)} / {fmtTime(clock.duration)}
          </span>
        )}
      </div>

      <div className="d-radio-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

interface Props {
  visible: boolean;
  radio: TacticalRadioController;
}

export function FunToolsView({ visible, radio }: Props) {
  const [activeTab, setActiveTab] = useState<FunToolTab>('radio');
  const [dragOverSlot, setDragOverSlot] = useState<RadioSlotId | null>(null);
  const [busySlot, setBusySlot] = useState<RadioSlotId | null>(null);
  const fileInputsRef = useRef<Partial<Record<RadioSlotId, HTMLInputElement | null>>>({});

  const { config } = radio;
  const anyCustomized = RADIO_SLOTS.some(s => isSlotCustomized(s.id, config.slots[s.id]));

  const handleFilePick = async (slotId: RadioSlotId, file: File | undefined | null) => {
    if (!file) return;
    setBusySlot(slotId);
    try {
      await radio.uploadCustomTrack(slotId, file);
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <div className="d-ref-shell d-fun-shell" hidden={!visible}>
      {/* Sub-navigation bar matching 03 战术资料 — ready for future mini-tools */}
      <div className="d-ref-subnav" role="tablist" aria-label="趣味工具列表">
        <div className="d-ref-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'radio'}
            onClick={() => setActiveTab('radio')}
          >
            <Radio size={14} />
            <span>战术电台 · 动态 BGM</span>
          </button>
        </div>
        <span className="d-fun-future-note">
          <Sparkles size={12} />
          趣味工具栏已就绪 · 后续小工具均在此扩展
        </span>
      </div>

      {activeTab === 'radio' && (
        <div className="d-ref-body d-fun-scroll">
          {/* Master Tactical Radio Console */}
          <section className={`d-panel d-radio-console${config.enabled ? ' is-armed' : ''}`} aria-label="战术电台总控">
            <div className="d-radio-console-left">
              <button
                type="button"
                className={`d-radio-power${config.enabled ? ' is-on' : ''}`}
                aria-pressed={config.enabled}
                onClick={() => radio.setEnabled(!config.enabled)}
              >
                <Power size={16} />
                <span>{config.enabled ? '电台已开启' : '开启战术电台'}</span>
              </button>

              <div className="d-radio-status">
                <div className="d-radio-status-row">
                  <span className="d-radio-phase-chip" data-phase={radio.livePhase}>
                    <span className="d-dot" aria-hidden="true" />
                    当前监测：{phaseDisplayLabel(radio.livePhase)}
                  </span>
                  {radio.previewSlot && (
                    <button
                      type="button"
                      className="d-radio-preview-tag"
                      onClick={radio.stopPreview}
                      title="点击停止试听，交回自动阶段监听"
                    >
                      <Square size={10} />
                      试听中（点此停止）
                    </button>
                  )}
                </div>

                <RadioNowPlaying
                  visible={visible}
                  isPlaying={radio.isPlaying}
                  enabled={config.enabled}
                  activeTrackLabel={radio.activeTrackLabel}
                  getPlaybackClock={radio.getPlaybackClock}
                />
              </div>
            </div>

            <div className="d-radio-console-right">
              <label className="d-radio-vol" aria-label="电台总音量">
                <button
                  type="button"
                  className="d-icon"
                  title={config.volume > 0 ? '静音' : '恢复音量'}
                  onClick={() => radio.setVolume(config.volume > 0 ? 0 : 0.65)}
                >
                  {config.volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(config.volume * 100)}
                  onChange={e => radio.setVolume(Number(e.target.value) / 100)}
                />
                <span>{Math.round(config.volume * 100)}%</span>
              </label>

              <button
                type="button"
                className="d-button d-small"
                onClick={() => radio.setCrossfadeMs(config.crossfadeMs > 0 ? 0 : 800)}
                title="切歌时平滑淡入淡出过渡"
              >
                {config.crossfadeMs > 0 ? `淡入淡出 ${(config.crossfadeMs / 1000).toFixed(1)}s` : '直接切歌'}
              </button>

              <button
                type="button"
                className="d-button d-small"
                disabled={!anyCustomized}
                onClick={() => void radio.restoreAllDefaults()}
                title="清空所有本地上传音频并还原全部默认槽位配置"
              >
                <RotateCcw size={13} />
                <span>全部还原默认</span>
              </button>
            </div>
          </section>

          <p className="d-radio-tip">
            <Music2 size={13} />
            <span>
              <strong>零封号风险提示：</strong>本功能为纯外置协议联动播放器，不修改任何游戏客户端文件。建议在明日方舟设置中将
              <strong>【音乐音量】调为 0</strong>（保留干员语音与战斗音效），即可无损享受开局 BP / 备战 / Boss 战自动切歌。
            </span>
          </p>

          {radio.error && (
            <p className="d-radio-error" role="alert">
              {radio.error}
            </p>
          )}

          {/* 4 Tactical BGM Slots Grid */}
          <section className="d-radio-grid" aria-label="阶段 BGM 槽位配置">
            {RADIO_SLOTS.map(meta => {
              const slot = config.slots[meta.id];
              const customized = isSlotCustomized(meta.id, slot);
              const isPreviewing = radio.previewSlot === meta.id;
              const isLiveActive = radio.activeSlot === meta.id && radio.isPlaying;
              const isBusy = busySlot === meta.id;
              const isDrag = dragOverSlot === meta.id;
              return (
                <article
                  key={meta.id}
                  className={`d-panel d-radio-card is-accent-${meta.accent}${slot.enabled ? '' : ' is-off'}${isLiveActive ? ' is-playing' : ''}${isDrag ? ' is-dragover' : ''}`}
                  onDragOver={e => {
                    e.preventDefault();
                    if (dragOverSlot !== meta.id) setDragOverSlot(meta.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverSlot === meta.id) setDragOverSlot(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOverSlot(null);
                    const file = e.dataTransfer.files?.[0];
                    void handleFilePick(meta.id, file);
                  }}
                >
                  <header className="d-radio-card-head">
                    <div className="d-radio-card-title">
                      <span className="d-radio-slot-code">{meta.code}</span>
                      <h3>{meta.title}</h3>
                      {isLiveActive && <span className="d-radio-live-badge">{isPreviewing ? '试听中' : '播放中'}</span>}
                    </div>
                    <label className="d-radio-switch">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={e => radio.setSlotEnabled(meta.id, e.target.checked)}
                      />
                      <span>{slot.enabled ? '启用' : '关闭'}</span>
                    </label>
                  </header>

                  <p className="d-radio-card-desc">{meta.triggerDesc}</p>

                  {/* 4 Built-in Clip Preset Chips */}
                  <div className="d-radio-presets" role="group" aria-label={`${meta.title}内置曲目选择`}>
                    {RADIO_PRESETS.map(preset => {
                      const active = slot.source === 'preset' && slot.presetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`d-radio-preset-btn${active ? ' is-selected' : ''}`}
                          aria-pressed={active}
                          onClick={() => radio.selectPreset(meta.id, preset.id)}
                          title={`${preset.shortLabel} · ${preset.title}（${preset.tag}）`}
                        >
                          <strong>{preset.shortLabel}</strong>
                          <small>{preset.title}</small>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Uploaded Track Indicator or Drop Hint */}
                  <div className={`d-radio-custom-box${slot.source === 'custom' && slot.customName ? ' has-custom' : ''}`}>
                    {slot.source === 'custom' && slot.customName ? (
                      <>
                        <Music2 size={13} />
                        <span className="d-radio-custom-name" title={slot.customName}>
                          自定义：{slot.customName}
                        </span>
                        {slot.customSize && <small>{fmtBytes(slot.customSize)}</small>}
                      </>
                    ) : (
                      <span className="d-radio-custom-hint">
                        支持拖入或点击上传本地歌曲（MP3 / WAV / OGG / FLAC），自动本机保存
                      </span>
                    )}
                  </div>

                  <footer className="d-radio-card-actions">
                    <input
                      ref={el => { fileInputsRef.current[meta.id] = el; }}
                      type="file"
                      accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
                      hidden
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        void handleFilePick(meta.id, file);
                      }}
                    />
                    <button
                      type="button"
                      className={`d-button d-small${isPreviewing ? ' d-primary' : ''}`}
                      onClick={() => radio.togglePreview(meta.id)}
                    >
                      {isPreviewing ? <Square size={12} /> : <Play size={12} />}
                      <span>{isPreviewing ? '停止试听' : '试听当前'}</span>
                    </button>

                    <button
                      type="button"
                      className="d-button d-small"
                      disabled={isBusy}
                      onClick={() => fileInputsRef.current[meta.id]?.click()}
                    >
                      <Upload size={12} />
                      <span>{isBusy ? '保存中…' : '上传本地歌曲'}</span>
                    </button>

                    <button
                      type="button"
                      className="d-button d-small d-radio-restore-btn"
                      disabled={!customized}
                      onClick={() => void radio.restoreSlotDefault(meta.id)}
                      title={`还原为默认配置（${meta.defaultPreset.toUpperCase()}）`}
                    >
                      <RotateCcw size={12} />
                      <span>还原默认</span>
                    </button>
                  </footer>
                </article>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
