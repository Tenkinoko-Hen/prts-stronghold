// ---------------------------------------------------------------------------
// PRTS Wiki Operator Avatar & Canonical Tier Dictionary for《卫戍协议·规程》
// Source: https://prts.wiki/w/%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%C2%B7%E8%A7%84%E7%A8%8B
// ---------------------------------------------------------------------------

export type OperatorTier = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

/**
 * Authoritative Tier I–VI table for all 141+ participating operators in《卫戍协议·规程》
 */
export const PRTS_OPERATOR_TIERS: Record<string, OperatorTier> = {
  // ==================== 等阶 I (1本) ====================
  折桠: 'I',
  艾丝黛尔: 'I',
  幽灵鲨: 'I',
  野鬃: 'I',
  慕斯: 'I',
  角峰: 'I',
  灰喉: 'I',
  深靛: 'I',
  卡达: 'I',
  摆渡人: 'I',
  夏栎: 'I',
  杰克: 'I',
  霜叶: 'I',
  拜松: 'I',
  褐果: 'I',
  烈夏: 'I',
  陨星: 'I',
  拉普兰德: 'I',
  地灵: 'I',

  // ==================== 等阶 II (2本) ====================
  折光: 'II',
  蓝毒: 'II',
  泡泡: 'II',
  莎草: 'II',
  雪猎: 'II',
  砾: 'II',
  复奏: 'II',
  奥斯塔: 'II',
  'Miss.Christine': 'II',
  哈洛德: 'II',
  云迹: 'II',
  蛇屠箱: 'II',
  波登可: 'II',
  承曦格雷伊: 'II',
  锡人: 'II',
  宴: 'II',
  渡桥: 'II',
  矩: 'II',
  星极: 'II',
  瑰盐: 'II',
  真理: 'II',
  铸铁: 'II',
  星源: 'II',
  安哲拉: 'II',

  // ==================== 等阶 III (3本) ====================
  车尔尼: 'III',
  卡涅利安: 'III',
  Pith: 'III',
  乌啾: 'III',
  海沫: 'III',
  旅骨: 'III',
  风絮: 'III',
  极光: 'III',
  耶拉: 'III',
  初雪: 'III',
  深巡: 'III',
  斯卡蒂: 'III',
  Sharp: 'III',
  瑕光: 'III',
  '预备干员-重装': 'III',
  忍冬: 'III',
  郁金香: 'III',
  伺夜: 'III',
  水灯心: 'III',
  空弦: 'III',
  Stormeye: 'III',
  吉星: 'III',
  伊桑: 'III',
  罗比菈塔: 'III',
  乌有: 'III',
  历阵锐枪芬: 'III',
  凯瑟琳: 'III',
  风丸: 'III',
  至简: 'III',
  奥尔佳: 'III',
  青枳: 'III',

  // ==================== 等阶 IV (4本) ====================
  黑键: 'IV',
  艾雅法拉: 'IV',
  '预备干员-术师': 'IV',
  赫拉格: 'IV',
  '领主·Sharp': 'IV',
  维伊: 'IV',
  温蒂: 'IV',
  流明: 'IV',
  余: 'IV',
  森蚺: 'IV',
  灵知: 'IV',
  归溟幽灵鲨: 'IV',
  水月: 'IV',
  远牙: 'IV',
  玛恩纳: 'IV',
  涤火杰西卡: 'IV',
  白铁: 'IV',
  斥罪: 'IV',
  W: 'IV',
  霍尔海雅: 'IV',
  山: 'IV',
  '预备干员-近卫': 'IV',
  淬羽赫默: 'IV',
  赫德雷: 'IV',
  夜莺: 'IV',
  Touch: 'IV',
  仇白: 'IV',
  异客: 'IV',
  安洁莉娜: 'IV',
  Raidian: 'IV',
  华法琳: 'IV',
  寒檀: 'IV',

  // ==================== 等阶 V (5本) ====================
  纯烬艾雅法拉: 'V',
  怒潮凛冬: 'V',
  艾丽妮: 'V',
  棘刺: 'V',
  黍: 'V',
  佩佩: 'V',
  圣聆初雪: 'V',
  凛御银灰: 'V',
  歌蕾蒂娅: 'V',
  乌尔比安: 'V',
  薇薇安娜: 'V',
  铃兰: 'V',
  贝洛内: 'V',
  '维娜·维多利亚': 'V',
  迷迭香: 'V',
  隐德来希: 'V',
  塞雷娅: 'V',
  溯光星源: 'V',
  老鲤: 'V',
  Mon3tr: 'V',
  可露希尔: 'V',
  鸿雪: 'V',
  焰尾: 'V',
  '预备干员-先锋': 'V',
  冻河: 'V',
  阿米娅: 'V',
  暴躁铁皮: 'V',

  // ==================== 等阶 VI (6本) ====================
  引星棘刺: 'VI',
  烛煌: 'VI',
  浊心斯卡蒂: 'VI',
  克莱门莎: 'VI',
  耀骑士临光: 'VI',
  荒芜拉普兰德: 'VI',
  酒神: 'VI',
  逻各斯: 'VI',
  真言: 'VI',
  妮芙: 'VI',
  遥: 'VI',
  魔王: 'VI',
  史尔特尔: 'VI',
  锏: 'VI',
  机械师: 'VI',
  Mechanist: 'VI',
  塔露拉: 'VI',
  夕: 'VI',
  蕾缪安: 'VI',
  缪尔赛思: 'VI',
  帕拉斯: 'VI',
  Misery: 'VI',
  赤刃明霄陈: 'V',
  假日威龙陈: 'VI',
  娜仁图亚: 'VI',
  维什戴尔: 'VI',
};

