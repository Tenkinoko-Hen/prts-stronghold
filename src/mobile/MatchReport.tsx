import {useCallback, useEffect, useRef, useState} from 'react';
import {BookOpen, FileDown, Flag, ImageDown, Plus} from 'lucide-react';
import {RoundSync, type RoundSyncProgress} from './RoundSync';
import atlas from '../desktop/enemyPortraits.json';
import atlasUrl from '../desktop/enemyPortraits.webp';
import catalog from './reportEnemyNames.json';
import './matchReport.css';

type Spawn = {id:string;name:string;batch:number;count:number};
type Row = {ocr?:number; manual?:number; leaks?:number; helps?:number; boss?:number; note?:string;spawns?:Spawn[]};
type Match = {started:number; ended?:number; current?:number; rounds:Record<string,Row>};
type Snapshot = {active?:Match; history?:Match[]; error?:boolean};
declare global { interface Window {
  PRTSJournal?: {snapshot():string;start():boolean;finish(id:string):boolean;record(id:string,round:number,data:string):boolean};
  PRTSFiles?: {save(kind:string,name:string,base64:string):string};
} }
const date = (n:number)=>new Date(n).toLocaleString('zh-CN',{hour12:false});
const fieldNames = {leaks:'全队漏怪',helps:'协防兜底',boss:'Boss 总伤害'} as const;
const fields = ['leaks','helps','boss'] as const;
const sorted = (m:Match)=>Object.entries(m.rounds).sort(([a],[b])=>Number(a)-Number(b));
const source = (r:Row)=>r.ocr ? (r.manual?'回合识别 · 手动补记':'回合识别') : '手动补记';
const allEnemies=Object.entries(catalog).sort((a,b)=>a[1].localeCompare(b[1],'zh-CN'));
const slots=new Map(atlas.ids.map((id,i)=>[id,i]));
const spawnLine=(e:Spawn)=>`第 ${e.batch} 批 · ${e.name} ×${e.count}`;
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
  return <fieldset className="mr-spawn"><legend>出怪列表 · 手动记录</legend>
    {rows.map((e,i)=><div key={i}><Enemy id={e.id}/>{spawnLine(e)}<button type="button" aria-label={`移除${e.name}`} onClick={()=>set(rows.filter((_,j)=>i!==j))}>×</button></div>)}
    <input aria-label="搜索敌人" value={term} placeholder="搜索敌人名称" onChange={e=>search(e.target.value)}/>
    <select aria-label="敌人" value={id??''} onChange={e=>choose(e.target.value)}>{options.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select>
    <label>批次<input aria-label="批次" type="number" min="1" max="30" value={batch} onChange={e=>setBatch(Number(e.target.value))}/></label>
    <label>数量<input aria-label="数量" type="number" min="1" max="9999" value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
    <button type="button" disabled={!id||rows.length>=45||!Number.isInteger(batch)||!Number.isInteger(count)||batch<1||batch>30||count<1||count>9999}
      onClick={()=>{if(id)set([...rows,{id,name:catalog[id as keyof typeof catalog],count,batch}]);}}>添加出怪</button><input type="hidden" name="spawns" value={JSON.stringify(rows)}/>
  </fieldset>;
}
const text = (s:string)=>s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
function lines(m:Match){
  return [
    'PRTS','卫戍协议 · 局内详情战报',`开始 ${date(m.started)}`,
    m.ended?`结束 ${date(m.ended)}`:'对局进行中',`已记录 ${sorted(m).length} 回合`,
    ...sorted(m).flatMap(([n,r])=>[
      `R${n.padStart(2,'0')}   ${source(r)}`,
      fields.map(k=>`${fieldNames[k]} ${r[k]??'—'}`).join('    '),
      ...(r.spawns??[]).map(spawnLine),
      ...(r.note?[r.note]:[])
    ])
  ];
}
async function exportMatch(match:Match,kind:'image'|'document'){
  const rows=lines(match);
  const blob=kind==='document'?new Blob([`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PRTS 局内战报</title><style>body{background:#0c0e11;color:#eceff4;font:15px/1.55 system-ui;max-width:820px;margin:auto;padding:24px}b{color:#e6c828}article{border-top:1px solid #505861;padding:10px 0;break-inside:avoid}p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{background:white;color:black}b{color:black}}</style><b>PRTS</b><h1>卫戍协议 · 局内详情战报</h1>${rows.slice(2,5).map(s=>`<p>${text(s)}</p>`).join('')}${sorted(match).map(([n,r])=>`<article><strong>R${n}　${source(r)}</strong><p>${fields.map(k=>`${fieldNames[k]} ${r[k]??'—'}`).join('　')}</p>${(r.spawns??[]).map(e=>`<p>${text(spawnLine(e))}</p>`).join('')}<p>${text(r.note??'')}</p></article>`).join('')}</html>`],{type:'text/html;charset=utf-8'}):await asImage(rows);
  const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
  return window.PRTSFiles?.save(kind,`PRTS战报_${match.started}-${Date.now()}`,encoded)??'请在安卓安装版中导出';
}
async function asImage(lines:string[]){
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('无法生成图片');
  const items:{label:string;y:number;heading:boolean}[]=[];
  let y=36;
  lines.forEach((line,i)=>{
    const heading=i<2||/^R\d{2} /.test(line);
    ctx.font=heading?'bold 24px sans-serif':'20px sans-serif';
    if(heading)y+=12;
    let part='';
    for(const ch of Array.from(line)){
      if(ch==='\n'||ctx.measureText(part+ch).width>748){
        items.push({label:part,y,heading});y+=31;part='';
      }
      if(ch!=='\n')part+=ch;
    }
    items.push({label:part,y,heading});y+=35;
  });
  const scale=Math.min(1,16000/(y+15));
  canvas.width=Math.ceil(800*scale);canvas.height=Math.ceil((y+15)*scale);
  ctx.fillStyle='#0c0e11';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.scale(scale,scale);
  items.forEach(({label,y,heading},i)=>{ctx.fillStyle=i===0?'#e6c828':heading?'#eceff4':'#b8c1cc';ctx.font=heading?'bold 24px sans-serif':'20px sans-serif';ctx.fillText(label,24,y);});
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片编码失败')),'image/png'));
}

