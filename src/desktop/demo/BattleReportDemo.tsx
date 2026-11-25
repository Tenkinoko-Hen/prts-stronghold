// 青逝痕 Tenkinoko 制作
import { useMemo, useState } from 'react';
import { Columns2, Monitor } from 'lucide-react';
import BattleReportsView from '../BattleReportsView';
import TelemetryApp from '../TelemetryApp';
import HudStripApp from '../HudStripApp';
import { MobileSecondScreen } from '../../mobile/MobileSecondScreen';
import { demoReport, type DemoScene } from './battleReportFixture';
import type { BattleReportsBridge, ReportFeed } from '../battleReports';
import { REPORT_BRAND } from '../../brand/productBrand';
import '../desktop.css';
import './battleReportDemo.css';

const scenes: Record<DemoScene, string> = {
  coop_elim: '多人淘汰+牌库',
  coop_boss: '多人R14 Boss组合图',
  quick_r9: '极速R9 Boss+图表',
  second_screen: '手机横屏副屏',
  hud_preview: '悬浮窗预览',
  settled: 'R9 协防已结算',
  assisting: 'R9 协防中',
  opening: '开局仅预告',
  solo_dps: '全维遥测示例',
};

export default function BattleReportDemo() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const isLiteDemo = params.has('lite-demo');
  const liteSceneParam = params.get('lite-demo') || 'coop_elim';
  const [liteRail, setLiteRail] = useState(params.get('rail') === '1');
  const [scene, setScene] = useState<DemoScene>(
    (liteSceneParam in scenes ? liteSceneParam : 'coop_elim') as DemoScene,
  );
  const [half, setHalf] = useState(false);
  const [secondLive, setSecondLive] = useState(true);
  const isStandby = isLiteDemo && liteSceneParam === 'standby';
  const reportObj = useMemo(() => (isStandby ? null : demoReport(scene)), [isStandby, scene]);
  const api = useMemo<BattleReportsBridge>(() => {
    const feed: ReportFeed = {
      status: isStandby ? 'waiting' : 'listening',
      report: reportObj,
      reportRun: 1,
      npcapInstalled: true,
    };
    return { getState: async () => feed, onState: () => () => {}, setEnabled: async () => feed, showDiagnostics: async () => {} };
  }, [isStandby, reportObj]);

  if (isLiteDemo) {
    return (
      <TelemetryApp
        key={`${liteSceneParam}:${scene}`}
        previewApi={api}
        previewRail={liteRail}
        onTogglePreviewRail={() => setLiteRail(v => !v)}
      />
    );
  }

  return <div className="desktop-app d-report-demo">
    <header className="d-demo-tools"><div className="d-demo-brand"><span>{REPORT_BRAND.name}</span><b>界面效果预演</b></div>
      <div className="d-demo-scenes" role="group" aria-label="演示场景">
        {(Object.keys(scenes) as DemoScene[]).map(id => <button type="button" key={id} aria-pressed={scene === id}
          onClick={() => setScene(id)}>{scenes[id]}</button>)}</div>
      <div className="d-demo-modes"><button type="button" className="d-button" aria-pressed={half} onClick={() => setHalf(!half)}>
        {half ? <Monitor size={14} /> : <Columns2 size={14} />}半屏 760px</button></div>
    </header>
    <div className="d-demo-stage" data-half={half}>
      {scene === 'second_screen' ? (
        <main style={{ display: 'grid', justifyItems: 'center', gap: '14px', padding: '18px', background: '#090c11', minHeight: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#cbd5e1' }}>
            <span>模拟真机横屏无线副屏（915×412 沉浸横屏 · 自动常亮 · 断开即回手机攻略）</span>
            <button type="button" className="d-button d-small" aria-pressed={secondLive} onClick={() => setSecondLive(true)}>
              实战连线态（多人R7+牌库）
            </button>
            <button type="button" className="d-button d-small" aria-pressed={!secondLive} onClick={() => setSecondLive(false)}>
              待开局连线态
            </button>
          </div>
          <div
            style={{
              width: '915px',
              height: '412px',
              border: '6px solid #1e242e',
              borderRadius: '18px',
              overflow: 'hidden',
              boxShadow: '0 16px 40px rgba(0,0,0,0.65)',
              transform: 'translateZ(0)',
            }}
          >
            <MobileSecondScreen
              lan={{
                active: true,
                status: 'connected',
                host: '192.168.1.18',
                port: 39527,
                error: '',
                lastSyncAt: Date.now(),
                peerProduct: 'PRTS Stronghold',
                payload: {
                  seq: 12,
                  at: Date.now(),
                  product: 'stronghold',
                  productName: 'PRTS Stronghold',
                  status: 'listening',
                  guide: {
                    bannedCovenants: ['叙拉古', '迅捷', '奥术', '助力', '萨尔贡', '炎', '谢拉格', '阿戈尔', '精准', '突袭'],
                    currentRound: secondLive ? 7 : 1,
                    compTitle: '森蚺沙砾机 · 不屈卡西',
                    paceTip: secondLive
                      ? '推荐 4 本 · 四本搜黑键与车尔尼三连，顺带拿玛恩纳补清杂；2号队友已阵亡，留技能帮 3 号位兜底右路。'
                      : '推荐 1 本 · 开局拿森蚺/机械打工，优先保血量攒经济，等进入对局后自动切换实时牌池与战报。',
                  },
                  report: secondLive ? demoReport('coop_elim') : null,
                },
              }}
              onDisconnect={() => setScene('coop_elim')}
              productMode="full"
            />
          </div>
        </main>
      ) : scene === 'hud_preview' ? (
        <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(456px, 1fr))', alignContent: 'start', gap: '18px 22px', padding: '20px 24px', background: '#0b0e14', minHeight: '100%' }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '12.5px', color: '#ffe600' }}>① Boss 战悬浮窗（440×176 · 自动切参战干员头像 + 伤害条 + DPS）</h3>
            <HudStripApp
              previewState={{
                open: true,
                locked: false,
                shortcut: 'Ctrl+Shift+F10',
                shortcutAvailable: true,
                status: 'listening',
                report: reportObj,
                guide: {
                  round: 9,
                  compTitle: '森蚺沙砾机 · 不屈卡西',
                  paceTip: '推荐 5 本 · 资金够再升五本，优先补齐乌啾、奥尔佳、玛恩纳与黑键；若本轮经济不足可顺延一回合，先锁核心输出装备并预留首领战前排抗伤站位。',
                  suggestedOperators: ['黑键', '逻各斯', '玛恩纳', '车尔尼', '黍'],
                },
              }}
            />
          </div>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '12.5px', color: '#3698cc' }}>② 普通回合 · 页 1「牌池+出怪」（解锁态可点击切页 · 核心余量/在售/池空红警 + 本波出怪）</h3>
            <HudStripApp
              initialPage="intel"
              previewState={{
                open: true,
                locked: false,
                shortcut: 'Ctrl+Shift+F10',
                shortcutAvailable: true,
                status: 'listening',
                report: demoReport('coop_elim'),
                guide: {
                  round: 7,
                  compTitle: '莱塔尼亚奥术核心',
                  paceTip: '推荐 4 本 · 四本搜黑键与车尔尼三连，顺带拿玛恩纳补清杂；2号队友已淘汰，留技能帮 3 号位兜底。',
                  suggestedOperators: ['黑键', '玛恩纳', '维什戴尔', '黍', '车尔尼', '逻各斯'],
                },
              }}
            />
          </div>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '12.5px', color: '#d8bf4b' }}>③ 普通回合 · 页 2「队友态势」（锁定穿透态 · 四席血量/本数/淘汰灰态 + 在场干员含“暴躁铁皮”）</h3>
            <HudStripApp
              initialPage="peers"
              previewState={{
                open: true,
                locked: true,
                shortcut: 'Ctrl+Shift+F10',
                shortcutAvailable: true,
                status: 'listening',
                report: demoReport('coop_elim'),
                guide: {
                  round: 7,
                  compTitle: '莱塔尼亚奥术核心',
                  paceTip: '推荐 4 本 · 四本搜黑键与车尔尼三连，顺带拿玛恩纳补清杂；2号队友已淘汰，留技能帮 3 号位兜底。',
                  suggestedOperators: ['黑键', '玛恩纳', '维什戴尔', '黍', '车尔尼', '逻各斯'],
                },
              }}
            />
          </div>
        </main>
      ) : (
        <BattleReportsView
          key={scene}
          api={api}
          visible
          sourceLabel="离线演示"
          compTitle="莱塔尼亚奥术核心"
          suggestedOperatorNames={['黑键', '逻各斯', '玛恩纳', '黍', '维什戴尔']}
          suggestedEquipNames={['维式重锤', '高能瞄准镜', '盟约之币']}
        />
      )}
    </div>
  </div>;
}