/**
 * Exact PRTS Wiki Avatar URLs for all operators in《卫戍协议·规程》
 */
export const PRTS_OPERATOR_AVATARS: Record<string, string> = {
  // ==================== 等阶 I (1本) — 19名 ====================
  折桠: 'https://media.prts.wiki/a/a0/%E5%A4%B4%E5%83%8F_%E6%8A%98%E6%A1%A0.png',
  艾丝黛尔: 'https://media.prts.wiki/5/57/%E5%A4%B4%E5%83%8F_%E8%89%BE%E4%B8%9D%E9%BB%9B%E5%B0%94.png',
  幽灵鲨: 'https://media.prts.wiki/2/28/%E5%A4%B4%E5%83%8F_%E5%B9%BD%E7%81%B5%E9%B2%A8.png',
  野鬃: 'https://media.prts.wiki/9/9f/%E5%A4%B4%E5%83%8F_%E9%87%8E%E9%AC%83.png',
  慕斯: 'https://media.prts.wiki/f/fc/%E5%A4%B4%E5%83%8F_%E6%85%95%E6%96%AF.png',
  角峰: 'https://media.prts.wiki/e/e4/%E5%A4%B4%E5%83%8F_%E8%A7%92%E5%B3%B0.png',
  灰喉: 'https://media.prts.wiki/3/3b/%E5%A4%B4%E5%83%8F_%E7%81%B0%E5%96%89.png',
  深靛: 'https://media.prts.wiki/9/92/%E5%A4%B4%E5%83%8F_%E6%B7%B1%E9%9D%9B.png',
  卡达: 'https://media.prts.wiki/4/43/%E5%A4%B4%E5%83%8F_%E5%8D%A1%E8%BE%BE.png',
  摆渡人: 'https://media.prts.wiki/e/e4/%E5%A4%B4%E5%83%8F_%E6%91%86%E6%B8%A1%E4%BA%BA.png',
  夏栎: 'https://media.prts.wiki/0/08/%E5%A4%B4%E5%83%8F_%E5%A4%8F%E6%A0%8E.png',
  杰克: 'https://media.prts.wiki/d/d8/%E5%A4%B4%E5%83%8F_%E6%9D%B0%E5%85%8B.png',
  霜叶: 'https://media.prts.wiki/2/29/%E5%A4%B4%E5%83%8F_%E9%9C%9C%E5%8F%B6.png',
  拜松: 'https://media.prts.wiki/b/b2/%E5%A4%B4%E5%83%8F_%E6%8B%9C%E6%9D%BE.png',
  褐果: 'https://media.prts.wiki/5/58/%E5%A4%B4%E5%83%8F_%E8%A4%90%E6%9E%9C.png',
  烈夏: 'https://media.prts.wiki/6/65/%E5%A4%B4%E5%83%8F_%E7%83%88%E5%A4%8F.png',
  陨星: 'https://media.prts.wiki/e/ea/%E5%A4%B4%E5%83%8F_%E9%99%A8%E6%98%9F.png',
  拉普兰德: 'https://media.prts.wiki/b/bf/%E5%A4%B4%E5%83%8F_%E6%8B%89%E6%99%AE%E5%85%B0%E5%BE%B7.png',
  地灵: 'https://media.prts.wiki/5/57/%E5%A4%B4%E5%83%8F_%E5%9C%B0%E7%81%B5.png',

  // ==================== 等阶 II (2本) — 24名 ====================
  折光: 'https://media.prts.wiki/c/c2/%E5%A4%B4%E5%83%8F_%E6%8A%98%E5%85%89.png',
  蓝毒: 'https://media.prts.wiki/6/63/%E5%A4%B4%E5%83%8F_%E8%93%9D%E6%AF%92.png',
  泡泡: 'https://media.prts.wiki/2/28/%E5%A4%B4%E5%83%8F_%E6%B3%A1%E6%B3%A1.png',
  莎草: 'https://media.prts.wiki/3/3d/%E5%A4%B4%E5%83%8F_%E8%8E%8E%E8%8D%89.png',
  雪猎: 'https://media.prts.wiki/c/cc/%E5%A4%B4%E5%83%8F_%E9%9B%AA%E7%8C%8E.png',
  砾: 'https://media.prts.wiki/c/ce/%E5%A4%B4%E5%83%8F_%E7%A0%BE.png',
  复奏: 'https://media.prts.wiki/6/61/%E5%A4%B4%E5%83%8F_%E5%A4%8D%E5%A5%8F.png',
  奥斯塔: 'https://media.prts.wiki/4/49/%E5%A4%B4%E5%83%8F_%E5%A5%A5%E6%96%AF%E5%A1%94.png',
  'Miss.Christine': 'https://media.prts.wiki/1/10/%E5%A4%B4%E5%83%8F_Miss.Christine.png',
  哈洛德: 'https://media.prts.wiki/2/22/%E5%A4%B4%E5%83%8F_%E5%93%88%E6%B4%9B%E5%BE%B7.png',
  云迹: 'https://media.prts.wiki/6/67/%E5%A4%B4%E5%83%8F_%E4%BA%91%E8%BF%B9.png',
  蛇屠箱: 'https://media.prts.wiki/0/02/%E5%A4%B4%E5%83%8F_%E8%9B%87%E5%B1%A0%E7%AE%B1.png',
  波登可: 'https://media.prts.wiki/4/43/%E5%A4%B4%E5%83%8F_%E6%B3%A2%E7%99%BB%E5%8F%AF.png',
  承曦格雷伊: 'https://media.prts.wiki/e/e2/%E5%A4%B4%E5%83%8F_%E6%89%BF%E6%9B%A6%E6%A0%BC%E9%9B%B7%E4%BC%8A.png',
  锡人: 'https://media.prts.wiki/a/a1/%E5%A4%B4%E5%83%8F_%E9%94%A1%E4%BA%BA.png',
  宴: 'https://media.prts.wiki/f/f4/%E5%A4%B4%E5%83%8F_%E5%AE%B4.png',
  渡桥: 'https://media.prts.wiki/f/fd/%E5%A4%B4%E5%83%8F_%E6%B8%A1%E6%A1%A5.png',
  矩: 'https://media.prts.wiki/a/a8/%E5%A4%B4%E5%83%8F_%E7%9F%A9.png',
  星极: 'https://media.prts.wiki/e/ee/%E5%A4%B4%E5%83%8F_%E6%98%9F%E6%9E%81.png',
  瑰盐: 'https://media.prts.wiki/8/8a/%E5%A4%B4%E5%83%8F_%E7%91%B0%E7%9B%90.png',
  真理: 'https://media.prts.wiki/e/e6/%E5%A4%B4%E5%83%8F_%E7%9C%9F%E7%90%86.png',
  铸铁: 'https://media.prts.wiki/8/84/%E5%A4%B4%E5%83%8F_%E9%93%B8%E9%93%81.png',
  星源: 'https://media.prts.wiki/4/48/%E5%A4%B4%E5%83%8F_%E6%98%9F%E6%BA%90.png',
  安哲拉: 'https://media.prts.wiki/3/36/%E5%A4%B4%E5%83%8F_%E5%AE%89%E5%93%B2%E6%8B%89.png',

  // ==================== 等阶 III (3本) — 26名 ====================
  车尔尼: 'https://media.prts.wiki/1/1c/%E5%A4%B4%E5%83%8F_%E8%BD%A6%E5%B0%94%E5%B0%BC.png',
  卡涅利安: 'https://media.prts.wiki/d/dd/%E5%A4%B4%E5%83%8F_%E5%8D%A1%E6%B6%85%E5%88%A9%E5%AE%89.png',
  乌啾: 'https://media.prts.wiki/5/55/%E5%A4%B4%E5%83%8F_%E4%B9%8C%E5%95%BE.png',
  海沫: 'https://media.prts.wiki/6/6c/%E5%A4%B4%E5%83%8F_%E6%B5%B7%E6%B2%AB.png',
  旅骨: 'https://media.prts.wiki/2/29/%E5%A4%B4%E5%83%8F_%E6%97%85%E9%AA%A8.png',
  风絮: 'https://media.prts.wiki/1/1c/%E5%A4%B4%E5%83%8F_%E9%A3%8E%E7%B5%AE.png',
  极光: 'https://media.prts.wiki/4/43/%E5%A4%B4%E5%83%8F_%E6%9E%81%E5%85%89.png',
  耶拉: 'https://media.prts.wiki/7/71/%E5%A4%B4%E5%83%8F_%E8%80%B6%E6%8B%89.png',
  初雪: 'https://media.prts.wiki/d/d7/%E5%A4%B4%E5%83%8F_%E5%88%9D%E9%9B%AA.png',
  深巡: 'https://media.prts.wiki/b/bd/%E5%A4%B4%E5%83%8F_%E6%B7%B1%E5%B7%A1.png',
  斯卡蒂: 'https://media.prts.wiki/5/53/%E5%A4%B4%E5%83%8F_%E6%96%AF%E5%8D%A1%E8%92%82.png',
  瑕光: 'https://media.prts.wiki/f/f7/%E5%A4%B4%E5%83%8F_%E7%91%95%E5%85%89.png',
  忍冬: 'https://media.prts.wiki/7/79/%E5%A4%B4%E5%83%8F_%E5%BF%8D%E5%86%AC.png',
  伺夜: 'https://media.prts.wiki/d/df/%E5%A4%B4%E5%83%8F_%E4%BC%BA%E5%A4%9C.png',
  水灯心: 'https://media.prts.wiki/3/3b/%E5%A4%B4%E5%83%8F_%E6%B0%B4%E7%81%AF%E5%BF%83.png',
  空弦: 'https://media.prts.wiki/b/bb/%E5%A4%B4%E5%83%8F_%E7%A9%BA%E5%BC%A6.png',
  吉星: 'https://media.prts.wiki/f/fa/%E5%A4%B4%E5%83%8F_%E5%90%89%E6%98%9F.png',
  伊桑: 'https://media.prts.wiki/c/c1/%E5%A4%B4%E5%83%8F_%E4%BC%8A%E6%A1%91.png',
  罗比菈塔: 'https://media.prts.wiki/5/52/%E5%A4%B4%E5%83%8F_%E7%BD%97%E6%AF%94%E8%8F%88%E5%A1%94.png',
  乌有: 'https://media.prts.wiki/0/04/%E5%A4%B4%E5%83%8F_%E4%B9%8C%E6%9C%89.png',
  历阵锐枪芬: 'https://media.prts.wiki/5/5a/%E5%A4%B4%E5%83%8F_%E5%8E%86%E9%98%B5%E9%94%90%E6%9E%AA%E8%8A%AC.png',
  凯瑟琳: 'https://media.prts.wiki/e/e9/%E5%A4%B4%E5%83%8F_%E5%87%AF%E7%91%9F%E7%90%B3.png',
  风丸: 'https://media.prts.wiki/1/12/%E5%A4%B4%E5%83%8F_%E9%A3%8E%E4%B8%B8.png',
  至简: 'https://media.prts.wiki/9/98/%E5%A4%B4%E5%83%8F_%E8%87%B3%E7%AE%80.png',
  奥尔佳: 'https://media.prts.wiki/b/b6/%E5%A4%B4%E5%83%8F_%E5%A5%A5%E5%B0%94%E4%BD%B3.png',
  青枳: 'https://media.prts.wiki/0/0e/%E5%A4%B4%E5%83%8F_%E9%9D%92%E6%9E%B3.png',

  // ==================== 等阶 IV (4本) — 27名 ====================
  黑键: 'https://media.prts.wiki/1/1e/%E5%A4%B4%E5%83%8F_%E9%BB%91%E9%94%AE.png',
  艾雅法拉: 'https://media.prts.wiki/c/cc/%E5%A4%B4%E5%83%8F_%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89.png',
  赫拉格: 'https://media.prts.wiki/c/cd/%E5%A4%B4%E5%83%8F_%E8%B5%AB%E6%8B%89%E6%A0%BC.png',
  维伊: 'https://media.prts.wiki/5/56/%E5%A4%B4%E5%83%8F_%E7%BB%B4%E4%BC%8A.png',
  温蒂: 'https://media.prts.wiki/9/93/%E5%A4%B4%E5%83%8F_%E6%B8%A9%E8%92%82.png',
  流明: 'https://media.prts.wiki/7/72/%E5%A4%B4%E5%83%8F_%E6%B5%81%E6%98%8E.png',
  余: 'https://media.prts.wiki/6/66/%E5%A4%B4%E5%83%8F_%E4%BD%99.png',
  森蚺: 'https://media.prts.wiki/7/74/%E5%A4%B4%E5%83%8F_%E6%A3%AE%E8%9A%BA.png',
  灵知: 'https://media.prts.wiki/9/9f/%E5%A4%B4%E5%83%8F_%E7%81%B5%E7%9F%A5.png',
  归溟幽灵鲨: 'https://media.prts.wiki/b/be/%E5%A4%B4%E5%83%8F_%E5%BD%92%E6%BA%9F%E5%B9%BD%E7%81%B5%E9%B2%A8.png',
  水月: 'https://media.prts.wiki/0/05/%E5%A4%B4%E5%83%8F_%E6%B0%B4%E6%9C%88.png',
  远牙: 'https://media.prts.wiki/a/a1/%E5%A4%B4%E5%83%8F_%E8%BF%9C%E7%89%99.png',
  玛恩纳: 'https://media.prts.wiki/0/08/%E5%A4%B4%E5%83%8F_%E7%8E%9B%E6%81%A9%E7%BA%B3.png',
  涤火杰西卡: 'https://media.prts.wiki/1/14/%E5%A4%B4%E5%83%8F_%E6%B6%A4%E7%81%AB%E6%9D%B0%E8%A5%BF%E5%8D%A1.png',
  白铁: 'https://media.prts.wiki/2/2e/%E5%A4%B4%E5%83%8F_%E7%99%BD%E9%93%81.png',
  斥罪: 'https://media.prts.wiki/1/1c/%E5%A4%B4%E5%83%8F_%E6%96%A5%E7%BD%AA.png',
  W: 'https://media.prts.wiki/d/d6/%E5%A4%B4%E5%83%8F_W.png',
  霍尔海雅: 'https://media.prts.wiki/9/9e/%E5%A4%B4%E5%83%8F_%E9%9C%8D%E5%B0%94%E6%B5%B7%E9%9B%85.png',
  山: 'https://media.prts.wiki/e/ec/%E5%A4%B4%E5%83%8F_%E5%B1%B1.png',
  淬羽赫默: 'https://media.prts.wiki/0/0d/%E5%A4%B4%E5%83%8F_%E6%B7%AC%E7%BE%BD%E8%B5%AB%E9%BB%98.png',
  赫德雷: 'https://media.prts.wiki/f/f8/%E5%A4%B4%E5%83%8F_%E8%B5%AB%E5%BE%B7%E9%9B%B7.png',
  夜莺: 'https://media.prts.wiki/6/64/%E5%A4%B4%E5%83%8F_%E5%A4%9C%E8%8E%BA.png',
  仇白: 'https://media.prts.wiki/8/8a/%E5%A4%B4%E5%83%8F_%E4%BB%87%E7%99%BD.png',
  异客: 'https://media.prts.wiki/d/d2/%E5%A4%B4%E5%83%8F_%E5%BC%82%E5%AE%A2.png',
  安洁莉娜: 'https://media.prts.wiki/c/ca/%E5%A4%B4%E5%83%8F_%E5%AE%89%E6%B4%81%E8%8E%89%E5%A8%9C.png',
  华法琳: 'https://media.prts.wiki/3/30/%E5%A4%B4%E5%83%8F_%E5%8D%8E%E6%B3%95%E7%90%B3.png',
  寒檀: 'https://media.prts.wiki/c/cd/%E5%A4%B4%E5%83%8F_%E5%AF%92%E6%AA%80.png',

  // ==================== 等阶 V (5本) — 25名 ====================
  纯烬艾雅法拉: 'https://media.prts.wiki/f/f0/%E5%A4%B4%E5%83%8F_%E7%BA%AF%E7%83%AC%E8%89%BE%E9%9B%85%E6%B3%95%E6%8B%89.png',
  怒潮凛冬: 'https://media.prts.wiki/8/81/%E5%A4%B4%E5%83%8F_%E6%80%92%E6%BD%AE%E5%87%9B%E5%86%AC.png',
  艾丽妮: 'https://media.prts.wiki/5/57/%E5%A4%B4%E5%83%8F_%E8%89%BE%E4%B8%BD%E5%A6%AE.png',
  棘刺: 'https://media.prts.wiki/2/2a/%E5%A4%B4%E5%83%8F_%E6%A3%98%E5%88%BA.png',
  黍: 'https://media.prts.wiki/f/f2/%E5%A4%B4%E5%83%8F_%E9%BB%8D.png',
  佩佩: 'https://media.prts.wiki/8/85/%E5%A4%B4%E5%83%8F_%E4%BD%A9%E4%BD%A9.png',
  圣聆初雪: 'https://media.prts.wiki/a/ab/%E5%A4%B4%E5%83%8F_%E5%9C%A3%E8%81%86%E5%88%9D%E9%9B%AA.png',
  凛御银灰: 'https://media.prts.wiki/3/3d/%E5%A4%B4%E5%83%8F_%E5%87%9B%E5%BE%A1%E9%93%B6%E7%81%B0.png',
  歌蕾蒂娅: 'https://media.prts.wiki/0/0d/%E5%A4%B4%E5%83%8F_%E6%AD%8C%E8%95%BE%E8%92%82%E5%A8%85.png',
  乌尔比安: 'https://media.prts.wiki/3/33/%E5%A4%B4%E5%83%8F_%E4%B9%8C%E5%B0%94%E6%AF%94%E5%AE%89.png',
  薇薇安娜: 'https://media.prts.wiki/4/4a/%E5%A4%B4%E5%83%8F_%E8%96%87%E8%96%87%E5%AE%89%E5%A8%9C.png',
  铃兰: 'https://media.prts.wiki/5/55/%E5%A4%B4%E5%83%8F_%E9%93%83%E5%85%B0.png',
  贝洛内: 'https://media.prts.wiki/8/83/%E5%A4%B4%E5%83%8F_%E8%B4%9D%E6%B4%9B%E5%86%85.png',
  '维娜·维多利亚': 'https://media.prts.wiki/6/68/%E5%A4%B4%E5%83%8F_%E7%BB%B4%E5%A8%9C%C2%B7%E7%BB%B4%E5%A4%9A%E5%88%A9%E4%BA%9A.png',
  迷迭香: 'https://media.prts.wiki/3/3b/%E5%A4%B4%E5%83%8F_%E8%BF%B7%E8%BF%AD%E9%A6%99.png',
  隐德来希: 'https://media.prts.wiki/4/4c/%E5%A4%B4%E5%83%8F_%E9%9A%90%E5%BE%B7%E6%9D%A5%E5%B8%8C.png',
  塞雷娅: 'https://media.prts.wiki/e/ee/%E5%A4%B4%E5%83%8F_%E5%A1%9E%E9%9B%B7%E5%A8%85.png',
  溯光星源: 'https://media.prts.wiki/d/d0/%E5%A4%B4%E5%83%8F_%E6%BA%AF%E5%85%89%E6%98%9F%E6%BA%90.png',
  老鲤: 'https://media.prts.wiki/e/e5/%E5%A4%B4%E5%83%8F_%E8%80%81%E9%B2%A4.png',
  Mon3tr: 'https://media.prts.wiki/2/2a/%E5%A4%B4%E5%83%8F_Mon3tr.png',
  可露希尔: 'https://media.prts.wiki/a/a5/%E5%A4%B4%E5%83%8F_%E5%8F%AF%E9%9C%B2%E5%B8%8C%E5%B0%94.png',
  鸿雪: 'https://media.prts.wiki/1/1b/%E5%A4%B4%E5%83%8F_%E9%B8%BF%E9%9B%AA.png',
  焰尾: 'https://media.prts.wiki/c/c8/%E5%A4%B4%E5%83%8F_%E7%84%B0%E5%B0%BE.png',
  冻河: 'https://media.prts.wiki/f/f4/%E5%A4%B4%E5%83%8F_%E5%86%BB%E6%B2%B3.png',
  阿米娅: 'https://media.prts.wiki/3/36/%E5%A4%B4%E5%83%8F_%E9%98%BF%E7%B1%B3%E5%A8%85.png',
  暴躁铁皮: 'https://media.prts.wiki/c/cf/%E5%A4%B4%E5%83%8F_%E2%80%9C%E6%9A%B4%E8%BA%81%E9%93%81%E7%9A%AE%E2%80%9D.png',

  // ==================== 等阶 VI (6本) — 20名 ====================
  引星棘刺: 'https://media.prts.wiki/3/3b/%E5%A4%B4%E5%83%8F_%E5%BC%95%E6%98%9F%E6%A3%98%E5%88%BA.png',
  烛煌: 'https://media.prts.wiki/c/c4/%E5%A4%B4%E5%83%8F_%E7%83%9B%E7%85%8C.png',
  浊心斯卡蒂: 'https://media.prts.wiki/8/80/%E5%A4%B4%E5%83%8F_%E6%B5%8A%E5%BF%83%E6%96%AF%E5%8D%A1%E8%92%82.png',
  克莱门莎: 'https://media.prts.wiki/3/34/%E5%A4%B4%E5%83%8F_%E5%85%8B%E8%8E%B1%E9%97%A8%E8%8E%8E.png',
  耀骑士临光: 'https://media.prts.wiki/0/03/%E5%A4%B4%E5%83%8F_%E8%80%80%E9%AA%91%E5%A3%AB%E4%B8%B4%E5%85%89.png',
  荒芜拉普兰德: 'https://media.prts.wiki/0/04/%E5%A4%B4%E5%83%8F_%E8%8D%92%E8%8A%9C%E6%8B%89%E6%99%AE%E5%85%B0%E5%BE%B7.png',
  酒神: 'https://media.prts.wiki/0/0d/%E5%A4%B4%E5%83%8F_%E9%85%92%E7%A5%9E.png',
  逻各斯: 'https://media.prts.wiki/4/44/%E5%A4%B4%E5%83%8F_%E9%80%BB%E5%90%84%E6%96%AF.png',
  真言: 'https://media.prts.wiki/6/63/%E5%A4%B4%E5%83%8F_%E7%9C%9F%E8%A8%80.png',
  妮芙: 'https://media.prts.wiki/1/1a/%E5%A4%B4%E5%83%8F_%E5%A6%AE%E8%8A%99.png',
  遥: 'https://media.prts.wiki/e/ec/%E5%A4%B4%E5%83%8F_%E9%81%A5.png',
  魔王: 'https://media.prts.wiki/d/de/%E5%A4%B4%E5%83%8F_%E9%AD%94%E7%8E%8B.png',
  史尔特尔: 'https://media.prts.wiki/e/e1/%E5%A4%B4%E5%83%8F_%E5%8F%B2%E5%B0%94%E7%89%B9%E5%B0%94.png',
  锏: 'https://media.prts.wiki/0/0f/%E5%A4%B4%E5%83%8F_%E9%94%8F.png',
  机械师: 'https://media.prts.wiki/5/53/%E5%A4%B4%E5%83%8F_%E6%9C%BA%E6%A2%B0%E5%B8%88.png',
  塔露拉: 'https://media.prts.wiki/c/cb/%E5%A4%B4%E5%83%8F_%E5%A1%94%E9%9C%B2%E6%8B%89.png',
  夕: 'https://media.prts.wiki/6/6b/%E5%A4%B4%E5%83%8F_%E5%A4%95.png',
  蕾缪安: 'https://media.prts.wiki/c/c5/%E5%A4%B4%E5%83%8F_%E8%95%BE%E7%BC%AA%E5%AE%89.png',
  缪尔赛思: 'https://media.prts.wiki/3/3a/%E5%A4%B4%E5%83%8F_%E7%BC%AA%E5%B0%94%E8%B5%9B%E6%80%9D.png',
  帕拉斯: 'https://media.prts.wiki/a/ad/%E5%A4%B4%E5%83%8F_%E5%B8%95%E6%8B%89%E6%96%AF.png',

  // ==================== 原型补位干员 & 常用外援 ====================
  Pith: 'https://media.prts.wiki/7/76/%E5%A4%B4%E5%83%8F_Pith%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  Sharp: 'https://media.prts.wiki/5/59/%E5%A4%B4%E5%83%8F_Sharp%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  '领主·Sharp': 'https://media.prts.wiki/5/53/%E5%A4%B4%E5%83%8F_%E9%A2%86%E4%B8%BB%C2%B7Sharp.png',
  Stormeye: 'https://media.prts.wiki/0/03/%E5%A4%B4%E5%83%8F_Stormeye%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  Misery: 'https://media.prts.wiki/e/ea/%E5%A4%B4%E5%83%8F_Misery%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  Mechanist: 'https://media.prts.wiki/c/ca/%E5%A4%B4%E5%83%8F_Mechanist%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  Raidian: 'https://media.prts.wiki/7/75/%E5%A4%B4%E5%83%8F_Raidian%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  Touch: 'https://media.prts.wiki/d/d4/%E5%A4%B4%E5%83%8F_Touch%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  郁金香: 'https://media.prts.wiki/1/12/%E5%A4%B4%E5%83%8F_%E9%83%81%E9%87%91%E9%A6%99%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  '预备干员-重装': 'https://media.prts.wiki/c/cb/%E5%A4%B4%E5%83%8F_%E9%A2%84%E5%A4%87%E5%B9%B2%E5%91%98-%E9%87%8D%E8%A3%85%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  '预备干员-术师': 'https://media.prts.wiki/f/fb/%E5%A4%B4%E5%83%8F_%E9%A2%84%E5%A4%87%E5%B9%B2%E5%91%98-%E6%9C%AF%E5%B8%88%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  '预备干员-近卫': 'https://media.prts.wiki/a/a5/%E5%A4%B4%E5%83%8F_%E9%A2%84%E5%A4%87%E5%B9%B2%E5%91%98-%E8%BF%91%E5%8D%AB%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  '预备干员-先锋': 'https://media.prts.wiki/2/28/%E5%A4%B4%E5%83%8F_%E9%A2%84%E5%A4%87%E5%B9%B2%E5%91%98-%E5%85%88%E9%94%8B%28%E5%8D%AB%E6%88%8D%E5%8D%8F%E8%AE%AE%29.png',
  赤刃明霄陈: 'https://media.prts.wiki/d/d0/%E5%A4%B4%E5%83%8F_%E8%B5%A4%E5%88%83%E6%98%8E%E9%9C%84%E9%99%88.png',
  假日威龙陈: 'https://media.prts.wiki/d/df/%E5%A4%B4%E5%83%8F_%E5%81%87%E6%97%A5%E5%A8%81%E9%BE%99%E9%99%88.png',
  娜仁图亚: 'https://media.prts.wiki/b/ba/%E5%A4%B4%E5%83%8F_%E5%A8%9C%E4%BB%81%E5%9B%BE%E4%BA%9A.png',
  维什戴尔: 'https://media.prts.wiki/6/66/%E5%A4%B4%E5%83%8F_%E7%BB%B4%E4%BB%80%E6%88%B4%E5%B0%94.png',
};

