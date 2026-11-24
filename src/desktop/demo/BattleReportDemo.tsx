import { useMemo, useState } from 'react';
import { Columns2, Monitor } from 'lucide-react';
import BattleReportsView from '../BattleReportsView';
import HudStripApp from '../HudStripApp';
import { demoReport, type DemoScene } from './battleReportFixture';
import type { BattleReportsBridge, ReportFeed } from '../battleReports';
import { REPORT_BRAND } from '../../brand/productBrand';
import '../desktop.css';
import './battleReportDemo.css';

const scenes: Record<DemoScene, string> = {
  coop_elim: '多人淘汰+牌库',
  quick_r9: '极速R9 Boss+图表',
  hud_preview: '悬浮窗预览',
  settled: 'R9 协防已结算',
  assisting: 'R9 协防中',
  opening: '开局仅预告',
  solo_dps: '全维遥测示例',
};

export default function BattleReportDemo() {
  const [scene, setScene] = useState<DemoScene>('coop_elim');
  const [half, setHalf] = useState(false);
  const reportObj = useMemo(() => demoReport(scene), [scene]);
  const api = useMemo<BattleReportsBridge>(() => {
    const feed: ReportFeed = { status: 'listening', report: reportObj, reportRun: 1 };
    return { getState: async () => feed, onState: () => () => {}, setEnabled: async () => feed, showDiagnostics: async () => {} };
  }, [reportObj]);

  return <div className="desktop-app d-report-demo">
    <header className="d-demo-tools"><div className="d-demo-brand"><span>{REPORT_BRAND.name}</span><b>界面效果预演</b></div>
      <div className="d-demo-scenes" role="group" aria-label="演示场景">
        {(Object.keys(scenes) as DemoScene[]).map(id => <button type="button" key={id} aria-pressed={scene === id}
          onClick={() => setScene(id)}>{scenes[id]}</button>)}</div>
      <div className="d-demo-modes"><button type="button" className="d-button" aria-pressed={half} onClick={() => setHalf(!half)}>
        {half ? <Monitor size={14} /> : <Columns2 size={14} />}半屏 760px</button></div>
    </header>
    <div className="d-demo-stage" data-half={half}>
      {scene === 'hud_preview' ? (
        <main style={{ display: 'grid', gap: '20px', padding: '24px', background: '#0b0e14', minHeight: '100%' }}>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#ffe600' }}>① Boss 战悬浮窗（440×176 克制尺寸 · 全量攻略文本 + 参战干员当前回合输出/DPS 统一平滑向下滚动）</h3>
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
                  paceTip: '推荐 5 本 · 资金够再升五本，优先补齐乌啾、奥尔佳、玛恩纳与黑键；若本轮经济不足可顺延一回合，先锁核心输出装备（高能瞄准镜 / 维式重锤）并预留首领战前排抗伤站位。',
                },
              }}
            />
          </div>
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#00e5ff' }}>② 普通回合悬浮窗（锁定鼠标点击穿透状态 · 实时展示本路漏怪/血量/在场干员）</h3>
            <HudStripApp
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
                  paceTip: '推荐 4 本 · 四本搜黑键与车尔尼三连，顺带拿玛恩纳补清杂；2号队友已淘汰，注意留技能帮 3 号位兜底右路高威胁术师。',
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
