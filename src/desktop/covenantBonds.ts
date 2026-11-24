import { ALL_CORE_COVENANT_NAMES, ALL_SUB_COVENANT_NAMES } from '../data/strongholdData';

// 明日方舟《卫戍协议》V3_1（act3autochess）官方 bondInfoDict 全量 26 项盟约 ID 映射
export const BOND_ID_TO_COVENANT: Readonly<Record<string, string>> = {
  // 核心盟约（10）
  yanShip: '炎',
  sargonShip: '萨尔贡',
  egirShip: '阿戈尔',
  siracusaShip: '叙拉古',
  kazimierzShip: '卡西米尔',
  victoriaShip: '维多利亚',
  kjeragShip: '谢拉格',
  ursusShip: '乌萨斯',
  iberiaShip: '伊比利亚',
  lethaniaShip: '莱塔尼亚',
  // 附加盟约（16）
  preciShip: '精准',
  visiShip: '远见',
  investShip: '投资人',
  raidShip: '突袭',
  indomShip: '不屈',
  maniShip: '调和',
  emptyShip: '协防干员',
  soloShip: '独行',
  suntShip: '绝技',
  docShip: '聚合',
  arcaneShip: '奥术',
  swiftShip: '迅捷',
  skillfulShip: '灵巧',
  steadShip: '坚守',
  deputShip: '助力',
  miraShip: '奇迹',
};

const VALID_COVENANTS = new Set<string>([...ALL_CORE_COVENANT_NAMES, ...ALL_SUB_COVENANT_NAMES]);

export function mapBannedBondsToCovenants(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const mapped = Object.hasOwn(BOND_ID_TO_COVENANT, item)
      ? BOND_ID_TO_COVENANT[item]
      : VALID_COVENANTS.has(item) ? item : '';
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      result.push(mapped);
    }
  }
  return result;
}