const ALIAS_MAP: Record<string, string> = {
  ew: '维什戴尔',
  EW: '维什戴尔',
  华法林: '华法琳',
  ff0: '华法琳',
  大丑: '暴躁铁皮',
  '暴躁铁皮(大丑)': '暴躁铁皮',
  火陈: '赤刃明霄陈',
  马头: '玛恩纳',
  '玛恩纳(马头)': '玛恩纳',
  红蒂: '浊心斯卡蒂',
  '浊心斯卡蒂(红蒂)': '浊心斯卡蒂',
  大姨: '真言',
  '娜仁图亚(大姨)': '娜仁图亚',
  推王: '维娜·维多利亚',
  王维娜: '维娜·维多利亚',
  维娜: '维娜·维多利亚',
  '推王(王维娜)': '维娜·维多利亚',
  '推王(维娜)': '维娜·维多利亚',
  奶羊: '纯烬艾雅法拉',
  术羊: '艾雅法拉',
  罗哥: '逻各斯',
  缪缪: '缪尔赛思',
  雅雅: '霍尔海雅',
  塞爹: '塞雷娅',
  银灰: '凛御银灰',
  凛冬: '怒潮凛冬',
  芬: '历阵锐枪芬',
  骸骨: '旅骨',
  芳汀: '地灵',
  凛视: '乌啾',
  早露: '乌啾',
  克洛丝: '灰喉',
  炎熔: '慕斯',
  古米: '烈夏',
  红豆: '折桠',
  休谟斯: '砾',
  琳琅诗怀雅: '矩',
  寒克: '矩',
  '任意一阶对子': '野鬃',
  '奇迹盟约干员': '矩',
  '奇迹干员': '矩',
  '远见干员': '渡桥',
  '卡西米尔替补': '耀骑士临光',
};

