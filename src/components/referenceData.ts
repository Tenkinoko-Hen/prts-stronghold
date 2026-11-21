import reference from '../data/operatorReference.json';
import { resolveOperatorAvatars } from '../data/prtsAvatars';

export { reference };
export type ModeOperator = (typeof reference.mode)['风絮'];
export type OperatorAbility = (typeof reference.abilities)['拜松'];
export const modeOperators: Record<string, ModeOperator> = reference.mode;
export const operatorAbilities: Record<string, OperatorAbility> = reference.abilities;
export const covenantEffects: Record<string, { count: string; effect: string }> = reference.covenants;

export function referenceNames(rawName: string): string[] {
  // 泛称槽位不能误用头像兼容别名，显示成一名确定干员。
  if (/任意|盟约干员|奇迹干员|远见干员|替补/.test(rawName)) return [];
  return resolveOperatorAvatars(rawName).map(item => item.cleanName).filter(name => !!operatorAbilities[name]);
}

export function strategiesFor(text: string) {
  // 括号内旧备注不作为发起人；“变形者集群(复奏)”不能匹配成两种策略。
  let remaining = text.replace(/[（(][^）)]*[）)]/g, '');
  return [...reference.strategies].sort((a, b) => b.name.length - a.name.length).filter(strategy => {
    if (!remaining.includes(strategy.name)) return false;
    remaining = remaining.replaceAll(strategy.name, '');
    return true;
  });
}

export function trainingState(mode: ModeOperator | undefined, elite: boolean) {
  if (!mode) return null;
  const tier = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'].indexOf(mode.tier) + 1;
  return { promotion: elite || tier >= 3 ? 2 : 1, level: elite ? tier === 1 ? 50 : tier === 2 ? 55 : 60 : tier === 1 ? 55 : tier === 2 ? 60 : 1, skill: elite ? '7' : '4', module: elite ? tier === 6 ? 3 : 1 : 0 };
}

export function baseTalentsFor(name: string, promotion?: number) {
  const rows = operatorAbilities[name]?.talents.filter(row => !/模组|潜能|级|ISW|RA-|SO-/.test(row[1]) && (promotion === undefined || !/精英\d/.test(row[1]) || Number(row[1].match(/精英(\d)/)?.[1]) <= promotion)) || [];
  // 这两项在精二改名升级；瑕光、魔王等未升级的精一天赋仍须保留。
  const renamed: Record<string, string> = { '体力上限提升': '深海再生力', '快速部署': '小个子支援' };
  return rows.filter((row, i) => !rows.slice(i + 1).some(next => next[0] === row[0] || next[0] === renamed[row[0]]));
}
