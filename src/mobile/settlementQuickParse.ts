// 青逝痕 Tenkinoko 制作
export interface SettlementQuickParsed {
  round?: number;
  leaks?: number;
  helps?: number;
  boss?: number;
  note?: string;
}

export function parseSettlementQuickText(raw: string): SettlementQuickParsed {
  const clean = raw.replace(/[,，]/g, '').trim();
  if (!clean) return {};
  const roundMatch = /(?:^|\s|第)R?\s*(1[0-5]|[1-9])\s*(?:回合|轮|\b)/i.exec(clean);
  const leakMatch = /(?:漏怪|漏|逃脱|失守)\s*[:：]?\s*(\d{1,5})/.exec(clean);
  const helpMatch = /(?:协防|兜底|击杀)\s*[:：+]?\s*(\d{1,5})/.exec(clean);
  const bossMatch = /(?:Boss|首领|总伤|伤害)\s*[:：]?\s*(\d{2,10})/i.exec(clean);
  const pctMatch = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(clean);
  return {
    ...(roundMatch ? { round: Number(roundMatch[1]) } : {}),
    ...(leakMatch ? { leaks: Number(leakMatch[1]) } : {}),
    ...(helpMatch ? { helps: Number(helpMatch[1]) } : {}),
    ...(bossMatch ? { boss: Number(bossMatch[1]) } : {}),
    ...(pctMatch ? { note: `结算占比 ${pctMatch[1]}%` } : {}),
  };
}
