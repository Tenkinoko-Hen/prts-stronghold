import { exportCount, type ReportSummary } from './battleReportExport';
import { REPORT_BRAND, type ReportBrand } from '../brand/productBrand';
import ranks from './reportEnemyRanks.json';

const elite = new Set(ranks.elite), boss = new Set(ranks.boss);
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const html = (text: string) => text.replace(/[&<>"']/g, ch => entities[ch]);
const legend = '— 未记录 · * 部分记录 · ≥ 已知下限 · ≈ 估算。零漏占比只计本席漏怪数已确认的回合。';
type Round = ReportSummary['rounds'][number];
type BossWave = ReportSummary['bosses'][number];

function leakValue(metric: ReportSummary['net']) {
  const value = exportCount(metric);
  return metric && metric.value > 0 && metric.quality !== 'estimated' ? `<span class="loss">${value}</span>` : value;
}

function sectionHead(n: number, title: string, note = '') {
  return `<header class="section-head"><h2><span class="section-no" aria-hidden="true">0${n}</span>${title}</h2>${note ? `<p>${html(note)}</p>` : ''}</header>`;
}

function playerTable(r: ReportSummary) {
  return `<table class="players" aria-label="四人战绩总览"><colgroup><col class="identity-col"><col><col><col class="ratio-col"><col class="damage-col"></colgroup>
<thead><tr><th scope="col">席位与干员</th><th scope="col">累计<wbr><span>漏怪</span></th><th scope="col">累计<wbr><span>协防</span></th><th scope="col">零漏占比</th><th scope="col">Boss 输出</th></tr></thead>
<tbody>${r.players.map(p => `<tr data-seat="${p.seat}"><th scope="row"><div class="identity"><span class="seat-index">${p.seat}号</span><bdi>${html(p.name)}</bdi>${p.self ? '<small class="self-mark">我</small>' : ''}${p.top ? `<small class="top-mark">${html(p.top)}</small>` : ''}</div></th>
<td>${leakValue(p.leaks)}</td><td>${exportCount(p.helps)}</td><td>${html(p.cleanRatio).replace(/（\d+\/\d+）$/, '<wbr><span class="ratio-base">$&</span>')}</td><td>${exportCount(p.boss)}</td></tr>`).join('')}</tbody></table>`;
}

function bossSection(waves: BossWave[]) {
  if (!waves.length) return '';
  const sources = new Set(waves.flatMap(w => w.seats.map(s => s.source)));
  const note = `数据口径：${sources.size === 1 ? [...sources][0] : '分席位记录'}`;
  return `<section>${sectionHead(2, 'Boss 伤害分布', note)}<div class="boss-grid">${waves.map(w => {
    const notes: string[] = [];
    if (sources.size > 1) {
      const bySource = new Map<string, number[]>();
      for (const s of w.seats) {
        const seats = bySource.get(s.source) ?? [];
        seats.push(s.seat);
        bySource.set(s.source, seats);
      }
      notes.push([...bySource].map(([source, seats]) => bySource.size === 1 ? source : `${source}：${seats.join('、')}号`).join(' · '));
    }
    const hp = w.seats.flatMap(s => s.hpShare === null ? [] : [`${s.seat}号 ${s.hpShare}`]);
    if (hp.length) notes.push(`占 Boss 血量：${hp.join(' · ')}`);
    if (w.inferred) notes.push('回合归属待校正');
    return `<article class="boss-wave"><header><h3><span class="wave-no">R${w.number}</span>${html(w.name)}</h3><span>全队总伤 <strong>${exportCount(w.total)}</strong></span></header>
${w.seats.map(s => `<div class="damage" data-seat="${s.seat}"><span class="damage-seat"><i class="seat-dot" aria-hidden="true"></i>${s.seat}号</span><span class="track${s.share === null ? ' missing' : ''}" aria-hidden="true">${s.share === null ? '' : `<i style="width:${Math.min(100, s.share)}%"></i>`}</span><span class="share">${html(s.shareText)}</span><strong>${exportCount(s.damage)}</strong></div>`).join('')}
${notes.map(n => `<p class="wave-note">${html(n)}</p>`).join('')}</article>`;
  }).join('')}</div></section>`;
}

function laneEvents(row: Round) {
  return row.lanes.flatMap(l => {
    const parts: string[] = [];
    if (l.leaks && l.leaks.value > 0) parts.push(`漏${leakValue(l.leaks)}`);
    if (l.helps && l.helps.value > 0) {
      const plus = l.helps.quality === 'estimated' || l.helps.quality === 'minimum' ? '' : '+';
      parts.push(`协${plus}${exportCount(l.helps)}`);
    }
    return parts.length ? [`<span class="lane">${l.seat}号 ${parts.join(' ')}</span>`] : [];
  }).join(' · ');
}

function enemyGroups(row: Round) {
  const leaked = row.enemies.find(g => g.label === '漏怪'), helped = row.enemies.find(g => g.label === '协防');
  // 两组均已按怪种 ID 汇总；未知怪种或数量不同，不能当作同一批。
  const identical = leaked && helped && leaked.kinds.length === helped.kinds.length
    && leaked.kinds.every(e => e.id && helped.kinds.some(h => h.id === e.id && h.count === e.count));
  return row.enemies.filter(g => !(identical && g === helped)).map(g => {
    const label = identical && g === leaked ? (row.tone === 'covered' ? '' : '漏怪及协防') : g.label;
    return `<div class="kinds">${label ? `<small>${html(label)}</small>` : ''}${g.kinds.map(e => {
      const rank = boss.has(e.id) ? 'boss' : elite.has(e.id) ? 'elite' : '';
      return `<span${rank ? ` title="${rank === 'boss' ? '首领' : '精英'}"` : ''} class="enemy${rank ? ` ${rank}` : ''}">${html(e.name)}<b>×${e.count}</b></span>`;
    }).join('')}</div>`;
  }).join('');
}

function roundRow(row: Round) {
  const number = `<th scope="row" class="round">R${row.number}</th>`;
  if (row.tone === 'clean' && !row.links.length && !row.enemies.length)
    return `<tr class="quiet">${number}<td colspan="3"><span class="outcome">${html(row.label)}</span><span class="quiet-note">四路零漏，未触发协防</span></td></tr>`;
  const lanes = laneEvents(row), enemies = enemyGroups(row);
  const links = row.links.length ? `<ul>${row.links.map(link => `<li>${html(link)}</li>`).join('')}</ul>` : '';
  return `<tr>${number}<td class="situation"><b class="outcome ${row.tone}">${html(row.label)}</b>${lanes ? `<div class="lanes">${lanes}</div>` : ''}</td>
<td class="${links ? 'details' : 'empty'}" data-col="协防链路">${links || '—'}</td><td class="${enemies ? 'details' : 'empty'}" data-col="怪种明细">${enemies || '—'}</td></tr>`;
}

export function renderBattleReportHtml(r: ReportSummary, css: string, brand: ReportBrand = REPORT_BRAND) {
  const kpis = [['记录回合', r.rounds.length], ['全队零漏', r.clean],
    ['漏怪 / 协防', `${leakValue(r.gross)}<span class="slash"> / </span>${exportCount(r.helps)}`], ['最终净漏', leakValue(r.net)]];
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${html(r.title)} · ${html(r.name)}</title><style>${css}</style></head><body><main>
<header class="mast"><div><div class="brand"><b>${html(brand.name)}</b><span>/ 作战归档</span></div><h1>${html(r.title)}</h1>
<div class="meta"><strong>${html(r.name)}</strong><span>开始时间（首次记录） <time>${html(r.start)}</time></span><span>导出时间 <time>${html(r.exported)}</time></span></div></div>
<dl class="kpis" aria-label="对局概览">${kpis.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></header>
<section>${sectionHead(1, '四人战绩总览')}${playerTable(r)}<p class="legend">${legend}</p></section>
${bossSection(r.bosses)}
<section>${sectionHead(r.bosses.length ? 3 : 2, '逐回合实战与协防明细')}<table class="rounds" aria-label="逐回合实战与协防明细"><colgroup><col class="c-round"><col class="c-lanes"><col class="c-links"><col></colgroup>
<thead><tr><th scope="col">回合</th><th scope="col">战况与席位</th><th scope="col">全部协防链路</th><th scope="col">怪种明细</th></tr></thead><tbody>${r.rounds.map(roundRow).join('')}</tbody></table></section>
<footer>${html(brand.footer)}</footer></main></body></html>`;
}
