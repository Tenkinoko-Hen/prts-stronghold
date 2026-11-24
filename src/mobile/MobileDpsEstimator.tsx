// 青逝痕 Tenkinoko 制作
import { useState } from 'react';
import { BOSS_ENCOUNTERS } from '../data/bossEncounterData';

interface OperatorPreset {
  name: string;
  damageType: 'physical' | 'arts' | 'true';
  baseAtk: number;
  skillMultiplier: number;
  hitsPerAttack: number;
  interval: number;
}

const OPERATOR_PRESETS: readonly OperatorPreset[] = [
  { name: '维什戴尔（S3 爆裂黎明）', damageType: 'physical', baseAtk: 845, skillMultiplier: 2.2, hitsPerAttack: 3, interval: 2.8 },
  { name: '逻各斯（S3 延展死线）', damageType: 'arts', baseAtk: 810, skillMultiplier: 2.85, hitsPerAttack: 1, interval: 1.6 },
  { name: '锏（S3 归于宁静·爆发折算）', damageType: 'physical', baseAtk: 742, skillMultiplier: 2.6, hitsPerAttack: 2, interval: 1.25 },
  { name: '涤火杰西卡（S3 机动盾炮）', damageType: 'physical', baseAtk: 760, skillMultiplier: 2.1, hitsPerAttack: 1, interval: 1.5 },
  { name: '史尔特尔（S3 黄昏）', damageType: 'arts', baseAtk: 895, skillMultiplier: 4.3, hitsPerAttack: 1, interval: 1.25 },
  { name: '玛恩纳（S3 未照耀的荣光）', damageType: 'physical', baseAtk: 455, skillMultiplier: 4.6, hitsPerAttack: 1, interval: 1.2 },
  { name: '仇白（S3 问雪·附法混伤折算）', damageType: 'arts', baseAtk: 765, skillMultiplier: 1.95, hitsPerAttack: 2, interval: 1.3 },
  { name: '耀骑士临光（S2/S3 真伤基准）', damageType: 'true', baseAtk: 860, skillMultiplier: 2.4, hitsPerAttack: 1, interval: 1.5 },
];

export function computeEffectiveDps(params: {
  damageType: 'physical' | 'arts' | 'true';
  baseAtk: number;
  covenantAtkPct: number;
  skillMultiplier: number;
  hitsPerAttack: number;
  interval: number;
  enemyDef: number;
  enemyRes: number;
  defShredPct: number;
  resShredFlat: number;
}) {
  const interval = Math.max(0.2, params.interval);
  const hits = Math.max(1, params.hitsPerAttack);
  const rawHit = Math.max(1, params.baseAtk * (1 + params.covenantAtkPct / 100) * params.skillMultiplier);
  const effDef = Math.max(0, params.enemyDef * (1 - Math.min(100, Math.max(0, params.defShredPct)) / 100));
  const effRes = Math.min(95, Math.max(0, params.enemyRes - Math.max(0, params.resShredFlat)));

  const minFloor = rawHit * 0.05;
  let postHit = rawHit;
  let polishing = false;
  if (params.damageType === 'physical') {
    const diff = rawHit - effDef;
    if (diff <= minFloor) {
      postHit = minFloor;
      polishing = true;
    } else {
      postHit = diff;
    }
  } else if (params.damageType === 'arts') {
    postHit = Math.max(minFloor, rawHit * (1 - effRes / 100));
    polishing = effRes >= 75;
  }

  const rawDps = (rawHit * hits) / interval;
  const effectiveDps = (postHit * hits) / interval;
  const mitigationLossPct = rawDps > 0 ? Math.max(0, (1 - effectiveDps / rawDps) * 100) : 0;

  return {
    rawHit: Math.round(rawHit),
    postHit: Math.round(postHit),
    rawDps: Math.round(rawDps),
    effectiveDps: Math.round(effectiveDps),
    mitigationLossPct: Math.round(mitigationLossPct * 10) / 10,
    polishing,
    breakthroughAtkNeeded: params.damageType === 'physical' ? Math.ceil(effDef / Math.max(0.1, params.skillMultiplier)) : 0,
  };
}

