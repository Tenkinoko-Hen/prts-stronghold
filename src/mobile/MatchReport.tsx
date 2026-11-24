import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowDownLeft, ArrowUpRight, BookOpen, FileDown, Flag, ImageDown, Plus, ScanText} from 'lucide-react';
import {RoundSync, type RoundSyncProgress} from './RoundSync';
import {MobileLanPanel} from './MobileLanPanel';
import {parseSettlementQuickText} from './settlementQuickParse';
import type {BattleReport} from '../desktop/battleReportData';
import {isSeatEliminatedInRound} from '../desktop/battleRoundOutcome';
import {seatDisplayText} from '../desktop/BattleReportPanels';
import {formatTelemetryRate, formatTelemetryTotal} from '../desktop/combatTelemetry';
import atlas from '../desktop/enemyPortraits.json';
import atlasUrl from '../desktop/enemyPortraits.webp';
import catalog from './reportEnemyNames.json';
import {PRODUCT_BRAND, REPORT_BRAND} from '../brand/productBrand';
import './matchReport.css';

type Spawn = {id:string;name:string;batch:number;count:number};
type AssistEntry = {name:string;count:number};
type Row = {ocr?:number; manual?:number; leaks?:number; helps?:number; boss?:number; note?:string; spawns?:Spawn[]};
type Match = {
  started:number;
  ended?:number;
  current?:number;
  iHelped?:AssistEntry[];
  helpedMe?:AssistEntry[];
  rounds:Record<string,Row>;
};
type Snapshot = {active?:Match; history?:Match[]; error?:boolean};

declare global { interface Window {
  PRTSJournal?: {
    snapshot():string;
    start():boolean;
    finish(id:string):boolean;
    record(id:string,round:number,data:string):boolean;
    importLanMatch?(raw:string):boolean;
  };
  PRTSFiles?: {save(kind:string,name:string,base64:string):string};
} }

const date = (n:number)=>new Date(n).toLocaleString('zh-CN',{hour12:false});
const fieldNames = {leaks:'漏怪',helps:'兜底',boss:'首领伤害'} as const;
const fields = ['leaks','helps','boss'] as const;
const sorted = (m:Match)=>Object.entries(m.rounds).sort(([a],[b])=>Number(a)-Number(b));
const allEnemies = Object.entries(catalog).sort((a,b)=>a[1].localeCompare(b[1],'zh-CN'));
const slots = new Map(atlas.ids.map((id,i)=>[id,i]));
const spawnLine = (e:Spawn)=>`P${e.batch} · ${e.name} ×${e.count}`;
const compactNum = (n:number)=>n>=100000?`${(n/10000).toFixed(1)}万`:n.toLocaleString('zh-CN');

function Enemy({id}:{id:string}){
  const slot=slots.get(id),cols=atlas.columns,rows=Math.ceil(atlas.ids.length/cols);
  return slot===undefined ? null : <i aria-hidden="true" className="mr-enemy" style={{backgroundImage:`url("${atlasUrl}")`,backgroundSize:`${cols*100}% ${rows*100}%`,backgroundPosition:`${slot%cols*100/(cols-1)}% ${Math.floor(slot/cols)*100/(rows-1)}%`}}/>;
}

function SpawnEditor({initial}:{initial:Spawn[]}){
  const [rows,set]=useState(initial);
  const [term,search]=useState('');
  const [batch,setBatch]=useState(1),[count,setCount]=useState(1);
  const options=allEnemies.filter(([id,name])=>!term||name.includes(term)||id.includes(term));
  const [selected,choose]=useState('');
  const id=options.some(([key])=>key===selected)?selected:options[0]?.[0];
  return <fieldset className="mr-spawn"><legend>怪种明细（选填 · 沉底收纳）</legend>
    {rows.map((e,i)=><div key={i}><Enemy id={e.id}/>{spawnLine(e)}<button type="button" aria-label={`移除${e.name}`} onClick={()=>set(rows.filter((_,j)=>i!==j))}>×</button></div>)}
    <input aria-label="搜索敌人" value={term} placeholder="搜索敌人名称" onChange={e=>search(e.target.value)}/>
    <select aria-label="敌人" value={id??''} onChange={e=>choose(e.target.value)}>{options.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select>
    <label>批次<input aria-label="批次" type="number" min="1" max="30" value={batch} onChange={e=>setBatch(Number(e.target.value))}/></label>
    <label>数量<input aria-label="数量" type="number" min="1" max="9999" value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
    <button type="button" disabled={!id||rows.length>=45||!Number.isInteger(batch)||!Number.isInteger(count)||batch<1||batch>30||count<1||count>9999}
      onClick={()=>{if(id)set([...rows,{id,name:catalog[id as keyof typeof catalog],count,batch}]);}}>添加怪种</button><input type="hidden" name="spawns" value={JSON.stringify(rows)}/>
  </fieldset>;
}

const esc = (s:string)=>s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));

