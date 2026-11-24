// 青逝痕 Tenkinoko 制作
import { PRTS_OPERATOR_TIERS, resolveOperatorAvatars } from '../data/prtsAvatars';
import { TRANSFER_ITEM_RECIPES, type CompPhase, type MetaCompGuide } from '../data/strongholdData';

export type GuideOperator = CompPhase['fieldOperators'][number];
const aliases: Record<string, string> = { 小羊: '艾雅法拉', 奶羊: '纯烬艾雅法拉', 塞爹: '塞雷娅', 罗比: '罗比菈塔' };

// 先匹配完整姓名，避免把“纯烬艾雅法拉”再次当成“艾雅法拉”。
export function mentionedOperators(text: string): string[] {
  let remaining = text;
  const found: { name: string; index: number }[] = [];
  const names = [...Object.keys(PRTS_OPERATOR_TIERS), ...Object.keys(aliases)].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const index = remaining.indexOf(name);
    if (index < 0 || (name === '余' && !/[抓找补给换]余|【余】|余[123一二三技与和]/.test(remaining))) continue;
    found.push({ name: aliases[name] || name, index });
    remaining = remaining.replaceAll(name, ' '.repeat(name.length));
  }
  return [...new Set(found.sort((a, b) => a.index - b.index).map(item => item.name))];
}

export function roundOperators(comp: MetaCompGuide, phase: CompPhase | undefined, action: string): GuideOperator[] {
  const all = [...(phase?.fieldOperators || []), ...(phase?.benchOperators || []), ...comp.phases.flatMap(p => p.fieldOperators)];
  const names = mentionedOperators(action);
  if (!names.length) return (phase?.fieldOperators || []).slice(0, 3);
  return names.map(name => {
    const known = all.find(op => resolveOperatorAvatars(op.name).some(item => item.cleanName === name));
    return { name, tier: PRTS_OPERATOR_TIERS[name] || known?.tier || '', role: known && 'role' in known ? known.role : '本回合提及', note: known?.note };
  });
}

export function loadoutTags(op: GuideOperator): string[] {
  // 保留短语的否定与条件，不把“不要带某装备”提取成正向配装推荐。
  const priority = (part: string) => /装备|转职|注射器|弹射器|同构体/.test(part) ? 0 : /技能/.test(part) ? 1 : 2;
  return (op.note || '').split(/[，,；;。]/).filter(part => part.length <= 24 && /技能|模组|装备|转职|注射器|弹射器|同构体/.test(part)).sort((a, b) => priority(a) - priority(b)).slice(0, 3);
}

export const equipmentNames = [...new Set(TRANSFER_ITEM_RECIPES.map(item => item.baseEquipmentName).concat(['红色注射器', '精准狙击镜', '变形同构体', '维式重锤']))].sort((a, b) => b.length - a.length);
export const isCorrection = (tip: string) => /纠偏|纠错|失败排错|风险|不代表|不能据此/.test(tip);
