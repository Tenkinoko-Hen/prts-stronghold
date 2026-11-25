// 青逝痕 Tenkinoko 制作
import { exportCount, type ReportSummary } from './battleReportExport';
import { REPORT_BRAND, type ReportBrand } from '../brand/productBrand';
import { formatAxisNumber, niceTicks, PRTS_CHART, PRTS_FONT_NUM, PRTS_FONT_SANS } from './prtsChartKit';
import { formatTelemetryTotal } from './combatTelemetry';
import type { ExportPortraitStrip } from './battleReportPortraits';
import ranks from './reportEnemyRanks.json';

const elite = new Set(ranks.elite), boss = new Set(ranks.boss);
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const html = (text: string) => text.replace(/[&<>"']/g, ch => entities[ch]);
const pctFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
type Round = ReportSummary['rounds'][number];
type BossWave = ReportSummary['bosses'][number];

const SEAT_COLORS: Record<number, string> = {
  1: '#3698CC',
  2: '#D8BF4B',
  3: '#3FA67A',
  4: '#7C85B8',
};

function seatPalette(seat: number, selfSeat: number | null): string {
  if (selfSeat === seat) return PRTS_CHART.ochre;
  return SEAT_COLORS[seat] ?? PRTS_CHART.blue;
}

function leakValue(metric: ReportSummary['net']) {
  const value = exportCount(metric);
  return metric && metric.value > 0 && metric.quality !== 'estimated' ? `<span class="loss">${value}</span>` : value;
}

function sectionHead(n: number, title: string, note = '') {
  return `<header class="section-head"><h2><span class="section-no" aria-hidden="true">0${n}</span><span class="prts-slash" aria-hidden="true">//</span>${title}</h2>${note ? `<p>${html(note)}</p>` : ''}</header>`;
}

function operatorIconHtml(
  name: string,
  opSlots: Map<string, number>,
  opCount: number,
  sizeClass = '',
  golden = false,
) {
  const slot = opSlots.get(name);
  const cls = `op-ico${sizeClass ? ` ${sizeClass}` : ''}${golden ? ' is-gold' : ''}`;
  if (slot !== undefined && opCount > 0) {
    const pos = opCount > 1 ? (slot * 100) / (opCount - 1) : 0;
    return `<i class="${cls}" style="background-position:${pos}% 0" title="${html(name)}${golden ? '★' : ''}" aria-hidden="true"></i>`;
  }
  const clean = name.replace(/["“”'‘’「」『』]/g, '').trim();
  const mono = clean.slice(0, 1) || '?';
  return `<i class="${cls} is-fallback" title="${html(name)}${golden ? '★' : ''}" aria-hidden="true">${html(mono)}</i>`;
}

function roundPressureChartSvg(rounds: Round[]) {
  if (rounds.length < 2) return '';
  const points = rounds.map(r => ({
    round: r.number,
    leak: r.gross?.value ?? 0,
    help: r.helps?.value ?? 0,
    breached: r.tone === 'breached',
  }));
  const maxVal = Math.max(2, ...points.flatMap(p => [p.leak, p.help]));
  const scale = niceTicks(maxVal, 3);
  const w = 860;
  const h = 114;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const slotW = plotW / points.length;
  const barW = Math.min(13, Math.max(4, slotW * 0.28));

  const grids = scale.ticks.map(t => {
    const y = padT + plotH - (t / scale.top) * plotH;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="${t === 0 ? PRTS_CHART.axisLine : PRTS_CHART.gridLine}" stroke-width="1"${t === 0 ? '' : ' stroke-dasharray="2 3"'} /><text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="${PRTS_CHART.labelMuted}" font-size="9.5" font-family="${PRTS_FONT_NUM}">${formatAxisNumber(t)}</text>`;
  }).join('');

  const cols = points.map((p, i) => {
    const cx = padL + slotW * (i + 0.5);
    const lh = p.leak > 0 ? Math.max(2.5, (p.leak / scale.top) * plotH) : 0;
    const hh = p.help > 0 ? Math.max(2.5, (p.help / scale.top) * plotH) : 0;
    const ly = padT + plotH - lh;
    const hy = padT + plotH - hh;
    const bg = p.breached
      ? `<rect x="${(cx - slotW * 0.42).toFixed(1)}" y="${padT}" width="${(slotW * 0.84).toFixed(1)}" height="${plotH}" fill="rgba(214,72,64,0.08)" />`
      : '';
    const lBar = lh > 0
      ? `<rect x="${(cx - barW - 1).toFixed(1)}" y="${ly.toFixed(1)}" width="${barW.toFixed(1)}" height="${lh.toFixed(1)}" fill="${PRTS_CHART.crimson}" rx="1" /><text x="${(cx - barW / 2 - 1).toFixed(1)}" y="${(ly - 3).toFixed(1)}" text-anchor="middle" fill="#f08680" font-size="9" font-weight="700" font-family="${PRTS_FONT_NUM}">${p.leak}</text>`
      : '';
    const hBar = hh > 0
      ? `<rect x="${(cx + 1).toFixed(1)}" y="${hy.toFixed(1)}" width="${barW.toFixed(1)}" height="${hh.toFixed(1)}" fill="${PRTS_CHART.blue}" rx="1" /><text x="${(cx + barW / 2 + 1).toFixed(1)}" y="${(hy - 3).toFixed(1)}" text-anchor="middle" fill="#6eb7df" font-size="9" font-weight="700" font-family="${PRTS_FONT_NUM}">${p.help}</text>`
      : '';
    return `${bg}${lBar}${hBar}<text x="${cx.toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="${PRTS_CHART.labelMuted}" font-size="9.5" font-family="${PRTS_FONT_NUM}">R${p.round}</text>`;
  }).join('');

  return `<div class="chart-card"><div class="chart-head"><span><b class="prts-slash">//</b>各回合漏怪与协防态势</span><div class="chart-legend"><span><i class="swatch-leak"></i>全队漏怪</span><span><i class="swatch-help"></i>全队协防</span></div></div><svg viewBox="0 0 ${w} ${h}" class="prts-svg" role="img" aria-label="各回合漏怪与协防柱状图">${grids}${cols}</svg></div>`;
}

function playerTable(r: ReportSummary, opSlots: Map<string, number>, opCount: number) {
  const showBoss = r.bosses.length > 0;
  const rows = r.solo ? r.players.slice(0, 1) : r.players;
  return `<table class="players${showBoss ? '' : ' no-boss'}" aria-label="${r.solo ? '单兵战绩总览' : '四人战绩总览'}"><colgroup><col class="identity-col"><col><col><col class="ratio-col">${showBoss ? '<col class="damage-col">' : ''}</colgroup>
<thead><tr><th scope="col">席位与阵容</th><th scope="col">累计漏怪</th><th scope="col">累计协防</th><th scope="col">零漏占比</th>${showBoss ? '<th scope="col">Boss 输出</th>' : ''}</tr></thead>
<tbody>${rows.map(p => {
    const metaParts = [p.shopLevel ? `${p.shopLevel}本` : '', p.strategist].filter(Boolean);
    const lineupHtml = p.deployed?.length
      ? `<div class="player-lineup">${p.deployed.map(u => operatorIconHtml(u.name, opSlots, opCount, 'is-sm', u.isGolden)).join('')}</div>`
      : '';
    const ratioBar = p.cleanPct !== null
      ? `<span class="mini-bar" aria-hidden="true"><i style="width:${Math.min(100, p.cleanPct).toFixed(1)}%"></i></span>`
      : '';
    return `<tr data-seat="${p.seat}"${p.self ? ' data-self="true"' : ''}${p.eliminatedRound !== undefined ? ' data-elim="true"' : ''}><th scope="row"><div class="identity"><span class="seat-index">${p.seat}号</span><bdi>${html(p.name)}</bdi>${p.self ? '<small class="self-mark">我</small>' : ''}${p.eliminatedRound !== undefined ? `<small class="elim-mark">R${p.eliminatedRound}阵亡</small>` : ''}${p.top ? `<small class="top-mark">${html(p.top)}</small>` : ''}</div>${metaParts.length || lineupHtml ? `<div class="identity-sub">${lineupHtml}${metaParts.length ? `<span class="identity-meta">${html(metaParts.join(' · '))}</span>` : ''}</div>` : ''}</th>
<td>${leakValue(p.leaks)}</td><td>${exportCount(p.helps)}</td><td><div class="ratio-cell"><span>${html(p.cleanRatio).replace(/（\d+\/\d+）$/, '<wbr><span class="ratio-base">$&</span>')}</span>${ratioBar}</div></td>${showBoss ? `<td>${exportCount(p.boss)}</td>` : ''}</tr>`;
  }).join('')}</tbody></table>`;
}

function bossDonutSvg(
  slices: Array<{ label: string; value: number; color: string }>,
  centerVal: string,
  centerSub: string,
) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  const r = 34;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total > 0 ? slices.map(slice => {
    const ratio = slice.value / total;
    const dash = Math.max(0, ratio * circ - (slices.length > 1 ? 1.4 : 0));
    const cur = offset;
    offset += ratio * circ;
    return `<circle cx="48" cy="48" r="${r}" fill="none" stroke="${slice.color}" stroke-width="9" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-cur).toFixed(2)}" transform="rotate(-90 48 48)" />`;
  }).join('') : '';
  return `<svg viewBox="0 0 96 96" class="boss-donut" role="img" aria-label="${html(centerSub)} ${html(centerVal)}"><circle cx="48" cy="48" r="43" fill="none" stroke="#222a36" stroke-width="1" stroke-dasharray="2 4" /><circle cx="48" cy="48" r="${r}" fill="none" stroke="#181f2a" stroke-width="9" />${arcs}<text x="48" y="46" text-anchor="middle" fill="${PRTS_CHART.labelStrong}" font-size="12.5" font-weight="700" font-family="${PRTS_FONT_NUM}">${html(centerVal)}</text><text x="48" y="58" text-anchor="middle" fill="${PRTS_CHART.labelMuted}" font-size="8.5" font-family="${PRTS_FONT_SANS}">${html(centerSub)}</text></svg>`;
}

function bossSection(
  r: ReportSummary,
  opSlots: Map<string, number>,
  opCount: number,
) {
  const waves = r.bosses;
  if (!waves.length) return '';
  const selfSeat = r.players.find(p => p.self)?.seat ?? null;
  const seatNames = new Map<number, string>(r.players.map(p => [p.seat, p.name]));
  const sources = new Set(waves.flatMap(w => w.seats.map(s => s.source)));
  const note = `数据口径：${sources.size === 1 ? [...sources][0] : '分席位记录'}`;
  return `<section>${sectionHead(2, 'Boss 伤害剖析', note)}<div class="boss-grid">${waves.map(w => {
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

    const totalNum = w.total?.value ?? 0;
    const bossHp = w.bossHp ?? null;
    const hpDepletedPct = bossHp && bossHp > 0 ? Math.min(100, (totalNum / bossHp) * 100) : null;

    // Segmented Boss HP bar
    let hpBarHtml = '';
    if (bossHp && bossHp > 0 && hpDepletedPct !== null) {
      const rawSegs = w.seats
        .filter(s => (s.damage?.value ?? 0) > 0)
        .sort((a, b) => (b.damage?.value ?? 0) - (a.damage?.value ?? 0));
      const rawPctSum = rawSegs.reduce((acc, s) => acc + ((s.damage?.value ?? 0) / bossHp) * 100, 0);
      const scale = rawPctSum > 100 ? 100 / rawPctSum : 1;
      const segsHtml = rawSegs.map(s => {
        const truePct = ((s.damage?.value ?? 0) / bossHp) * 100;
        const wPct = truePct * scale;
        const label = seatNames.get(s.seat) || `${s.seat}号`;
        return `<span class="seg-fill" style="width:${wPct.toFixed(2)}%;background:${seatPalette(s.seat, selfSeat)}">${wPct >= 15 ? `<em>${html(label)} ${pctFmt.format(truePct)}%</em>` : ''}</span>`;
      }).join('');
      const remPct = w.defeated ? 0 : Math.max(0, 100 - Math.min(100, rawPctSum * scale));
      hpBarHtml = `<div class="boss-hp-wrap"><div class="boss-hp-head"><span>首领削血分布</span><b>${w.defeated ? '100% · 已击破' : `已削血 ${pctFmt.format(hpDepletedPct)}% · 首领血量 ${formatTelemetryTotal(bossHp)}`}</b></div><div class="seg-track">${segsHtml}${remPct > 0 ? `<span class="seg-rem" style="width:${remPct.toFixed(2)}%">${remPct >= 15 ? `<em>剩余 ${pctFmt.format(remPct)}%</em>` : ''}</span>` : ''}</div><div class="seg-ruler"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div></div>`;
    }

    // Donut slices (solo with operators -> operator donut; coop -> seat donut)
    const ops = w.operators ?? [];
    const donutSlices = r.solo && ops.length > 0
      ? ops.slice(0, 5).map((op, i) => ({ label: op.name, value: op.damage, color: PRTS_CHART.series[i % PRTS_CHART.series.length] }))
      : w.seats
          .filter(s => (s.damage?.value ?? 0) > 0)
          .sort((a, b) => (b.damage?.value ?? 0) - (a.damage?.value ?? 0))
          .map(s => ({ label: `${s.seat}号`, value: s.damage?.value ?? 0, color: seatPalette(s.seat, selfSeat) }));
    const centerVal = w.defeated ? '100%'
      : hpDepletedPct !== null ? `${pctFmt.format(hpDepletedPct)}%`
        : totalNum > 0 ? formatTelemetryTotal(totalNum) : '—';
    const centerSub = hpDepletedPct !== null ? '削血进度' : '累计输出';

    // Operator breakdown bars with embedded avatars
    const opMax = Math.max(1, ...ops.map(o => o.damage));
    const opScale = niceTicks(opMax, 3);
    const opsHtml = ops.length > 0
      ? `<div class="boss-ops"><div class="boss-ops-head"><span>参战干员输出排行（Top ${Math.min(6, ops.length)}）</span><small>${ops.length} 名参战</small></div>${ops.slice(0, 6).map((op, i) => {
          const barW = Math.max(3, (op.damage / opScale.top) * 100);
          const color = r.solo ? PRTS_CHART.series[i % PRTS_CHART.series.length] : seatPalette(op.seat, selfSeat);
          return `<div class="boss-op-row"><span class="op-rank">#0${i + 1}</span>${operatorIconHtml(op.name, opSlots, opCount, 'is-md')}<span class="op-ident"><b>${html(op.name)}</b>${!r.solo ? `<small>${html(seatNames.get(op.seat) || `${op.seat}号`)}</small>` : ''}</span><span class="op-track"><i style="width:${barW.toFixed(1)}%;background:${color}"></i></span><span class="op-nums"><b>${html(op.damageText)}</b><small>${html(op.shareText)}</small></span></div>`;
        }).join('')}</div>`
      : '';

    const visibleSeats = r.solo ? w.seats.slice(0, 1) : w.seats;
    const seatRowsHtml = visibleSeats.map(s => {
      const color = seatPalette(s.seat, selfSeat);
      return `<div class="damage" data-seat="${s.seat}"><span class="damage-seat"><i class="seat-dot" style="background:${color}" aria-hidden="true"></i>${s.seat}号</span><span class="track${s.share === null ? ' missing' : ''}" aria-hidden="true">${s.share === null ? '' : `<i style="width:${Math.min(100, s.share)}%;background:${color}"></i>`}</span><span class="share">${html(s.shareText)}</span><strong>${exportCount(s.damage)}</strong></div>`;
    }).join('');

    return `<article class="boss-wave${ops.length ? ' has-ops' : ''}"><header><h3><span class="wave-no">R${w.number}</span>${html(w.name)}${w.defeated ? '<small class="win-mark">已击破</small>' : ''}</h3><span>全队总伤 <strong>${exportCount(w.total)}</strong></span></header>
${hpBarHtml}
<div class="boss-body"><div class="boss-seat-panel">${donutSlices.length > 0 ? bossDonutSvg(donutSlices, centerVal, centerSub) : ''}<div class="boss-seat-list">${seatRowsHtml}</div></div>${opsHtml}</div>
${notes.map(n => `<p class="wave-note">${html(n)}</p>`).join('')}</article>`;
  }).join('')}</div></section>`;
}

function telemetrySection(
  r: ReportSummary,
  sectionNumber: number,
  opSlots: Map<string, number>,
  opCount: number,
) {
  if (!r.telemetryOperators?.length) return '';
  return `<section>${sectionHead(sectionNumber, '干员伤害统计明细', '按局内实际交战帧计算秒伤，自动排除暂停与倍速影响')}<table class="tele-table" aria-label="干员伤害统计明细">
<thead><tr><th scope="col">干员</th><th scope="col">属性构成</th><th scope="col">输出占比</th><th scope="col">激战秒伤</th><th scope="col">累计输出</th></tr></thead>
<tbody>${r.telemetryOperators.map((op, i) => {
    const barColor = i === 0 ? PRTS_CHART.ochre : PRTS_CHART.blue;
    return `<tr><th scope="row"><div class="tele-op-cell">${operatorIconHtml(op.name, opSlots, opCount, 'is-md')}<span>${html(op.name)}${!r.solo && op.seat ? ` <small class="ratio-base">${op.seat}号</small>` : ''}</span></div></th><td class="tele-chan">${html(op.channelsText)}</td><td><div class="tele-share-cell"><span class="mini-bar" aria-hidden="true"><i style="width:${Math.min(100, op.sharePercent).toFixed(1)}%;background:${barColor}"></i></span><span>${html(op.shareText)}</span></div></td><td>${html(op.activeDpsText)}</td><td><strong>${html(op.totalText)}</strong></td></tr>`;
  }).join('')}</tbody></table></section>`;
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

function enemyGroups(row: Round, iconSlots: Map<string, number>, iconCount: number) {
  const leaked = row.enemies.find(g => g.label === '漏怪'), helped = row.enemies.find(g => g.label === '协防');
  // 两组均已按怪种 ID 汇总；未知怪种或数量不同，不能当作同一批。
  const identical = leaked && helped && leaked.kinds.length === helped.kinds.length
    && leaked.kinds.every(e => e.id && helped.kinds.some(h => h.id === e.id && h.count === e.count));
  return row.enemies.filter(g => !(identical && g === helped)).map(g => {
    const label = identical && g === leaked ? (row.tone === 'covered' ? '' : '漏怪及协防') : g.label;
    return `<div class="kinds">${label ? `<small>${html(label)}</small>` : ''}${g.kinds.map(e => {
      const rank = boss.has(e.id) ? 'boss' : elite.has(e.id) ? 'elite' : '';
      const slot = e.id ? iconSlots.get(e.id) : undefined;
      const icon = slot !== undefined
        ? `<i class="enemy-ico" style="background-position:${iconCount > 1 ? slot * 100 / (iconCount - 1) : 0}% 0" aria-hidden="true"></i>`
        : '';
      return `<span${rank ? ` title="${rank === 'boss' ? '首领' : '精英'}"` : ''} class="enemy${rank ? ` ${rank}` : ''}">${icon}<span>${html(e.name)}</span><b>×${e.count}</b></span>`;
    }).join('')}</div>`;
  }).join('');
}

function roundRow(row: Round, iconSlots: Map<string, number>, iconCount: number) {
  const number = `<th scope="row" class="round">R${row.number}</th>`;
  if (row.tone === 'clean' && !row.links.length && !row.enemies.length)
    return `<tr class="quiet">${number}<td colspan="3"><span class="outcome clean">${html(row.label)}</span><span class="quiet-note">四路零漏，未触发协防</span></td></tr>`;
  const lanes = laneEvents(row), enemies = enemyGroups(row, iconSlots, iconCount);
  const links = row.links.length ? `<ul>${row.links.map(link => `<li>${html(link)}</li>`).join('')}</ul>` : '';
  return `<tr>${number}<td class="situation"><b class="outcome ${row.tone}">${html(row.label)}</b>${lanes ? `<div class="lanes">${lanes}</div>` : ''}</td>
<td class="${links ? 'details' : 'empty'}" data-col="协防链路">${links || '—'}</td><td class="${enemies ? 'details' : 'empty'}" data-col="怪种明细">${enemies || '—'}</td></tr>`;
}

export function renderBattleReportHtml(
  r: ReportSummary,
  css: string,
  brand: ReportBrand = REPORT_BRAND,
  portraits?: ExportPortraitStrip,
) {
  const kpis = [
    ['记录回合', r.rounds.length],
    ['全队零漏', r.clean],
    ['总漏怪', leakValue(r.gross)],
    ['总协防', exportCount(r.helps)],
    ['最终净漏', leakValue(r.net)],
  ];
  const iconSlots = new Map((portraits?.ids ?? []).map((id, i) => [id, i]));
  const iconCount = portraits?.ids.length ?? 0;
  const opSlots = new Map((portraits?.opNames ?? []).map((name, i) => [name, i]));
  const opCount = portraits?.opNames?.length ?? 0;
  const enemyPortraitCss = iconCount && portraits?.dataUrl
    ? `\n.enemy-ico{display:inline-block;width:22px;height:22px;flex:none;border-radius:2px;background-image:url("${portraits.dataUrl}");background-size:${iconCount * 100}% 100%;background-repeat:no-repeat}`
    : '';
  const opPortraitCss = opCount && portraits?.opDataUrl
    ? `\n.op-ico{background-image:url("${portraits.opDataUrl}");background-size:${opCount * 100}% 100%;background-repeat:no-repeat}`
    : '';
  const legend = r.hasPartial
    ? '注：部分回合缺少全队完整结算，汇总为已记录数据合计（≥ 为已知下限，— 为未记录）。零漏占比仅计本席已确认回合。'
    : '注：— 为未记录，≥ 为已知下限。零漏占比仅计本席漏怪数已确认的回合。';
  let nextSection = 2;
  const bossHtml = bossSection(r, opSlots, opCount);
  if (r.bosses.length) nextSection++;
  const hasTelemetry = Boolean(r.telemetryOperators?.length);
  const teleHtml = hasTelemetry ? telemetrySection(r, r.soloStage ? 1 : nextSection++, opSlots, opCount) : '';
  const pressureSvg = !r.soloStage ? roundPressureChartSvg(r.rounds) : '';
  const bodySections = r.soloStage
    ? teleHtml
    : `<section>${sectionHead(1, r.solo ? '单兵战绩总览' : '四人战绩总览')}${playerTable(r, opSlots, opCount)}${pressureSvg}<p class="legend">${legend}</p></section>
${bossHtml}
${teleHtml}<section>${sectionHead(nextSection, '逐回合实战与协防明细')}<table class="rounds" aria-label="逐回合实战与协防明细"><colgroup><col class="c-round"><col class="c-lanes"><col class="c-links"><col></colgroup>
<thead><tr><th scope="col">回合</th><th scope="col">战况与席位</th><th scope="col">全部协防链路</th><th scope="col">怪种明细</th></tr></thead><tbody>${r.rounds.map(row => roundRow(row, iconSlots, iconCount)).join('')}</tbody></table></section>`;
  return `<!doctype html>
<!-- 青逝痕 Tenkinoko 制作 -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>${html(r.title)} · ${html(r.name)}</title><style>${css}${enemyPortraitCss}${opPortraitCss}</style></head><body><main>
<header class="mast"><div><div class="brand"><b>${html(brand.name)}</b><span>/ 作战归档</span>${r.difficulty ? `<em class="diff-chip">${html(r.difficulty)}</em>` : ''}</div><h1>${html(r.title)}</h1>
<div class="meta"><strong>${html(r.name)}</strong><span>开始时间 <time>${html(r.start)}</time></span><span>导出时间 <time>${html(r.exported)}</time></span></div></div>
<dl class="kpis" aria-label="对局概览">${kpis.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></header>
${bodySections}
<footer>${html(brand.footer)}</footer></main></body></html>`;
}
