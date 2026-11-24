// 青逝痕 Tenkinoko 制作
import { resolveOperatorAvatars } from '../data/prtsAvatars';
import { loadoutTags, type GuideOperator } from '../mobile/guideContent';
import { recommendedSkill } from './guidePresentation';
import { OperatorAvatar } from './OperatorAvatar';

export function TacticalOperatorCard({ operator, compId, className = '', onClick, focused = false }: {
  operator: GuideOperator; compId: string; className?: string; onClick(): void; focused?: boolean;
}) {
  const { name, role, note } = operator;
  const tier = resolveOperatorAvatars(name)[0]?.canonicalTier || operator.tier;
  const skill = recommendedSkill(compId, name);
  const tag = loadoutTags(operator)[0];
  const usage = [skill && (!tag || !tag.includes(`${skill}技能`)) ? `${skill}技能` : '', tag].filter(Boolean).join(' · ')
    || note?.split(/[，；。]/)[0] || '';
  return <button type="button" className={`ak-operator-card ${className}${focused ? ' is-focused' : ''}`} data-tier={tier}
    data-long-name={name.length >= 5 || undefined} aria-label={`查看${name}详情`} onClick={onClick}>
    <div className="ak-operator-art">
      <OperatorAvatar className="ak-operator-avatar" name={name} tier={tier} size="sm" showName={false} />
      {tier && <span className="ak-operator-tier">{tier}</span>}
    </div>
    <span className="ak-operator-caption"><strong>{name}</strong><small>{role}</small>{usage && <em>{usage}</em>}</span>
  </button>;
}