export function MobileDpsEstimator() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [bossIdx, setBossIdx] = useState(0);
  const [bossRound, setBossRound] = useState<14 | 15>(14);
  const [covenantAtkPct, setCovenantAtkPct] = useState(120);
  const [defShredPct, setDefShredPct] = useState(0);
  const [resShredFlat, setResShredFlat] = useState(0);

  const preset = OPERATOR_PRESETS[presetIdx] ?? OPERATOR_PRESETS[0];
  const boss = BOSS_ENCOUNTERS[bossIdx] ?? BOSS_ENCOUNTERS[0];
  const wave = boss.rounds[bossRound] ?? boss.rounds[14];
  const [bossHp, , bossDef, bossRes] = wave.stats;

  const result = computeEffectiveDps({
    damageType: preset.damageType,
    baseAtk: preset.baseAtk,
    covenantAtkPct,
    skillMultiplier: preset.skillMultiplier,
    hitsPerAttack: preset.hitsPerAttack,
    interval: preset.interval,
    enemyDef: bossDef,
    enemyRes: bossRes,
    defShredPct,
    resShredFlat,
  });

  const killSeconds = result.effectiveDps > 0 ? Math.round((bossHp / result.effectiveDps) * 10) / 10 : null;

  return (
    <section className="m-card" aria-label="移动端实效秒伤与折损推演">
      <h2>实效秒伤与护甲折损推演</h2>
      <p className="m-footnote">免 Root 离线推演核心C位对首领折后秒伤与物理抛光阈值。</p>

      <label className="m-field">
        主力干员模板
        <select value={presetIdx} onChange={e => setPresetIdx(Number(e.target.value))}>
          {OPERATOR_PRESETS.map((op, i) => (
            <option key={op.name} value={i}>{op.name}</option>
          ))}
        </select>
      </label>

      <label className="m-field">
        目标首领
        <select value={bossIdx} onChange={e => setBossIdx(Number(e.target.value))}>
          {BOSS_ENCOUNTERS.map((b, i) => (
            <option key={b.id} value={i}>{b.name}</option>
          ))}
        </select>
      </label>

      <div className="m-chips">
        {([14, 15] as const).map(r => (
          <button key={r} type="button" aria-pressed={bossRound === r} onClick={() => setBossRound(r)}>
            R{r}（防 {boss.rounds[r]?.stats[2] ?? bossDef} / 法抗 {boss.rounds[r]?.stats[3] ?? bossRes}）
          </button>
        ))}
      </div>

      <div className="m-number-grid">
        <label className="m-field">
          盟约与藏品加攻(%)
          <input
            type="number"
            min={0}
            max={1500}
            value={covenantAtkPct}
            onChange={e => setCovenantAtkPct(Math.max(0, Math.min(1500, Number(e.target.value) || 0)))}
          />
        </label>
        <label className="m-field">
          减防/脆弱折算(%)
          <input
            type="number"
            min={0}
            max={100}
            value={defShredPct}
            onChange={e => setDefShredPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </label>
        <label className="m-field">
          削减法抗(点)
          <input
            type="number"
            min={0}
            max={100}
            value={resShredFlat}
            onChange={e => setResShredFlat(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </label>
      </div>

      <div className="m-result">
        <span>折后激战秒伤 <strong>{result.effectiveDps.toLocaleString('zh-CN')} /s</strong></span>
        <span>护甲/法抗折损 <strong>{result.mitigationLossPct}%</strong></span>
      </div>
      <p>
        单发折前 {result.rawHit.toLocaleString('zh-CN')} → 折后实伤 <strong>{result.postHit.toLocaleString('zh-CN')}</strong>
        {killSeconds !== null && ` · 单核打满首领血量约需 ${killSeconds}s`}
      </p>
      {result.polishing && (
        <p className="m-warning">
          当前处于高折损/抛光区间！{preset.damageType === 'physical' ? `建议继续叠盟约层数使面板越过 ${result.breakthroughAtkNeeded} 破甲线，或补法伤/元素/减防拐。` : '目标法抗极高，建议补削法抗（逻各斯/铃兰/初雪）或真伤/元素干员。'}
        </p>
      )}
    </section>
  );
}
