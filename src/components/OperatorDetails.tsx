// 青逝痕 Tenkinoko 制作
import { useState } from 'react';
import type { GuideOperator } from '../mobile/guideContent';
import { mentionedOperators } from '../mobile/guideContent';
import { OperatorAvatar } from './OperatorAvatar';
import { baseTalentsFor, covenantEffects, modeOperators, operatorAbilities, reference, referenceNames, trainingState } from './referenceData';
import './reference.css';
import { recommendedSkill } from './guidePresentation';

export function OperatorDetails({ operator, equipmentTips, compId }: { operator: GuideOperator; equipmentTips: string[]; compId?: string }) {
  const names = referenceNames(operator.name);
  const [selected, setSelected] = useState(names[0] || '');
  const [elite, setElite] = useState(false);
  const name = names.includes(selected) ? selected : names[0];
  const mode = modeOperators[name];
  const ability = operatorAbilities[name];
  const training = trainingState(mode, elite);
  const tips = equipmentTips.filter(tip => mentionedOperators(tip).some(item => names.includes(item)));
  const activeTalents = baseTalentsFor(name, training?.promotion);
  const skillRecommendation = recommendedSkill(compId, name);
  return <div className="operator-reference" data-testid="operator-reference">
    {names.length > 1 && <div className="reference-switch" aria-label="选择干员">{names.map(item => <button key={item} aria-pressed={name === item} onClick={() => setSelected(item)}>{item}</button>)}</div>}
    <div className="reference-heading">{name ? <OperatorAvatar key={name} name={name} tier={operator.tier} size="sm" /> : <strong>{operator.name}</strong>}<div><strong>{operator.role}</strong><p>{operator.note || '按本局来牌与装备安排。'}</p></div></div>
    {tips.length > 0 && <details><summary>本方案配装与用法</summary>{tips.map((tip, i) => <p key={i}>{tip}</p>)}</details>}
    {!ability ? <p>这是可替换槽位，请选定具体干员后查看能力。</p> : <>
      <div className="reference-switch" aria-label="干员养成状态"><button aria-pressed={!elite} onClick={() => setElite(false)}>普通{mode ? ' · 技能 4 级' : ' · 4 级参考'}</button><button aria-pressed={elite} onClick={() => setElite(true)}>精锐{mode ? ' · 技能 7 级' : ' · 7 级参考'}</button></div>
      <p className="reference-caption">{training ? `${mode.tier} 阶 · 精英 ${training.promotion} Lv.${training.level} · ${training.module ? `模组 ${training.module} 级（分支按游戏）` : '无模组'} · 信赖 0%` : '自选外援：养成、盟约与转职以本局游戏为准；下方技能为等级参考。'}</p>
      <div className="operator-detail-grid">
        {mode && <section><h3>盟约特质 · {elite ? '精锐' : '普通'}</h3><p className="reference-trait">{elite ? mode.elite : mode.normal}</p><div className="reference-covenants">{mode.covenants.map(cov => <details key={cov}><summary>{cov} · {covenantEffects[cov]?.count || '?'} 人激活</summary><p>{covenantEffects[cov]?.effect || '按游戏内盟约说明。'}</p></details>)}</div></section>}
        <section><h3>技能 · {elite ? '7' : '4'} 级{!mode && '参考'}</h3>{ability.skills.map((skill, i) => {
          const row = skill.levels.find(level => level[0] === (elite ? '7' : '4'));
          const locked = training?.promotion === 1 && i >= 2;
          const recommended = !locked && skillRecommendation === i + 1;
          return <article className="reference-skill" key={skill.name}><strong>{i + 1} 技能 · {skill.name} {recommended && <span className="reference-skill-badge ak-skew-tag">★ 本局主推</span>}{locked && ' · 精锐后解锁'}</strong><small>{skill.type}</small><p>{row?.[1] || '此等级无记录，以游戏内为准。'}</p>{row && <small>初始技力 {row[2] || '—'} · 消耗 {row[3] || '—'} · 持续 {row[4] || '—'}</small>}</article>;
        })}</section>
      </div>
      <section><h3>基础天赋{training && ` · 精英 ${training.promotion}`}</h3>{activeTalents.map((row, i) => <p key={i}><strong>{row[0]}</strong> · {row[1]}<br />{row[2]}</p>)}<details><summary>全部天赋条件（含模组变化）</summary><p className="reference-caption">下列是不同养成条件的替代效果，不累计生效；实际模组分支与潜能以本局为准。</p>{ability.talents.map((row, i) => <p key={i}><strong>{row[0]} · {row[1]}</strong><br />{row[2]}</p>)}</details></section>
      <details><summary>职业特性与来源</summary>{ability.trait.map((text, i) => <p key={i}>{text}</p>)}<p>PRTS Wiki · {reference.date} 资料快照。正式技能与本模式盟约特质分列；本方案用法为攻略建议。</p></details>
    </>}
  </div>;
}
