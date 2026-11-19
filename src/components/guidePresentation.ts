import type { MetaCompGuide } from '../data/strongholdData';
import { AEGIR_HUNTERS_ID, AEGIR_PITH_ID } from '../data/aegirErosion';

// 仅记录当前路线已明确给出的技能；条件变体与存在分歧的选项不标主推。
const routeSkills: Record<string, Record<string, number>> = {
  [AEGIR_PITH_ID]: { '克莱门莎': 2, '魔王': 2 },
  [AEGIR_HUNTERS_ID]: { '克莱门莎': 2, '魔王': 2 },
  'ursus-gravel-machine': { '砾': 1 },
  'fuzou-tier1-leithanien': { '霍尔海雅': 1 },
  'faith-mixer-fast-four': { '灰喉': 1, '空弦': 1, '霍尔海雅': 2 },
  'yan-bastion-chen-wang': { '仇白': 1, '余': 2 },
  'yan-bison-shop-four': { '仇白': 1 },
  'yan-double-chen-low-tier': { '拜松': 1, '霜叶': 1, '仇白': 1 },
  'yan-slow-six-convergence': { '仇白': 1 },
  'eunectes-two-tier-scopes': { '承曦格雷伊': 2 },
  'ursus-arcane-talulah': { '怒潮凛冬': 2 },
  'sargon-precision-arcane-three': { '异客': 1 },
  'kjerag-snowhunter-precision-swift': { '雪猎': 2 },
  'kazimierz-gavial-blemishine': { '玛恩纳': 2 },
  'yan-suzuran-honeysuckle-economy': { '余': 2 },
  'jessica-precision-arcane-foresight': { '霍尔海雅': 1, '空弦': 1, '黑键': 2, '艾雅法拉': 3, '纯烬艾雅法拉': 2, '塞雷娅': 3 },
};

export function recommendedSkill(compId: string | undefined, name: string): number | undefined {
  return compId ? routeSkills[compId]?.[name] : undefined;
}

export function summarizeBlockedReasons(reasons: string[], fallback: string) {
  if (!reasons.length) return fallback;
  const groups = [
    { pattern: /^主阵营【([^】]+)】被禁/, label: '阵营被禁' },
    { pattern: /^绝对核心【([^】]+)】被禁/, label: '核心被禁' },
    { pattern: /^关键卡【([^】]+)】被禁/, label: '关键干员被禁' },
    { pattern: /^关键附加盟约【([^】]+)】受限/, label: '关键受限' },
    { pattern: /^辅助词条【([^】]+)】受限/, label: '受限需替换' },
  ];
  const summaries = groups.flatMap(({ pattern, label }) => {
    const names = reasons.flatMap(reason => { const match = reason.match(pattern); return match ? [match[1]] : []; });
    return names.length ? [{ text: `${label}：${names.map(name => `【${name}】`).join('')}`, count: names.length }] : [];
  });
  const other = reasons.filter(reason => !groups.some(group => group.pattern.test(reason)));
  const all = [...summaries.map(item => item.text), ...other].join('；');
  if (all.length <= 48) return all;
  // 多重禁用先呈现主阵营/核心，其他限制仍可在卡片提示与方案详情完整查看。
  const primary = summaries.slice(0, 2);
  const shown = primary.reduce((count, item) => count + item.count, 0);
  return primary.length
    ? `${primary.map(item => item.text).join('；')}${shown < reasons.length ? `；另 ${reasons.length - shown} 项限制，点击查看` : ''}`
    : `${reasons.length} 项特殊构筑条件未满足，点击查看`;
}

export function loadoutSummary(comp: MetaCompGuide) {
  return routeLoadouts[comp.id] || '按当前输出、生存与回转缺口补装备。';
}