export interface ResolvedOperatorAvatar {
  name: string;
  cleanName: string;
  avatarUrl: string | null;
  canonicalTier?: OperatorTier;
}

const localAvatarUrl = (sourceUrl: string) => `/assets/avatars/${sourceUrl.split('/').at(-1)}`;

/**
 * Strips parenthetical notes, star/count suffixes, and splits slash-separated combo names
 * so every operator card can render 1 or 2 crisp PRTS avatars with their canonical tier.
 */
export function resolveOperatorAvatars(rawName: string): ResolvedOperatorAvatar[] {
  if (!rawName) return [];

  if (PRTS_OPERATOR_AVATARS[rawName]) {
    return [
      {
        name: rawName,
        cleanName: rawName,
        avatarUrl: localAvatarUrl(PRTS_OPERATOR_AVATARS[rawName]),
        canonicalTier: PRTS_OPERATOR_TIERS[rawName],
      },
    ];
  }

  if (ALIAS_MAP[rawName] && PRTS_OPERATOR_AVATARS[ALIAS_MAP[rawName]]) {
    const mapped = ALIAS_MAP[rawName];
    return [
      {
        name: rawName,
        cleanName: mapped,
        avatarUrl: localAvatarUrl(PRTS_OPERATOR_AVATARS[mapped]),
        canonicalTier: PRTS_OPERATOR_TIERS[mapped],
      },
    ];
  }

  const parts = rawName
    .split(/[\/+＋]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: ResolvedOperatorAvatar[] = [];

  for (const part of parts.slice(0, 2)) {
    const cleaned = part
      .replace(/（.*?）|\(.*?\)/g, '')
      .replace(/\s*x\d+$/i, '')
      .trim();

    const canonical = ALIAS_MAP[cleaned] || ALIAS_MAP[part] || cleaned;
    const url =
      PRTS_OPERATOR_AVATARS[canonical] ||
      PRTS_OPERATOR_AVATARS[cleaned] ||
      null;
    const tier =
      PRTS_OPERATOR_TIERS[canonical] ||
      PRTS_OPERATOR_TIERS[cleaned] ||
      undefined;

    results.push({
      name: part,
      cleanName: canonical,
      avatarUrl: url ? localAvatarUrl(url) : null,
      canonicalTier: tier,
    });
  }

  return results;
}

export function getPrimaryOperatorAvatar(rawName: string): string | null {
  const resolved = resolveOperatorAvatars(rawName);
  return resolved[0]?.avatarUrl ?? null;
}