async function exportMatch(match:Match, kind:'image'|'document'){
  const roundEntries = sorted(match);
  const totalLeaks = roundEntries.reduce((s, [, r]) => s + (r.leaks ?? 0), 0);
  const totalHelps = roundEntries.reduce((s, [, r]) => s + (r.helps ?? 0), 0);
  const totalBoss = roundEntries.reduce((s, [, r]) => s + (r.boss ?? 0), 0);
  const iHelped = match.iHelped ?? [];
  const helpedMe = match.helpedMe ?? [];
  const helpScale = Math.max(1, ...iHelped.map(x => x.count), ...helpedMe.map(x => x.count));
  const roundScale = Math.max(1, ...roundEntries.flatMap(([, r]) => [r.leaks ?? 0, r.helps ?? 0]));

  const blob = kind === 'document'
    ? new Blob([`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(REPORT_BRAND.title)}</title>
<style>body{background:#0c0e11;color:#eceff4;font:14px/1.5 system-ui,sans-serif;max-width:820px;margin:auto;padding:20px}b{color:#ffe600}.kpis{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.kpi{padding:6px 12px;border:1px solid #2b333e;background:#12161d}small{color:#94a3b8;display:block;font-size:11px}.kpi strong{font:700 18px monospace}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:12px 0}.card{padding:10px;border:1px solid #2b333e;background:#12161d}.bar-row{display:grid;grid-template-columns:7em 1fr 3em;align-items:center;gap:8px;margin:5px 0}.track{height:8px;background:#090b0f;display:block}.fill-out{height:100%;background:#38bdf8;display:block}.fill-in{height:100%;background:#34d399;display:block}.fill-leak{height:100%;background:#f87171;display:block}article{border-top:1px solid #28303b;padding:8px 0}footer{border-top:1px solid #28303b;padding-top:8px;margin-top:14px;font-size:12px;color:#94a3b8}</style>
<b>${esc(REPORT_BRAND.name)}</b><h1>卫戍战报速览</h1>
<div class="kpis"><div class="kpi"><small>已录回合</small><strong>${roundEntries.length}R</strong></div><div class="kpi"><small>累计漏怪</small><strong style="color:${totalLeaks?'#f87171':'#34d399'}">${totalLeaks||'无漏'}</strong></div><div class="kpi"><small>累计兜底</small><strong style="color:#38bdf8">+${totalHelps}</strong></div>${totalBoss?`<div class="kpi"><small>首领伤害</small><strong>${esc(compactNum(totalBoss))}</strong></div>`:''}</div>
${(iHelped.length||helpedMe.length)?`<div class="grid">${iHelped.length?`<div class="card"><strong style="color:#38bdf8">↗ 我给谁兜 +${iHelped.reduce((s,x)=>s+x.count,0)}</strong>${iHelped.map(x=>`<div class="bar-row"><span>${esc(x.name)}</span><span class="track"><i class="fill-out" style="width:${Math.max(6,x.count/helpScale*100)}%"></i></span><strong style="text-align:right">+${x.count}</strong></div>`).join('')}</div>`:''}${helpedMe.length?`<div class="card"><strong style="color:#34d399">↙ 谁给我兜 ${helpedMe.reduce((s,x)=>s+x.count,0)}</strong>${helpedMe.map(x=>`<div class="bar-row"><span>${esc(x.name)}</span><span class="track"><i class="fill-in" style="width:${Math.max(6,x.count/helpScale*100)}%"></i></span><strong style="text-align:right">${x.count}</strong></div>`).join('')}</div>`:''}</div>`:''}
${roundEntries.map(([n,r])=>`<article><strong>R${esc(n.padStart(2,'0'))}</strong>${r.leaks!==undefined?`<div class="bar-row"><span>漏怪</span><span class="track"><i class="fill-leak" style="width:${r.leaks?Math.max(6,r.leaks/roundScale*100):0}%"></i></span><strong style="text-align:right">${r.leaks===0?'无漏':r.leaks}</strong></div>`:''}${r.helps?`<div class="bar-row"><span>兜底</span><span class="track"><i class="fill-out" style="width:${Math.max(6,r.helps/roundScale*100)}%"></i></span><strong style="text-align:right">+${r.helps}</strong></div>`:''}${r.boss?`<small>首领 ${esc(compactNum(r.boss))}</small>`:''}${r.note?`<small>${esc(r.note)}</small>`:''}</article>`).join('')}
<footer>${esc(REPORT_BRAND.footer)} · ${esc(date(match.started))}</footer></html>`], {type:'text/html;charset=utf-8'})
    : await renderGraphicalMatchPng(match, roundEntries, totalLeaks, totalHelps, totalBoss, helpScale, roundScale);

  const encoded = await new Promise<string>((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return window.PRTSFiles?.save(kind,`${REPORT_BRAND.exportPrefix}_${match.started}-${Date.now()}`,encoded) ?? '请在安卓安装版中导出';
}

async function renderGraphicalMatchPng(
  match: Match,
  roundEntries: [string, Row][],
  totalLeaks: number,
  totalHelps: number,
  totalBoss: number,
  helpScale: number,
  roundScale: number,
): Promise<Blob> {
  const iHelped = match.iHelped ?? [];
  const helpedMe = match.helpedMe ?? [];
  const width = 800;
  const assistRowsCount = (iHelped.length ? iHelped.length + 1 : 0) + (helpedMe.length ? helpedMe.length + 1 : 0);
  const estHeight = 170 + assistRowsCount * 34 + roundEntries.length * 64 + 60;
  const scale = Math.min(1, 14000 / Math.max(400, estHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(estHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('无法生成图片');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, width, estHeight);
  ctx.fillStyle = '#ffe600';
  ctx.fillRect(0, 0, width, 4);

  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#ffe600';
  ctx.fillText(REPORT_BRAND.name, 28, 42);
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText('· 局内图形战报', 28 + ctx.measureText(REPORT_BRAND.name).width + 10, 42);

  // KPI Pills
  const kpis: [string, string, string][] = [
    ['回合', `${roundEntries.length}R`, '#e2e8f0'],
    ['漏怪', totalLeaks === 0 ? '无漏' : String(totalLeaks), totalLeaks === 0 ? '#34d399' : '#f87171'],
    ['兜底', `+${totalHelps}`, '#38bdf8'],
  ];
  if (totalBoss > 0) kpis.push(['首领', compactNum(totalBoss), '#ffe600']);
  kpis.forEach(([label, val, color], idx) => {
    const x = 28 + idx * 184;
    ctx.fillStyle = '#131821';
    ctx.fillRect(x, 62, 172, 62);
    ctx.strokeStyle = '#26303d';
    ctx.strokeRect(x, 62, 172, 62);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(label, x + 12, 83);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = color;
    ctx.fillText(val, x + 12, 112);
  });

  let y = 148;
  const drawAssistBlock = (title: string, items: AssistEntry[], color: string, plus: boolean) => {
    if (!items.length) return;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(`${title}  ${plus ? '+' : ''}${items.reduce((s, i) => s + i.count, 0)}`, 28, y);
    y += 12;
    for (const item of items) {
      y += 26;
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(item.name.slice(0, 10), 28, y);
      ctx.fillStyle = '#141922';
      ctx.fillRect(195, y - 13, 490, 12);
      ctx.fillStyle = color;
      ctx.fillRect(195, y - 13, Math.max(12, Math.round((item.count / helpScale) * 490)), 12);
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`${plus ? '+' : ''}${item.count}`, 700, y);
    }
    y += 24;
  };

  drawAssistBlock('↗ 我给谁兜', iHelped, '#38bdf8', true);
  drawAssistBlock('↙ 谁给我兜', helpedMe, '#34d399', false);

  for (const [n, r] of roundEntries) {
    ctx.strokeStyle = '#1e2631';
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(width - 28, y);
    ctx.stroke();
    y += 24;
    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(`R${n.padStart(2, '0')}`, 28, y);

    // Leak bar
    const leakVal = r.leaks ?? 0;
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('漏', 92, y);
    ctx.fillStyle = '#141922';
    ctx.fillRect(114, y - 11, 210, 9);
    if (leakVal > 0) {
      ctx.fillStyle = '#f87171';
      ctx.fillRect(114, y - 11, Math.max(8, Math.round((leakVal / roundScale) * 210)), 9);
    }
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = leakVal === 0 && r.leaks !== undefined ? '#34d399' : '#fca5a5';
    ctx.fillText(r.leaks === undefined ? '—' : leakVal === 0 ? '无漏' : String(leakVal), 332, y);

    // Help bar
    const helpVal = r.helps ?? 0;
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('兜', 410, y);
    ctx.fillStyle = '#141922';
    ctx.fillRect(432, y - 11, 210, 9);
    if (helpVal > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(432, y - 11, Math.max(8, Math.round((helpVal / roundScale) * 210)), 9);
    }
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = helpVal > 0 ? '#38bdf8' : '#64748b';
    ctx.fillText(helpVal > 0 ? `+${helpVal}` : '0', 650, y);

    if (r.note || r.boss) {
      y += 20;
      ctx.font = '12.5px sans-serif';
      ctx.fillStyle = '#94a3b8';
      const sub = [r.boss ? `首领 ${compactNum(r.boss)}` : '', r.note || ''].filter(Boolean).join(' · ');
      ctx.fillText(sub.slice(0, 56), 92, y);
    }
    y += 18;
  }

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`${REPORT_BRAND.footer} · ${date(match.started)}`, 28, estHeight - 16);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(Error('图片编码失败'))), 'image/png'),
  );
}