// 对原 equipmentTips 的首屏提炼，完整分支与获取条件仍在“装备与技能”。
const routeLoadouts: Record<string, string> = {
  [AEGIR_PITH_ID]: '先把装备给当前输出；克莱门莎到手转输出装，魔王 2 技能补支援。',
  [AEGIR_HUNTERS_ID]: '克莱门莎 2 技能；有双进阶精准狙击镜可用，装未齐就先保当轮火力。',
  'kjerag-mechanist-greyy': '承曦格雷伊【灵巧涡轮手套】＋【谢拉格不融冰】；Boss另补直伤与生存。',
  'ursus-gravel-machine': '砾【红色注射器】＋【不屈弹射器】；二本对讲机给铁皮，其余战力装给大丑。',
  'fuzou-tier1-leithanien': '艾雅法拉拿【精准狙击镜】；承曦格雷伊可用时通过他取得，不直接买镜子。',
  'yan-bastion-chen-wang': '先补风絮精锐与当前主C有效输出装；火陈未取得时不空等毕业装。',
  'victoria-bastion-jessica': '涤火杰西卡到位后铺有效装备；白铁进阶自身装备，水灯心补弱点输出。',
  'kazimierz-fartooth-6': '砾补再部署装备；卡西米尔转职实际取得后优先给高攻速输出或强力前排。',
  'kjerag-permafrost-3': '【谢拉格不融冰】给高频攻击的空弦或主C；先通过耶拉取得，再安排冻结覆盖。',
  'minor-pact-dynasty-logos': '逻各斯【天马之翼】＋【佩尔森式】/ 双金狙击镜；优先补当前输出缺口。',
  'sargon-pozy-pepe-swift': '迅捷转职到手再给霍尔海雅；后期转佩佩另按来牌选择，浓茶与盟约之币先喂主C。',
  'eunectes-precision-arcane-big-ugly': '【变形同构体】＋【精准狙击镜】给大丑转精准；六本有【吸血镰刀】再补续航。',
  'leithanien-shapeshifter-standard': '小鼓与同构体到手先给空弦；空弦精锐、霍尔海雅到位后再转交。',
  'harmony-yan-victoria-chen': '维式重锤＋变形同构体用于主C转职；先开三维，再分配有效装备。',
  'jessica-precision-arcane-foresight': '霍尔海雅转远见或灵巧按现有组件选；优先补主C伤害与生存，不强等转职。',
  'yan-bison-shop-four': '仇白1技能配华法琳叠层，群怪压线可试2技能。缺火陈先强化仇白。',
  'suzuran-low-tier-acquisition': '狙击镜优先给实际主输出；雪猎作为输出候选，按当前成型情况分配。',
  'siracusa-precision-six': '有精准转职可给贝洛内；先取得装备、核对三精准，不预支转职收益。',
  'siracusa-bastion-roberta': '罗比菈塔保底，装备按当前生存与输出补；没有固定必出神装要求。',
  'yan-double-chen-low-tier': '双火陈按敌路与有效覆盖分配装备；别因追双核而空置当前主C装备。',
  'eunectes-two-tier-scopes': '成型目标：两只精锐大丑各六金狙击镜；先保云迹与格雷伊循环，不买空装备池。',
  'yan-slow-six-convergence': '先保三炎聚合与当前主C有效装备；六炎和高阶外援到位后再交接。',
  'chiave-leithanien-refresh': '车尔尼配小鼓；精准转职到手且替换后词条仍齐，再考虑转职换下空弦。',
  'iberia-low-tier-multibone': '参考分配：海沫一镜、蓝毒双镜；转伊格雷伊或空弦按实际转职选择。',
  'iberia-chen-swift-survival': '迅捷转职到手再给霍尔海雅；前期小鼓可补回转，不强凑所有组件。',
  'ursus-arcane-talulah': '塔露拉按来装选狙击镜等输出装；未取得终端时，先装备当前成熟输出。',
  'sargon-precision-arcane-three': '先保实际到手的精奥输出；佩佩、鸿雪到位后再交装备，不空等五阶核心。',
  'iberia-bastion-three-tier': '旅骨优先回转装；核心能守路后再补输出，按实际售价目标与方向摆位。',
  'kjerag-snowhunter-precision-swift': '雪猎按来装选狙击镜等有效增伤；没有固定全套必出要求，先核对攻击覆盖。',
  'faith-mixer-fast-four': '按当前主C伤害与生存缺口补装备；没有固定神装清单，先防进场减员。',
  'kjerag-gnosis-warfarin-swift': '按当前输出、生存与回转缺口补装备；先确认有效叠层手与冻结覆盖。',
  'iberia-precision-thorns': '主输出先保精准收益与生存；伊比利亚转职到手后，再按人口决定是否投入。',
  'iberia-bluepoison-six': '蓝毒双狙击镜作参考；伊转给空弦等外挂位，按实际转职和人数开六伊。',
  'kazimierz-gavial-blemishine': '按生存、回转与输出缺口配装；不屈瑕光、突袭玛恩纳等需先取得转职。',
  'yan-suzuran-honeysuckle-economy': '高阶狙击镜与转职按实际取得分配；免费刷新不等于免费买卡和装备。',
};
