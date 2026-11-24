import { useMemo, useState } from 'react';
import { ClipboardList, Columns2, Monitor } from 'lucide-react';
import BattleReportsView from '../BattleReportsView';
import { demoReport, type DemoScene } from './battleReportFixture';
import type { BattleReportsBridge, ReportFeed } from '../battleReports';
import { REPORT_BRAND } from '../../brand/productBrand';
import '../desktop.css';
import './battleReportDemo.css';

const scenes = { settled: 'R9 协防已结算', assisting: 'R9 协防进行中', opening: '开局仅预告' };
export default function BattleReportDemo() {
  const [scene, setScene] = useState<DemoScene>('settled');
  const [half, setHalf] = useState(false);
  const [checklist, setChecklist] = useState(false);
  const api = useMemo<BattleReportsBridge>(() => {
    const feed: ReportFeed = { status: 'listening', report: demoReport(scene), reportRun: 1 };
    return { getState: async () => feed, onState: () => () => {}, setEnabled: async () => feed, showDiagnostics: async () => {} };
  }, [scene]);
  return <div className="desktop-app d-report-demo">
    <header className="d-demo-tools"><div className="d-demo-brand"><span>{REPORT_BRAND.name}</span><b>战报预演</b></div>
      <div className="d-demo-scenes" role="group" aria-label="演示场景">
        {(Object.keys(scenes) as DemoScene[]).map(id => <button type="button" key={id} aria-pressed={scene === id}
          onClick={() => { setScene(id); setChecklist(false); }}>{scenes[id]}</button>)}</div>
      <div className="d-demo-modes"><button type="button" className="d-button" aria-pressed={half} onClick={() => setHalf(!half)}>
        {half ? <Monitor size={14} /> : <Columns2 size={14} />}半屏 760px</button>
        <button type="button" className="d-button" aria-pressed={checklist} onClick={() => setChecklist(!checklist)}>
          <ClipboardList size={14} />{checklist ? '返回战报' : '改造清单'}</button></div>
    </header>
    <div className="d-demo-stage" data-half={half}>
      <BattleReportsView key={scene} api={api} visible={!checklist} sourceLabel="离线演示" />
      {checklist && <main className="d-demo-check"><h1>改造清单</h1><ul>
        <li>对局、身份和采集状态合并为一行；四席可直接切换视角。</li>
        <li>无漏、协防中、全额兜住、部分兜住和全员失守使用独立标记。缺少结算依据时保留未知。</li>
        <li>宽屏联动详情，半屏就地展开。R9 的三条协防链路全部可见。</li>
        <li>出怪按回合和批次排列；默认从当前回合开始，详情内也可查看。</li>
        <li>备战期直接显示 R1 至 R3，可查看全部 15 回合预告。</li>
      </ul></main>}
    </div>
  </div>;
}