export default function MatchReport({onGuide}:{onGuide?:()=>void}){
  const journal=window.PRTSJournal;
  const [snap,setSnap]=useState<Snapshot>({});
  const [selected,select]=useState(0);
  const [round,setRound]=useState(1);
  const [editing,edit]=useState(false);
  const [message,notify]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmEnd,confirm]=useState(false);
  const [quickText,setQuickText]=useState('');
  const progress=useRef<RoundSyncProgress>({id:'',handled:'',synchronized:false,pending:null});
  const refresh=useCallback(()=>{
    try{setSnap(JSON.parse(journal?.snapshot()??'{}'));}catch{notify('无法读取本机对局');}
  },[journal]);
  useEffect(()=>{refresh();const timer=setInterval(refresh,1200);return()=>clearInterval(timer);},[refresh]);
  const active=snap.active?.started?snap.active:undefined;
  const match=selected?snap.history?.find(m=>m.started===selected)??active:active;
  const live=!!active && !active.ended && match===active;
  const current=active?.current;
  useEffect(()=>{if(!editing&&live&&current)setRound(current);},[current,live]);
  useEffect(()=>{
    if (live && round) {
      window.PRTSOverlay?.updateStrip(round, REPORT_BRAND.name, `R${round} · 已录 ${match ? sorted(match).length : 0} 回合`);
    }
  },[live,round,match]);

  const handleImportLanReport = useCallback((pcReport: BattleReport) => {
    const roundsPayload: Record<string, Row> = {};
    const selfSeat = pcReport.self;
    const outTotals = new Map<number, number>();
    const inTotals = new Map<number, number>();

    for (const r of pcReport.rounds) {
      const selfElim = selfSeat ? isSeatEliminatedInRound(pcReport, selfSeat, r.number) : false;
      const teamLeaks = Object.values(r.leaks).reduce((a, b) => a + b, 0);
      const myHelps = selfSeat ? (r.assists[selfSeat] ?? 0) : Object.values(r.assists).reduce((a, b) => a + b, 0);
      const bossDamageSum = Object.values(r.bossDamage).reduce((a, b) => a + b, 0);
      const bossOfficialSum = r.bossOfficial.reduce((a, b) => a + b.damage, 0);
      const teamBoss = bossOfficialSum > 0 ? bossOfficialSum : bossDamageSum;
      if (selfSeat) {
        for (const p of r.assistPairs) {
          if (p.killer === selfSeat && p.owner !== selfSeat) outTotals.set(p.owner, (outTotals.get(p.owner) ?? 0) + p.count);
          if (p.owner === selfSeat && p.killer !== selfSeat) inTotals.set(p.killer, (inTotals.get(p.killer) ?? 0) + p.count);
        }
      }
      const roundTeleOps = pcReport.telemetry?.rounds[r.number]?.operators.slice(0, 3) ?? [];
      const teleSummary = roundTeleOps.length
        ? roundTeleOps.map(o => `${o.name} ${formatTelemetryTotal(o.totalDamage)}${o.activeDps != null ? `(${formatTelemetryRate(o.activeDps)})` : ''}`).join(' · ')
        : '';
      const note = [selfElim ? '已淘汰' : '', teleSummary].filter(Boolean).join(' · ');
      roundsPayload[String(r.number)] = {
        ...(selfElim ? {} : { leaks: r.selfLeaks ?? (selfSeat ? r.leaks[selfSeat] : undefined) ?? teamLeaks }),
        helps: myHelps,
        ...(teamBoss > 0 ? { boss: teamBoss } : {}),
        ...(note ? { note } : {}),
      };
    }

    if (!Object.keys(roundsPayload).length && pcReport.telemetry?.operators.length) {
      const top = pcReport.telemetry.operators.slice(0, 4);
      roundsPayload['1'] = {
        leaks: 0,
        helps: 0,
        boss: Math.round(pcReport.telemetry.teamTotalDamage),
        note: top.map(o => `${o.name} ${formatTelemetryTotal(o.totalDamage)}(${formatTelemetryRate(o.activeDps)})`).join(' · '),
      };
    }
    if (!Object.keys(roundsPayload).length) {
      notify('电脑端当前尚无实战回合可导入');
      return;
    }

    const iHelped: AssistEntry[] = [...outTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, count]) => ({ name: seatDisplayText(s, pcReport), count }));
    const helpedMe: AssistEntry[] = [...inTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, count]) => ({ name: seatDisplayText(s, pcReport), count }));

    const raw = JSON.stringify({
      current: pcReport.current || pcReport.rounds.at(-1)?.number || 1,
      ended: pcReport.rounds.at(-1)?.phase === 'end',
      iHelped,
      helpedMe,
      rounds: roundsPayload,
    });
    if (journal?.importLanMatch?.(raw)) {
      select(0);
      edit(false);
      refresh();
      notify('已同步图形战报，可一键存入相册');
    } else {
      notify('请在安卓安装版中使用一键导入');
    }
  }, [journal, refresh]);

  const roundList = match ? sorted(match) : [];
  const count = roundList.length;
  const previous = match?.rounds?.[round];
  const totalLeaks = roundList.reduce((s, [, r]) => s + (r.leaks ?? 0), 0);
  const totalHelps = roundList.reduce((s, [, r]) => s + (r.helps ?? 0), 0);
  const totalBoss = roundList.reduce((s, [, r]) => s + (r.boss ?? 0), 0);
  const iHelped = match?.iHelped ?? [];
  const helpedMe = match?.helpedMe ?? [];
  const helpScale = Math.max(1, ...iHelped.map(x => x.count), ...helpedMe.map(x => x.count));
  const roundScale = Math.max(1, ...roundList.flatMap(([, r]) => [r.leaks ?? 0, r.helps ?? 0]));
  const allSpawns = roundList.flatMap(([n, r]) => (r.spawns ?? []).map(sp => ({ round: n, ...sp })));

  const start=()=>{if(!journal?.start()){notify('无法开始记录，请重试');return;}
    window.PRTSRound?.stop();setRound(1);select(0);edit(false);notify('已开始记录本局');refresh();};
  const save=async(kind:'image'|'document')=>{if(!match||busy)return;setBusy(true);try{notify(await exportMatch(match,kind));}catch{notify('战报导出失败，请重试');}finally{setBusy(false);}};
  const standalone = PRODUCT_BRAND.mode === 'telemetry';

  return <main className="match-report"><header>{standalone ? <img src={`${import.meta.env.BASE_URL}${PRODUCT_BRAND.faviconFile}`} width="28" height="28" alt=""/> : <strong>{REPORT_BRAND.name}</strong>}<h1>{REPORT_BRAND.mobileHeaderTitle}</h1>{onGuide && <button onClick={onGuide}><BookOpen size={16}/>游戏攻略</button>}</header>
    <MobileLanPanel onImportReport={handleImportLanReport} />
    <section>
      <div className="mr-bar"><h2>{live?'本局态势':'历史战报'}</h2>
        {active&&<select aria-label="对局" value={selected} onChange={e=>{select(Number(e.target.value));edit(false);confirm(false);}}>
          <option value={0}>{active.ended?'最近对局':'当前对局'}</option>{[...(snap.history??[])].reverse().map(m=><option key={m.started} value={m.started}>{date(m.started)}</option>)}</select>}
      </div>
      {match && count > 0 && (
        <div className="mr-kpis">
          <div><small>回合</small><b>{count}R</b></div>
          <div><small>漏怪</small><b className={totalLeaks===0?'is-clean':'is-loss'}>{totalLeaks===0?'无漏':totalLeaks}</b></div>
          <div><small>兜底</small><b className="is-out">+{totalHelps}</b></div>
          {totalBoss > 0 && <div><small>首领</small><b className="is-boss">{compactNum(totalBoss)}</b></div>}
        </div>
      )}
      {!match && <p>尚无对局记录</p>}
      <div className="mr-actions">{(!active||active.ended)&&<button onClick={start}><Plus size={16}/>开始记录</button>}
        {live&&<><RoundSync round={round} progress={progress} onRound={setRound}/><button onClick={()=>confirm(true)}><Flag size={16}/>结束本局</button></>}
        {confirmEnd&&live&&<><button onClick={()=>{if(journal?.finish(String(active.started))){window.PRTSRound?.stop();confirm(false);edit(false);refresh();}else notify('结束记录失败');}}>确认结束</button><button onClick={()=>confirm(false)}>继续</button></>}
      </div>
      {snap.error&&<p role="alert">本机战报暂时无法读取</p>}
    </section>

    {(iHelped.length > 0 || helpedMe.length > 0) && (
      <section className="mr-assist-grid">
        {iHelped.length > 0 && (
          <div className="mr-assist-card is-out">
            <div className="mr-assist-head"><span><ArrowUpRight size={14}/>我给谁兜</span><b>+{iHelped.reduce((s,x)=>s+x.count,0)}</b></div>
            {iHelped.map(item => (
              <div key={item.name} className="mr-bar-row">
                <span className="mr-who">{item.name}</span>
                <span className="mr-track"><i className="is-out" style={{width:`${Math.max(6,(item.count/helpScale)*100)}%`}}/></span>
                <strong>+{item.count}</strong>
              </div>
            ))}
          </div>
        )}
        {helpedMe.length > 0 && (
          <div className="mr-assist-card is-in">
            <div className="mr-assist-head"><span><ArrowDownLeft size={14}/>谁给我兜</span><b>{helpedMe.reduce((s,x)=>s+x.count,0)}</b></div>
            {helpedMe.map(item => (
              <div key={item.name} className="mr-bar-row">
                <span className="mr-who">{item.name}</span>
                <span className="mr-track"><i className="is-in" style={{width:`${Math.max(6,(item.count/helpScale)*100)}%`}}/></span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    )}

    {match&&<section><div className="mr-bar"><h2>逐回合条形图</h2>{live&&<button onClick={()=>edit(!editing)}>{editing?'收起':'补记 / 识图'}</button>}</div>
      {editing&&live&&<>
        <div className="mr-quick-ocr">
          <label>结算文字快捷提取
            <input value={quickText} onChange={e=>setQuickText(e.target.value)} placeholder="如：R14 漏2 兜5 伤害145000" />
          </label>
          <button type="button" onClick={()=>{
            const parsed = parseSettlementQuickText(quickText);
            const targetRound = parsed.round ?? round;
            if (parsed.leaks === undefined && parsed.helps === undefined && parsed.boss === undefined && !parsed.note) {
              notify('请输入如「R6 漏2 兜4」或「伤害 120000」');
              return;
            }
            const prevRow = match.rounds?.[targetRound];
            const payload = {
              leaks: parsed.leaks ?? prevRow?.leaks ?? null,
              helps: parsed.helps ?? prevRow?.helps ?? null,
              boss: parsed.boss ?? prevRow?.boss ?? null,
              note: [prevRow?.note, parsed.note].filter(Boolean).join(' · '),
              spawns: prevRow?.spawns ?? [],
            };
            if (journal?.record(String(match.started), targetRound, JSON.stringify(payload))) {
              setRound(targetRound);
              setQuickText('');
              edit(false);
              notify(`R${targetRound} 已录入`);
              refresh();
            }
          }}><ScanText size={14}/>解析填入</button>
        </div>
        <form key={`${match.started}-${round}`} onSubmit={e=>{
          e.preventDefault();const form=new FormData(e.currentTarget);
          const data=Object.fromEntries(fields.map(k=>[k,form.get(k)===''?null:Number(form.get(k))]));
          if(!journal?.record(String(match.started),round,JSON.stringify({...data,note:form.get('note'),spawns:JSON.parse(String(form.get('spawns')||'[]'))}))){notify('请至少填入一项');return;}
          edit(false);notify(`R${round} 已保存`);refresh();
        }}><label>回合<select value={round} onChange={e=>setRound(Number(e.target.value))}>{Array.from({length:15},(_,i)=><option key={i} value={i+1}>R{i+1}</option>)}</select></label>
        {fields.map(k=><label key={k}>{fieldNames[k]}<input name={k} type="number" inputMode="numeric" min={0} max={1000000000} step={1} defaultValue={previous?.[k]??''} placeholder="—"/></label>)}
        <SpawnEditor initial={previous?.spawns??[]}/><label>备注<textarea name="note" maxLength={400} defaultValue={previous?.note??''}/></label><button>保存</button></form></>}
      {count===0&&<p>等待识别回合或从电脑端同步。</p>}
      <div className="mr-rounds">
        {roundList.map(([n,r]) => {
          const leakVal = r.leaks ?? 0;
          const helpVal = r.helps ?? 0;
          return (
            <article key={n} className="mr-round-row">
              <b className="mr-rno">R{n.padStart(2,'0')}</b>
              <div className="mr-dual-bars">
                <div className="mr-mini-bar">
                  <small>漏</small>
                  <span className="mr-track"><i className="is-loss" style={{width:leakVal>0?`${Math.max(8,(leakVal/roundScale)*100)}%`:'0%'}}/></span>
                  <b className={r.leaks===0?'is-clean':leakVal>0?'is-loss':''}>{r.leaks===undefined?'—':r.leaks===0?'无漏':r.leaks}</b>
                </div>
                <div className="mr-mini-bar">
                  <small>兜</small>
                  <span className="mr-track"><i className="is-out" style={{width:helpVal>0?`${Math.max(8,(helpVal/roundScale)*100)}%`:'0%'}}/></span>
                  <b className={helpVal>0?'is-out':''}>{helpVal>0?`+${helpVal}`:'0'}</b>
                </div>
                {!!r.boss && <small className="mr-sub">首领 <b>{compactNum(r.boss)}</b></small>}
                {r.note && <small className="mr-sub">{r.note}</small>}
              </div>
            </article>
          );
        })}
      </div>

      {allSpawns.length > 0 && (
        <details className="mr-spawn-fold">
          <summary>漏怪与出怪明细（{allSpawns.length} 项）</summary>
          <div className="mr-spawn-list">
            {allSpawns.map((e, i) => (
              <span key={i} className="mr-spawn-chip"><Enemy id={e.id}/>R{e.round} · {e.name} ×{e.count}</span>
            ))}
          </div>
        </details>
      )}
    </section>}
    {!!count&&<footer><button disabled={busy} onClick={()=>save('image')}><ImageDown size={16}/>保存长图到相册</button><button disabled={busy} onClick={()=>save('document')}><FileDown size={16}/>导出文档</button></footer>}
    {message&&<p role="status">{message}</p>}
  </main>;
}