export default function MatchReport({onGuide}:{onGuide():void}){
  const journal=window.PRTSJournal;
  const [snap,setSnap]=useState<Snapshot>({});
  const [selected,select]=useState(0);
  const [round,setRound]=useState(1);
  const [editing,edit]=useState(false);
  const [message,notify]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmEnd,confirm]=useState(false);
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
  const count=match?sorted(match).length:0;
  const previous=match?.rounds?.[round];
  const start=()=>{if(!journal?.start()){notify('无法开始记录，请重试');return;}
    window.PRTSRound?.stop();setRound(1);select(0);edit(false);notify('已开始记录本局');refresh();};
  const save=async(kind:'image'|'document')=>{if(!match||busy)return;setBusy(true);try{notify(await exportMatch(match,kind));}catch{notify('战报导出失败，请重试');}finally{setBusy(false);}};
  return <main className="match-report"><header><strong>PRTS</strong><h1>战报终端</h1><button onClick={onGuide}><BookOpen size={16}/>游戏攻略</button></header>
    <section><div className="mr-bar"><h2>{live?'本局战报':'对局记录'}</h2>
      {active&&<select aria-label="对局" value={selected} onChange={e=>{select(Number(e.target.value));edit(false);confirm(false);}}>
        <option value={0}>{active.ended?'最近对局':'当前对局'}</option>{[...(snap.history??[])].reverse().map(m=><option key={m.started} value={m.started}>{date(m.started)}</option>)}</select>}</div>
      {match ? <p>{date(match.started)} · {match.ended?'已结束':'记录中'} · {count} 个已记录回合</p>:<p>尚无对局记录</p>}
      <div className="mr-actions">{(!active||active.ended)&&<button onClick={start}><Plus size={16}/>开始记录本局</button>}
      {live&&<><RoundSync round={round} progress={progress} onRound={setRound}/><button onClick={()=>confirm(true)}><Flag size={16}/>结束记录</button></>}
      {confirmEnd&&live&&<><button onClick={()=>{if(journal?.finish(String(active.started))){window.PRTSRound?.stop();confirm(false);edit(false);refresh();}else notify('结束记录失败');}}>确认结束本局</button><button onClick={()=>confirm(false)}>继续记录</button></>}</div>
      {snap.error&&<p role="alert">本机战报暂时无法读取</p>}
    </section>
    {match&&<section><div className="mr-bar"><h2>逐回合明细</h2>{live&&<button onClick={()=>edit(!editing)}>{editing?'收起':'手动补记'}</button>}</div>
      {editing&&live&&<form key={`${match.started}-${round}`} onSubmit={e=>{
        e.preventDefault();const form=new FormData(e.currentTarget);
        const data=Object.fromEntries(fields.map(k=>[k,form.get(k)===''?null:Number(form.get(k))]));
        if(!journal?.record(String(match.started),round,JSON.stringify({...data,note:form.get('note'),spawns:JSON.parse(String(form.get('spawns')||'[]'))}))){notify('请至少记录一项数值、出怪或备注');return;}
        edit(false);notify(`R${round} 已保存`);refresh();
      }}><label>回合<select value={round} onChange={e=>setRound(Number(e.target.value))}>{Array.from({length:15},(_,i)=><option key={i} value={i+1}>R{i+1}</option>)}</select></label>
      {fields.map(k=><label key={k}>{fieldNames[k]}<input name={k} type="number" inputMode="numeric" min={0} max={1000000000} step={1} defaultValue={previous?.[k]??''} placeholder="未记录"/></label>)}
      <SpawnEditor initial={previous?.spawns??[]}/><label>备注<textarea name="note" maxLength={400} defaultValue={previous?.note??''}/></label><button>保存本回合</button></form>}
      {count===0&&<p>等待识别游戏回合，或手动补记。</p>}
      {sorted(match).map(([n,r])=><article key={n}><h3>R{n.padStart(2,'0')} <small>{source(r)}</small></h3>
        <div className="mr-stats">{fields.map(k=><label key={k}>{fieldNames[k]}<b>{r[k]??'—'}</b></label>)}</div>
        {!!r.spawns?.length&&<div className="mr-spawn-list"><small>出怪列表 · 手动记录</small>{r.spawns.map((e,i)=><p key={i}><Enemy id={e.id}/>{spawnLine(e)}</p>)}</div>}{r.note&&<p>{r.note}</p>}</article>)}
    </section>}
    {!!count&&<footer><button disabled={busy} onClick={()=>save('image')}><ImageDown size={16}/>保存到相册</button><button disabled={busy} onClick={()=>save('document')}><FileDown size={16}/>下载文档</button></footer>}
    {message&&<p role="status">{message}</p>}
  </main>;
}
