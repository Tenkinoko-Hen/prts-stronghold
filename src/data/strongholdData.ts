import { COMMUNITY_COMPS } from './communityComps';
import { BOSS_ROUTE_GUIDES } from './bossRoutes';
import { NGA_COMMUNITY_COMPS, PEPE_POSITION_IMAGE } from './ngaCommunityComps';

export type RoleType = '输出' | '重装' | '奶';
export type DirectionType = '→' | '↓' | '↑' | '←' | '→↓';
export type TileKind = 'high' | 'ground' | 'hole' | 'box' | 'special' | 'blueGate' | 'redGate';

export interface OperatorPlacement {
  id: string;
  x: number; // 0..9 (left to right)
  z: number; // 0..5 (top to bottom)
  role: RoleType;
  direction: DirectionType;
  elevation: 'high' | 'ground';
  priority: number;
  label: string;
  tip: string;
  recommendedOps: string[];
}

export interface StageLayout {
  stageName: '道中' | 'Boss战';
  description: string;
  tacticalNotes: string[];
  tiles: TileKind[][]; // 6 rows (z: 0..5) x 10 cols (x: 0..9)
  bossDangerZone?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    label: string;
  };
  placements: OperatorPlacement[];
}

export interface TacticalMapData {
  id: string;
  name: string;
  shortName: string;
  region: '荒漠峡谷' | '莱塔尼亚街区' | '谢拉格雪原' | '维多利亚圣堂';
  theme: 'desert' | 'city' | 'snow' | 'cathedral';
  imageUrl: string;
  summary: string;
  midStage: StageLayout;
  bossStage: StageLayout;
}

export interface CompPhase {
  phaseName: string;
  rounds: string;
  shopTier: string;
  covenantTarget: string;
  fieldOperators: { name: string; tier: string; role: string; note?: string }[];
  benchOperators: { name: string; tier: string; note: string }[];
  keyActions: string[];
}

export interface MetaCompGuide {
  id: string;
  title: string;
  subtitle: string;
  difficulty: '新手轮椅' | '进阶公式' | '高难上限';
  strategist: string;
  strategistTip: string;
  covenants: string[];
  imageUrl: string;
  secondaryImageUrl?: string;
  coreHighlight: string;
  equipmentTips: string[];
  phases: CompPhase[];
  roundPace: { round: number; tier: number; action: string }[];
}

export interface CovenantOperatorCard {
  name: string;
  tier: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  category: '前中期叠层' | '辅助/过渡' | '后期叠层' | '本家输出终端';
  effect: string;
}

export interface CovenantGuide {
  id: string;
  name: string;
  subtitle: string;
  stackCore: string;
  pactSummary: string;
  synergySubPacts: string[];
  difficulty: string;
  imageUrl: string;
  operators: CovenantOperatorCard[];
  proTips: string[];
}

export interface UniversalStacker {
  id: string;
  name: string;
  tier: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
  tag: string;
  timing: '休整期结束时' | '进入休整期时' | '战斗中' | '战斗开始时';
  targetZone: '身前一格' | '身后一格' | '周围八格' | '整备区生效' | '全场核心盟约';
  baseStacksPerRound: number;
  multiplierEffect?: number;
  worksOnBench: boolean;
  description: string;
  bestPartner: string;
}

// ---------------------------------------------------------------------------
// 8 TACTICAL MAPS (Extracted directly from the 8 uploaded map images)
// ---------------------------------------------------------------------------
export const TACTICAL_MAPS: TacticalMapData[] = [
  {
    id: 'desert-1',
    name: '荒漠峡谷 I · 仙人掌十字高台',
    shortName: '荒漠 I · 十字高台',
    region: '荒漠峡谷',
    theme: 'desert',
    imageUrl: '/assets/aistudio/e6ef20ce1a0e24dc833771b27d890cf0_d19c05b8.png',
    summary: '中央四格十字高台为核心输出阵地，道中重装卡住右侧仙人掌路口；Boss战全员退守高台左翼，避开右侧红框Boss溅射区。',
    midStage: {
      stageName: '道中',
      description: '利用中央十字高台形成交叉火力网，重装在右侧仙人掌上方单顶群怪。',
      tacticalNotes: [
        '左侧高台部署【奶 →】向右覆盖全部4名输出与前排重装',
        '顶部高台部署【输出 →↓】兼顾右路出怪口与中路漏怪',
        '底部高台部署【输出 ↑】朝上补齐十字杀伤区',
      ],
      tiles: [
        ['ground', 'ground', 'ground', 'ground', 'high', 'ground', 'ground', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'high', 'high', 'ground', 'ground', 'high', 'ground', 'ground'],
        ['ground', 'high', 'ground', 'high', 'high', 'special', 'special', 'high', 'redGate', 'ground'],
        ['blueGate', 'ground', 'ground', 'ground', 'ground', 'box', 'hole', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'd1-m-1', x: 4, z: 0, role: '输出', direction: '→↓', elevation: 'high', priority: 2, label: '输出 →↓', tip: '高台广角输出位，兼顾右侧与下方通道', recommendedOps: ['逻各斯', '寒檀', '霍尔海雅', '空弦'] },
        { id: 'd1-m-2', x: 2, z: 1, role: '奶', direction: '→', elevation: 'high', priority: 3, label: '奶 →', tip: '安全治疗位，覆盖整个十字高台与前排重装', recommendedOps: ['华法琳', '夜莺', '纯烬艾雅法拉', '淬羽赫默'] },
        { id: 'd1-m-3', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '中路核心高台输出位', recommendedOps: ['鸿雪', '涤火杰西卡', '黑键'] },
        { id: 'd1-m-4', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '前排高台主C位，紧贴重装身后输出', recommendedOps: ['烛煌', '逻各斯', '艾雅法拉'] },
        { id: 'd1-m-5', x: 5, z: 1, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '核心阻挡位，卡在仙人掌上方地面拦截右路敌群', recommendedOps: ['余', '塞雷娅', '暴躁铁皮', '砾'] },
        { id: 'd1-m-6', x: 3, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '下侧副输出位，补充对右路火力', recommendedOps: ['灰喉', '空弦', '耶拉'] },
        { id: 'd1-m-7', x: 4, z: 2, role: '输出', direction: '↑', elevation: 'high', priority: 2, label: '输出 ↑', tip: '朝上攻击被重装阻挡的敌人，打满集火', recommendedOps: ['玛恩纳', '史尔特尔', '真言'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '右侧大片区域为Boss可攻击范围（红框虚线），高台严禁踏入右半区，重装贴红框左缘单顶。',
      tacticalNotes: [
        '红色虚线框内为【Boss可攻击范围】，脆皮高台切勿放入x>=6区域',
        '重装顶在(5,2)仙人掌左侧，把Boss卡在红框边缘集火',
        '下方台阶(6,4)可额外放置一名朝上【输出 ↑】偷伤害',
      ],
      tiles: [
        ['ground', 'ground', 'ground', 'special', 'special', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'high', 'ground', 'high', 'high', 'high', 'ground', 'ground', 'ground', 'high'],
        ['ground', 'high', 'hole', 'hole', 'high', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['blueGate', 'ground', 'hole', 'hole', 'high', 'special', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'high', 'box', 'ground', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 5, maxX: 9, minZ: 1, maxZ: 3, label: 'Boss可攻击范围' },
      placements: [
        { id: 'd1-b-1', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '上排左翼安全输出位，远离BossAOE', recommendedOps: ['远牙', '鸿雪', '空弦'] },
        { id: 'd1-b-2', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排中坚输出位', recommendedOps: ['逻各斯', '寒檀', '黑键'] },
        { id: 'd1-b-3', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排前锋高台位，带高生存或远射程大C', recommendedOps: ['烛煌', '维什戴尔', '涤火杰西卡'] },
        { id: 'd1-b-4', x: 3, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '核心治疗位，脱离Boss攻击范围同时奶住重装', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'd1-b-5', x: 4, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '中心集火位，可吃身后奶妈或华法琳拐', recommendedOps: ['逻各斯', '玛恩纳', '耀骑士临光'] },
        { id: 'd1-b-6', x: 5, z: 2, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '主T位！卡在Boss攻击范围最左缘阻挡Boss前进', recommendedOps: ['余', '塞雷娅', '暴躁铁皮', '黍'] },
        { id: 'd1-b-7', x: 3, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '下侧高台补伤位', recommendedOps: ['霍尔海雅', '仇白', '异客'] },
        { id: 'd1-b-8', x: 6, z: 4, role: '输出', direction: '↑', elevation: 'ground', priority: 2, label: '输出 ↑', tip: '下方阶梯地面/近战位朝上切Boss侧翼', recommendedOps: ['史尔特尔', '耀骑士临光', '玛恩纳', '佩佩'] },
      ],
    },
  },
  {
    id: 'desert-2',
    name: '荒漠峡谷 II · 双防空箱反打阵',
    shortName: '荒漠 II · 防空箱阵',
    region: '荒漠峡谷',
    theme: 'desert',
    imageUrl: '/assets/aistudio/40b87d6939e2f1ed3f4dae195069a21b_720_46dabf65.png',
    summary: '道中呈左右夹击之势，左侧朝右、右侧箱前3名输出朝左反打；Boss战收缩至中左阶梯口集火。',
    midStage: {
      stageName: '道中',
      description: '右路有双层集装箱阻隔，利用箱体左侧高台布置3名朝左【输出 ←】形成前后包夹。',
      tacticalNotes: [
        '下方一字长蛇阵：3名【输出 →】+ 最右侧【重装 →】堵门',
        '右侧集装箱旁3名【输出 ←】朝左背刺被重装拦住的敌人',
        '顶部高台【输出 ↓】垂直向下清理中路高威怪',
      ],
      tiles: [
        ['ground', 'ground', 'ground', 'high', 'ground', 'ground', 'ground', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'box', 'ground', 'high', 'special', 'box', 'ground', 'ground'],
        ['ground', 'high', 'high', 'high', 'ground', 'high', 'high', 'box', 'redGate', 'ground'],
        ['blueGate', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'd2-m-1', x: 3, z: 0, role: '输出', direction: '↓', elevation: 'high', priority: 2, label: '输出 ↓', tip: '顶部制高点朝下轰击中路', recommendedOps: ['烛煌', '逻各斯', '寒檀'] },
        { id: 'd2-m-2', x: 1, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 2, label: '奶 →', tip: '左翼治疗位，覆盖整条下路与中路', recommendedOps: ['华法琳', '夜莺', '纯烬艾雅法拉'] },
        { id: 'd2-m-3', x: 2, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '中左输出位', recommendedOps: ['鸿雪', '空弦', '黑键'] },
        { id: 'd2-m-4', x: 3, z: 2, role: '输出', direction: '→↓', elevation: 'high', priority: 1, label: '输出 →↓', tip: '箱体下方核心输出位，双向覆盖', recommendedOps: ['玛恩纳', '涤火杰西卡', '仇白'] },
        { id: 'd2-m-5', x: 1, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 3, label: '输出 →', tip: '下路后排地面/高台输出', recommendedOps: ['拉普兰德', '棘刺', '佩佩'] },
        { id: 'd2-m-6', x: 2, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 2, label: '输出 →', tip: '下路中段输出', recommendedOps: ['赫拉格', '真言', '山'] },
        { id: 'd2-m-7', x: 3, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 1, label: '输出 →', tip: '紧贴重装身后近战输出', recommendedOps: ['玛恩纳', '史尔特尔', '耀骑士临光'] },
        { id: 'd2-m-8', x: 4, z: 3, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '中路咽喉阻挡位，承受双向火力支援', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
        { id: 'd2-m-9', x: 5, z: 1, role: '输出', direction: '←', elevation: 'high', priority: 2, label: '输出 ←', tip: '右翼上排反打位，朝左输出被重装挡住的怪', recommendedOps: ['寒檀', '空弦', '耶拉'] },
        { id: 'd2-m-10', x: 5, z: 2, role: '输出', direction: '←', elevation: 'high', priority: 1, label: '输出 ←', tip: '右翼中排反打主C位', recommendedOps: ['逻各斯', '烛煌', '鸿雪'] },
        { id: 'd2-m-11', x: 6, z: 2, role: '输出', direction: '←', elevation: 'high', priority: 3, label: '输出 ←', tip: '右翼后排补伤位', recommendedOps: ['霍尔海雅', '异客', '初雪'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '放弃右翼高台（已落入Boss可攻击范围），全员收缩至中央高台与下路阶梯口向右迎敌。',
      tacticalNotes: [
        '中路(5,1)(5,2)(5,3)纵向三连【输出 →】贴近Boss区左缘全力倾泻火力',
        '下路(5,4)输出+(6,4)重装卡住下方楼梯口，防止Boss绕后进蓝门',
      ],
      tiles: [
        ['ground', 'ground', 'box', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'high', 'high', 'box', 'high', 'high', 'ground', 'ground', 'ground', 'high'],
        ['ground', 'special', 'special', 'box', 'high', 'high', 'ground', 'ground', 'box', 'box'],
        ['blueGate', 'ground', 'ground', 'ground', 'high', 'high', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'high', 'ground', 'ground', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 5, maxX: 9, minZ: 1, maxZ: 3, label: 'Boss可攻击范围' },
      placements: [
        { id: 'd2-b-1', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排前锋输出，压制Boss出场台阶', recommendedOps: ['烛煌', '逻各斯', '寒檀'] },
        { id: 'd2-b-2', x: 4, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '中排左翼安全输出位', recommendedOps: ['鸿雪', '空弦', '霍尔海雅'] },
        { id: 'd2-b-3', x: 5, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '中排核心输出位', recommendedOps: ['涤火杰西卡', '黑键', '维什戴尔'] },
        { id: 'd2-b-4', x: 3, z: 3, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '安全治疗位，向右奶住前排输出与下路重装', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'd2-b-5', x: 4, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '下排左翼高台输出', recommendedOps: ['异客', '初雪', '阿米娅'] },
        { id: 'd2-b-6', x: 5, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '下排前线高台输出', recommendedOps: ['玛恩纳', '仇白', '帕拉斯'] },
        { id: 'd2-b-7', x: 5, z: 4, role: '输出', direction: '→', elevation: 'ground', priority: 2, label: '输出 →', tip: '重装身后近战/地面输出，隔盾打Boss', recommendedOps: ['史尔特尔', '耀骑士临光', '佩佩'] },
        { id: 'd2-b-8', x: 6, z: 4, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '下路阶梯口主T位，死守Boss下山路线', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
  },
  {
    id: 'desert-3',
    name: '荒漠峡谷 III · 炙热格栅阵地',
    shortName: '荒漠 III · 格栅阵地',
    region: '荒漠峡谷',
    theme: 'desert',
    imageUrl: '/assets/aistudio/618fe16ca0c3c2f4adbd58d7ae537d62_720_97ed276b.png',
    summary: '顶部带有三座集装箱，道中围绕中央红色格栅抱团；Boss战排成整齐的2x4方阵集火右侧区域。',
    midStage: {
      stageName: '道中',
      description: '重装居于九宫格中心(3,2)，周围6名输出+左上角奶妈形成紧凑铁桶阵。',
      tacticalNotes: [
        '左上【奶 →↓】同时照顾右方与下方队友',
        '重装(3,2)位于阵型正中央，前后均有输出护航',
        '下排(3,3)【输出 ↑】朝上补足重装面前伤害',
      ],
      tiles: [
        ['ground', 'box', 'box', 'high', 'high', 'box', 'ground', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'high', 'special', 'ground', 'ground', 'high', 'ground', 'ground'],
        ['ground', 'high', 'ground', 'high', 'special', 'ground', 'ground', 'high', 'redGate', 'ground'],
        ['blueGate', 'high', 'high', 'ground', 'ground', 'box', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'd3-m-1', x: 1, z: 1, role: '奶', direction: '→↓', elevation: 'high', priority: 2, label: '奶 →↓', tip: '左上角全覆盖治疗位', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'd3-m-2', x: 2, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '上排中段输出', recommendedOps: ['空弦', '寒檀', '鸿雪'] },
        { id: 'd3-m-3', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排前锋输出，直瞄红格区', recommendedOps: ['逻各斯', '烛煌', '涤火杰西卡'] },
        { id: 'd3-m-4', x: 1, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '中排后卫输出', recommendedOps: ['霍尔海雅', '黑键', '耶拉'] },
        { id: 'd3-m-5', x: 2, z: 2, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '阵心主T位，拦截所有中路来敌', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
        { id: 'd3-m-6', x: 3, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '中排前探输出，压制出怪口', recommendedOps: ['玛恩纳', '仇白', '真言'] },
        { id: 'd3-m-7', x: 1, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '下排左翼补伤', recommendedOps: ['异客', '初雪', '青枳'] },
        { id: 'd3-m-8', x: 2, z: 3, role: '输出', direction: '↑', elevation: 'high', priority: 2, label: '输出 ↑', tip: '朝上对准重装阻挡格全力输出', recommendedOps: ['史尔特尔', '耀骑士临光', '帕拉斯'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '中央排成极其工整的2行x4列高台射击矩阵，下方(6,3)重装卡住Boss下路推进。',
      tacticalNotes: [
        '上排4名【输出 →】+ 下排1名【奶 →】与3名【输出 →】组成8人火力墙',
        '重装在(6,3)地面单独顶住Boss，吃满上方8人支援',
      ],
      tiles: [
        ['ground', 'box', 'box', 'high', 'high', 'box', 'high', 'high', 'box', 'high'],
        ['ground', 'hole', 'high', 'high', 'high', 'high', 'ground', 'ground', 'ground', 'high'],
        ['ground', 'hole', 'high', 'high', 'high', 'high', 'ground', 'ground', 'ground', 'ground'],
        ['blueGate', 'ground', 'high', 'box', 'high', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'high', 'high', 'high', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 5, maxX: 9, minZ: 1, maxZ: 2, label: 'Boss可攻击范围' },
      placements: [
        { id: 'd3-b-1', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '上排左一远距离输出', recommendedOps: ['远牙', '空弦', '鸿雪'] },
        { id: 'd3-b-2', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '上排左二输出', recommendedOps: ['寒檀', '霍尔海雅', '黑键'] },
        { id: 'd3-b-3', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排右二核心输出', recommendedOps: ['逻各斯', '烛煌'] },
        { id: 'd3-b-4', x: 6, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排最前线输出（需高血量或有护盾）', recommendedOps: ['涤火杰西卡', '玛恩纳', '薇薇安娜'] },
        { id: 'd3-b-5', x: 3, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '后排安全治疗位，向右贯通全队', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'd3-b-6', x: 4, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '下排左二输出，吃奶妈身后/身前拐', recommendedOps: ['阿米娅', '异客', '初雪'] },
        { id: 'd3-b-7', x: 5, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '下排右二主力输出', recommendedOps: ['维什戴尔', '仇白', '佩佩'] },
        { id: 'd3-b-8', x: 6, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '下排前线近战/高台输出', recommendedOps: ['史尔特尔', '耀骑士临光', '帕拉斯'] },
        { id: 'd3-b-9', x: 6, z: 3, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '右下地面主T位，牢牢锁死Boss', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
  },
  {
    id: 'city-4',
    name: '莱塔尼亚街区 · 庆典气球大道',
    shortName: '莱塔尼亚 · 气球大道',
    region: '莱塔尼亚街区',
    theme: 'city',
    imageUrl: '/assets/aistudio/0065fe6f6a1ace53a03ee3a2dcce027d_720_b79d1d68.png',
    summary: '城市庆典街道地形，道中重装在右上路口朝下堵门，左侧纵向排列输出；Boss战围绕气球花车右侧构建防线。',
    midStage: {
      stageName: '道中',
      description: '重装在(5,0)顶部路口朝下【重装 ↓】拦截，左侧高台纵向4连【输出 →】横扫街道。',
      tacticalNotes: [
        '右上角(5,0)【重装 ↓】直接卡在敌人南下必经之路',
        '中央花坛左侧纵向4名【输出 →】+ 花坛上方2名【输出 →】形成密集侧射',
      ],
      tiles: [
        ['ground', 'high', 'high', 'high', 'high', 'ground', 'special', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'high', 'high', 'ground', 'special', 'ground', 'ground', 'ground'],
        ['blueGate', 'ground', 'high', 'high', 'special', 'ground', 'special', 'ground', 'redGate', 'ground'],
        ['special', 'ground', 'high', 'high', 'special', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'c4-m-1', x: 3, z: 0, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '顶排左翼高台输出', recommendedOps: ['空弦', '鸿雪', '远牙'] },
        { id: 'c4-m-2', x: 4, z: 0, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '顶排中坚输出，紧邻重装左侧', recommendedOps: ['逻各斯', '烛煌', '玛恩纳'] },
        { id: 'c4-m-3', x: 5, z: 0, role: '重装', direction: '↓', elevation: 'ground', priority: 1, label: '重装 ↓', tip: '核心堵门位！朝下阻挡从右上驶来的敌群', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
        { id: 'c4-m-4', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '二排左侧输出', recommendedOps: ['寒檀', '霍尔海雅', '黑键'] },
        { id: 'c4-m-5', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '二排前侧输出，直击重装身前敌人', recommendedOps: ['涤火杰西卡', '仇白', '史尔特尔'] },
        { id: 'c4-m-6', x: 3, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '三排左侧输出，覆盖中下段街道', recommendedOps: ['异客', '初雪', '耶拉'] },
        { id: 'c4-m-7', x: 3, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '四排左侧收尾输出，防止漏怪进蓝门', recommendedOps: ['耀骑士临光', '佩佩', '阿米娅'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '重装在右下紫框阶梯口(6,3)朝上【重装 ↑】顶住Boss，气球花车右侧双列排布5名输出+1名奶妈。',
      tacticalNotes: [
        '右下(6,3)【重装 ↑】朝上卡在紫色传送楼梯口上方，将Boss定在红框左下角',
        '花车旁(4,2)【奶 →】搭配周围5名【输出 →】全力向右集火',
      ],
      tiles: [
        ['ground', 'high', 'high', 'high', 'ground', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'high', 'high', 'ground', 'high', 'high', 'ground', 'ground', 'ground', 'high'],
        ['blueGate', 'ground', 'high', 'special', 'high', 'high', 'ground', 'ground', 'ground', 'ground'],
        ['special', 'ground', 'ground', 'special', 'high', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'high', 'high', 'high', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 5, maxX: 9, minZ: 1, maxZ: 2, label: 'Boss可攻击范围' },
      placements: [
        { id: 'c4-b-1', x: 5, z: 0, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '顶排高台输出，俯射Boss区', recommendedOps: ['远牙', '空弦', '寒檀'] },
        { id: 'c4-b-2', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '二排左列安全高台输出', recommendedOps: ['鸿雪', '霍尔海雅', '黑键'] },
        { id: 'c4-b-3', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '二排右列主力大C', recommendedOps: ['逻各斯', '烛煌'] },
        { id: 'c4-b-4', x: 4, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '花车右侧核心治疗位，守护全队与重装', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'c4-b-5', x: 5, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '三排右列核心输出，吃身后奶妈加成', recommendedOps: ['涤火杰西卡', '玛恩纳', '维什戴尔'] },
        { id: 'c4-b-6', x: 4, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '四排左列补伤位', recommendedOps: ['异客', '初雪', '阿米娅'] },
        { id: 'c4-b-7', x: 5, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 1, label: '输出 →', tip: '重装左侧近战/地面输出，侧击Boss', recommendedOps: ['史尔特尔', '耀骑士临光', '仇白'] },
        { id: 'c4-b-8', x: 6, z: 3, role: '重装', direction: '↑', elevation: 'ground', priority: 1, label: '重装 ↑', tip: '关键阻挡位！在楼梯上方朝上顶住Boss', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
  },
  {
    id: 'desert-5',
    name: '荒漠峡谷 IV · 断崖沟壑阵地',
    shortName: '荒漠 IV · 断崖沟壑',
    region: '荒漠峡谷',
    theme: 'desert',
    imageUrl: '/assets/aistudio/1a3d06a1a8c1014e4b24b86986432911_720_4bdb22c8.png',
    summary: '地图中央有一道纵向深色断崖沟壑，道中沿底部走廊排开4输出+1重装；Boss战隔着沟壑构建双列高台火力网。',
    midStage: {
      stageName: '道中',
      description: '沟壑左侧高台布置奶+3名输出，下方主干道一字排开4名【输出 →】与最右端【重装 →】。',
      tacticalNotes: [
        '下路走廊(1,3)~(4,3)连续部署4名【输出 →】，(5,3)【重装 →】顶在沟壑南端',
        '高台(4,1)【输出 ↓】朝下清理沟壑前聚集的敌群',
      ],
      tiles: [
        ['ground', 'ground', 'high', 'high', 'high', 'hole', 'ground', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'high', 'high', 'hole', 'ground', 'box', 'ground', 'ground'],
        ['ground', 'box', 'high', 'high', 'high', 'hole', 'ground', 'box', 'redGate', 'ground'],
        ['blueGate', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'd5-m-1', x: 4, z: 1, role: '输出', direction: '↓', elevation: 'high', priority: 2, label: '输出 ↓', tip: '沟壑西侧高台朝下输出', recommendedOps: ['烛煌', '寒檀', '逻各斯'] },
        { id: 'd5-m-2', x: 2, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 2, label: '奶 →', tip: '中左治疗位，向右覆盖高台与下路长廊', recommendedOps: ['华法琳', '夜莺', '纯烬艾雅法拉'] },
        { id: 'd5-m-3', x: 3, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '中排高台输出', recommendedOps: ['鸿雪', '空弦', '霍尔海雅'] },
        { id: 'd5-m-4', x: 4, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '沟壑边缘主力高台，跨沟壑打击右路', recommendedOps: ['逻各斯', '涤火杰西卡', '黑键'] },
        { id: 'd5-m-5', x: 1, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 3, label: '输出 →', tip: '下路走廊左一输出', recommendedOps: ['拉普兰德', '棘刺', '阿米娅'] },
        { id: 'd5-m-6', x: 2, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 3, label: '输出 →', tip: '下路走廊左二输出', recommendedOps: ['赫拉格', '山', '佩佩'] },
        { id: 'd5-m-7', x: 3, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 2, label: '输出 →', tip: '下路走廊右二输出', recommendedOps: ['仇白', '真言', '帕拉斯'] },
        { id: 'd5-m-8', x: 4, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 1, label: '输出 →', tip: '紧贴重装身后强力近卫位', recommendedOps: ['玛恩纳', '史尔特尔', '耀骑士临光'] },
        { id: 'd5-m-9', x: 5, z: 3, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '沟壑南端咽喉主T位', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '利用断崖沟壑天然屏障，在沟壑左岸(x=4)与右岸边缘(x=6)分列两排输出，下路重装朝上堵截Boss。',
      tacticalNotes: [
        '沟壑左岸(4,1)(4,2)(4,3)布置【输出 →】【奶 →】【输出 →】绝对安全',
        '沟壑右岸(6,1)(6,2)(6,3)纵向三名主力输出贴脸集火，下方(7,4)【重装 ↑】顶住Boss',
      ],
      tiles: [
        ['ground', 'ground', 'special', 'high', 'high', 'hole', 'high', 'high', 'high', 'high'],
        ['ground', 'high', 'box', 'high', 'high', 'hole', 'high', 'ground', 'ground', 'high'],
        ['ground', 'high', 'high', 'high', 'high', 'hole', 'high', 'ground', 'ground', 'box'],
        ['blueGate', 'ground', 'ground', 'ground', 'high', 'hole', 'high', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'high', 'high', 'ground', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 6, maxX: 9, minZ: 1, maxZ: 3, label: 'Boss可攻击范围' },
      placements: [
        { id: 'd5-b-1', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '沟壑左岸上排远程输出', recommendedOps: ['远牙', '鸿雪', '空弦'] },
        { id: 'd5-b-2', x: 4, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '沟壑左岸核心治疗位，跨沟壑奶住前排', recommendedOps: ['夜莺', '纯烬艾雅法拉', '淬羽赫默'] },
        { id: 'd5-b-3', x: 4, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '沟壑左岸下排远程输出', recommendedOps: ['寒檀', '霍尔海雅', '黑键'] },
        { id: 'd5-b-4', x: 6, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '沟壑右岸上排贴脸输出', recommendedOps: ['烛煌', '逻各斯'] },
        { id: 'd5-b-5', x: 6, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '沟壑右岸中排主力输出', recommendedOps: ['涤火杰西卡', '维什戴尔', '薇薇安娜'] },
        { id: 'd5-b-6', x: 6, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '沟壑右岸下排输出', recommendedOps: ['玛恩纳', '仇白', '异客'] },
        { id: 'd5-b-7', x: 6, z: 4, role: '输出', direction: '→', elevation: 'ground', priority: 2, label: '输出 →', tip: '重装左侧近战输出位', recommendedOps: ['史尔特尔', '耀骑士临光', '佩佩'] },
        { id: 'd5-b-8', x: 7, z: 4, role: '重装', direction: '↑', elevation: 'ground', priority: 1, label: '重装 ↑', tip: '下方楼梯口主T位，朝上拦截Boss', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
  },
  {
    id: 'snow-6',
    name: '谢拉格雪原 · 冰封特种战壕',
    shortName: '谢拉格 · 冰封雪原',
    region: '谢拉格雪原',
    theme: 'snow',
    imageUrl: '/assets/aistudio/23b1e8cc791af8a2a6018e1fcf00e1c5_976348ed.png',
    summary: '雪原冰封地图，带有特殊红框/黄框战术地格；道中重装踩住中路红框朝下阻挡，Boss战沿下路设置双朝上集火带。',
    midStage: {
      stageName: '道中',
      description: '中央2x3高台部署5名【输出 →】+ 左侧【奶 →】，重装踩在(4,1)特殊格朝下拦截。',
      tacticalNotes: [
        '重装部署在(4,1)朝下【重装 ↓】，把敌人聚拢在中央2x3高台正前方',
        '5名【输出 →】成双列密集排布，配合谢拉格冰冻或灵巧攻速瞬间融化敌群',
      ],
      tiles: [
        ['ground', 'ground', 'high', 'high', 'ground', 'ground', 'ground', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'high', 'special', 'ground', 'box', 'ground', 'ground', 'ground'],
        ['ground', 'high', 'high', 'high', 'special', 'ground', 'box', 'ground', 'redGate', 'ground'],
        ['blueGate', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 's6-m-1', x: 2, z: 0, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '雪原高台左一上排输出', recommendedOps: ['寒檀', '空弦', '耶拉'] },
        { id: 's6-m-2', x: 3, z: 0, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '雪原高台右一上排主C', recommendedOps: ['逻各斯', '初雪', '烛煌'] },
        { id: 's6-m-3', x: 1, z: 1, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '后方安全治疗位，覆盖全体5名输出与重装', recommendedOps: ['华法琳', '夜莺', '纯烬艾雅法拉'] },
        { id: 's6-m-4', x: 2, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '中排左列输出，可吃华法琳拐', recommendedOps: ['鸿雪', '霍尔海雅', '黑键'] },
        { id: 's6-m-5', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '中排右列核心输出，紧贴重装左侧', recommendedOps: ['玛恩纳', '涤火杰西卡', '凛御银灰'] },
        { id: 's6-m-6', x: 4, z: 1, role: '重装', direction: '↓', elevation: 'ground', priority: 1, label: '重装 ↓', tip: '踩住红框特种格朝下阻挡', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
        { id: 's6-m-7', x: 2, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '下排左列输出', recommendedOps: ['异客', '阿米娅', '雪猎'] },
        { id: 's6-m-8', x: 3, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '下排右列输出，直击重装身前格', recommendedOps: ['史尔特尔', '耀骑士临光', '仇白'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '右侧黄框特种位处于Boss可攻击范围内，全员驻守中左冰台，下路布置【输出 →】【输出 ↑】【重装 ↑】三连拦截。',
      tacticalNotes: [
        '切勿贪图右侧黄框加成格而将脆皮放入红框【Boss可攻击范围】',
        '下路(5,3)【输出 ↑】与(6,3)【重装 ↑】并排朝上，将Boss死死钉在右下方',
      ],
      tiles: [
        ['ground', 'ground', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'high', 'high', 'high', 'high', 'high', 'special', 'ground', 'ground', 'high'],
        ['ground', 'hole', 'high', 'high', 'high', 'ground', 'ground', 'ground', 'ground', 'special'],
        ['blueGate', 'ground', 'ground', 'high', 'ground', 'ground', 'ground', 'special', 'ground', 'ground'],
        ['high', 'special', 'ground', 'high', 'high', 'high', 'high', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 5, maxX: 8, minZ: 1, maxZ: 2, label: 'Boss可攻击范围' },
      placements: [
        { id: 's6-b-1', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '上排左列高台输出', recommendedOps: ['寒檀', '空弦', '远牙'] },
        { id: 's6-b-2', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排右列核心输出', recommendedOps: ['逻各斯', '烛煌'] },
        { id: 's6-b-3', x: 3, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '中排左列高台输出', recommendedOps: ['鸿雪', '霍尔海雅', '初雪'] },
        { id: 's6-b-4', x: 4, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '中排右列主力输出', recommendedOps: ['涤火杰西卡', '黑键', '维什戴尔'] },
        { id: 's6-b-5', x: 3, z: 3, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '下排安全治疗位，向右支援全队及下路重装', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 's6-b-6', x: 4, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '奶妈身前核心输出位（最佳吃拐位）', recommendedOps: ['逻各斯', '玛恩纳', '凛御银灰'] },
        { id: 's6-b-7', x: 4, z: 4, role: '输出', direction: '→', elevation: 'ground', priority: 3, label: '输出 →', tip: '下路后卫输出', recommendedOps: ['仇白', '拉普兰德', '异客'] },
        { id: 's6-b-8', x: 5, z: 4, role: '输出', direction: '↑', elevation: 'ground', priority: 1, label: '输出 ↑', tip: '下路近战朝上猛砍Boss', recommendedOps: ['史尔特尔', '耀骑士临光', '佩佩'] },
        { id: 's6-b-9', x: 6, z: 4, role: '重装', direction: '↑', elevation: 'ground', priority: 1, label: '重装 ↑', tip: '下路主T位，朝上硬抗Boss', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
  },
  {
    id: 'cathedral-7',
    name: '维多利亚圣堂 I · 金色留声机回廊',
    shortName: '圣堂 I · 留声机回廊',
    region: '维多利亚圣堂',
    theme: 'cathedral',
    imageUrl: '/assets/aistudio/2373e1a8fd8f99aa62c5fa79c83f07b8_720_147190f9.png',
    summary: '带有金色留声机装置与方坑的圣堂大厅，道中在左翼3x3区域抱团；Boss战重装顶在中央(5,2)方坑上方。',
    midStage: {
      stageName: '道中',
      description: '围绕左侧蓝门前方的3x3高台区布置6名输出+1名奶妈，重装在(3,3)卡住下路主通道。',
      tacticalNotes: [
        '上排(2,1)【输出 →↓】与(3,1)【输出 ↓】封锁上方与中路来敌',
        '下排(1,3)(2,3)双【输出 →】配合(3,3)【重装 →】稳守下路',
      ],
      tiles: [
        ['ground', 'high', 'high', 'high', 'special', 'ground', 'ground', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'high', 'high', 'ground', 'ground', 'special', 'ground', 'ground', 'ground'],
        ['ground', 'high', 'high', 'hole', 'hole', 'ground', 'special', 'ground', 'redGate', 'ground'],
        ['blueGate', 'ground', 'ground', 'ground', 'hole', 'special', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'v7-m-1', x: 1, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '左上角远程输出', recommendedOps: ['远牙', '空弦', '鸿雪'] },
        { id: 'v7-m-2', x: 2, z: 1, role: '输出', direction: '→↓', elevation: 'high', priority: 2, label: '输出 →↓', tip: '上排中位双向输出', recommendedOps: ['寒檀', '霍尔海雅', '黑键'] },
        { id: 'v7-m-3', x: 3, z: 1, role: '输出', direction: '↓', elevation: 'high', priority: 1, label: '输出 ↓', tip: '上排右位朝下俯射方坑前敌人', recommendedOps: ['逻各斯', '烛煌', '涤火杰西卡'] },
        { id: 'v7-m-4', x: 1, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '左路核心治疗位，覆盖全部队友', recommendedOps: ['华法琳', '夜莺', '纯烬艾雅法拉'] },
        { id: 'v7-m-5', x: 2, z: 2, role: '输出', direction: '→↓', elevation: 'high', priority: 1, label: '输出 →↓', tip: '奶妈身前黄金输出位', recommendedOps: ['玛恩纳', '维什戴尔', '仇白'] },
        { id: 'v7-m-6', x: 1, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 3, label: '输出 →', tip: '下路后排输出', recommendedOps: ['拉普兰德', '阿米娅', '异客'] },
        { id: 'v7-m-7', x: 2, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 2, label: '输出 →', tip: '重装身后近战输出', recommendedOps: ['史尔特尔', '耀骑士临光', '佩佩'] },
        { id: 'v7-m-8', x: 3, z: 3, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '下路通道主T位', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '阵线整体右移至中央双坑右侧，重装在(5,2)顶住Boss，周围6名【输出 →】+1名【奶 →】贴身集火。',
      tacticalNotes: [
        '重装位于(5,2)正中心，上下左三面环绕高台与近战输出',
        '奶妈在(3,2)向右同时治疗身前输出与前排重装',
      ],
      tiles: [
        ['ground', 'high', 'high', 'high', 'special', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'high', 'high', 'high', 'high', 'high', 'ground', 'ground', 'ground', 'high'],
        ['ground', 'high', 'hole', 'high', 'high', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['blueGate', 'ground', 'hole', 'high', 'high', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'hole', 'special', 'ground', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 5, maxX: 9, minZ: 1, maxZ: 3, label: 'Boss可攻击范围' },
      placements: [
        { id: 'v7-b-1', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '上排左一安全高台输出', recommendedOps: ['远牙', '空弦', '鸿雪'] },
        { id: 'v7-b-2', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排中位主力输出', recommendedOps: ['寒檀', '霍尔海雅', '黑键'] },
        { id: 'v7-b-3', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '上排前锋大C，位于重装正上方', recommendedOps: ['逻各斯', '烛煌'] },
        { id: 'v7-b-4', x: 3, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '中排核心治疗位，贯通治疗重装与主C', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'v7-b-5', x: 4, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '中排黄金输出位（重装正后方+奶妈正前方）', recommendedOps: ['涤火杰西卡', '玛恩纳', '维什戴尔'] },
        { id: 'v7-b-6', x: 5, z: 2, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '圣堂中心主T位，直面Boss阻挡', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
        { id: 'v7-b-7', x: 4, z: 3, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '下排左翼输出位', recommendedOps: ['异客', '初雪', '阿米娅'] },
        { id: 'v7-b-8', x: 5, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 1, label: '输出 →', tip: '重装正下方近战/高台输出位', recommendedOps: ['史尔特尔', '耀骑士临光', '仇白'] },
      ],
    },
  },
  {
    id: 'cathedral-8',
    name: '维多利亚圣堂 II · 圣堂雕像中庭',
    shortName: '圣堂 II · 雕像中庭',
    region: '维多利亚圣堂',
    theme: 'cathedral',
    imageUrl: '/assets/aistudio/dfc3bacf28e45685fac17d1b458d9d2f_720_bdb695b0.png',
    summary: '中央立有两座白色圣堂雕像障碍物，道中与Boss战均巧妙利用雕像两侧高台架设交叉火力，重装在右翼单顶。',
    midStage: {
      stageName: '道中',
      description: '中央白色雕像不可部署，在雕像左侧布置【输出 →】+【奶 →】，雕像右侧布置双【输出 →】，下路重装堵门。',
      tacticalNotes: [
        '雕像左侧(3,1)【输出 →】与(3,2)【奶 →】隔着雕像支援右翼前线',
        '下路(4,3)【输出 ↓】+(5,3)【输出 →】+(6,3)【重装 →】封锁底部长廊',
      ],
      tiles: [
        ['ground', 'ground', 'hole', 'hole', 'ground', 'special', 'box', 'ground', 'redGate', 'redGate'],
        ['ground', 'high', 'ground', 'high', 'box', 'high', 'special', 'ground', 'ground', 'ground'],
        ['ground', 'high', 'ground', 'high', 'box', 'high', 'special', 'ground', 'redGate', 'ground'],
        ['blueGate', 'ground', 'hole', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      placements: [
        { id: 'v8-m-1', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '雕像左上远程输出位', recommendedOps: ['远牙', '鸿雪', '空弦'] },
        { id: 'v8-m-2', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '雕像右上前线高台主C', recommendedOps: ['逻各斯', '烛煌', '寒檀'] },
        { id: 'v8-m-3', x: 3, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '雕像左下核心治疗位，穿透雕像奶右翼', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'v8-m-4', x: 5, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '雕像右下主力高台输出', recommendedOps: ['涤火杰西卡', '霍尔海雅', '黑键'] },
        { id: 'v8-m-5', x: 4, z: 3, role: '输出', direction: '↓', elevation: 'ground', priority: 3, label: '输出 ↓', tip: '雕像正下方朝下清杂位', recommendedOps: ['拉普兰德', '赫拉格', '山'] },
        { id: 'v8-m-6', x: 5, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 1, label: '输出 →', tip: '重装身后强力近卫输出', recommendedOps: ['玛恩纳', '史尔特尔', '耀骑士临光'] },
        { id: 'v8-m-7', x: 6, z: 3, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '右路通道主T阻挡位', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
      ],
    },
    bossStage: {
      stageName: 'Boss战',
      description: '重装前压至(6,2)卡住Boss可攻击范围左界，雕像右侧(x=5)纵向排满4名【输出 →】，雕像左上方再补2名输出+1名奶妈。',
      tacticalNotes: [
        '第5列(5,0)(5,1)(5,2)(5,3)纵向4连【输出 →】紧贴重装身后输出最大化',
        '雕像左侧(3,1)(4,1)双【输出 →】与(3,2)【奶 →】提供安全后排支援',
      ],
      tiles: [
        ['ground', 'ground', 'ground', 'high', 'high', 'high', 'box', 'high', 'high', 'high'],
        ['ground', 'high', 'ground', 'high', 'high', 'high', 'ground', 'ground', 'ground', 'high'],
        ['ground', 'high', 'ground', 'high', 'box', 'high', 'ground', 'ground', 'ground', 'ground'],
        ['blueGate', 'ground', 'hole', 'ground', 'box', 'high', 'ground', 'ground', 'ground', 'ground'],
        ['high', 'high', 'ground', 'high', 'high', 'high', 'ground', 'ground', 'high', 'high'],
        ['ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground'],
      ],
      bossDangerZone: { minX: 6, maxX: 9, minZ: 1, maxZ: 3, label: 'Boss可攻击范围' },
      placements: [
        { id: 'v8-b-1', x: 5, z: 0, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '第5列顶排输出位', recommendedOps: ['寒檀', '空弦', '霍尔海雅'] },
        { id: 'v8-b-2', x: 3, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 3, label: '输出 →', tip: '雕像左上远狙输出位', recommendedOps: ['远牙', '鸿雪', '初雪'] },
        { id: 'v8-b-3', x: 4, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 2, label: '输出 →', tip: '雕像正上方高台输出位', recommendedOps: ['黑键', '异客', '阿米娅'] },
        { id: 'v8-b-4', x: 5, z: 1, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '第5列二排主力大C', recommendedOps: ['逻各斯', '烛煌'] },
        { id: 'v8-b-5', x: 3, z: 2, role: '奶', direction: '→', elevation: 'high', priority: 1, label: '奶 →', tip: '雕像左侧安全治疗位，向右奶穿全场', recommendedOps: ['夜莺', '纯烬艾雅法拉', '华法琳'] },
        { id: 'v8-b-6', x: 5, z: 2, role: '输出', direction: '→', elevation: 'high', priority: 1, label: '输出 →', tip: '重装正后方核心输出位', recommendedOps: ['涤火杰西卡', '玛恩纳', '维什戴尔'] },
        { id: 'v8-b-7', x: 6, z: 2, role: '重装', direction: '→', elevation: 'ground', priority: 1, label: '重装 →', tip: '主T位！卡在Boss攻击范围左缘单顶', recommendedOps: ['余', '塞雷娅', '暴躁铁皮'] },
        { id: 'v8-b-8', x: 5, z: 3, role: '输出', direction: '→', elevation: 'ground', priority: 2, label: '输出 →', tip: '第5列底部输出位，补齐4连射界', recommendedOps: ['史尔特尔', '耀骑士临光', '仇白'] },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// 8 FORMULAIC META COMPS (Synthesized from the uploaded images)
// ---------------------------------------------------------------------------
export const META_COMPS: MetaCompGuide[] = [
  {
  "id": "ursus-gravel-machine",
  "title": "森蚺沙砾机 · 不屈卡西",
  "subtitle": "二本砾循环，稳场后升本补对空与装备",
  "difficulty": "进阶公式",
  "strategist": "森蚺 (Eunectes)",
  "strategistTip": "R2二本找砾，能守住再停二本；R9四本、R10五本仅作参考，缺钱顺延。",
  "covenants": [
    "3卡西米尔",
    "3乌萨斯",
    "3不屈",
    "2奇迹",
    "2灵巧"
  ],
  "imageUrl": "/assets/aistudio/d9635fc45303d1b6421f720d122f0454_0a1a7ecb.png",
  "coreHighlight": "暴躁铁皮友伤触发砾再部署，叠不屈与卡西米尔。砾卸模组、带1技能；先稳定循环，再补玛恩纳对空。",
  "equipmentTips": [
    "砾专武：红色注射器 + 不屈弹射器（加快再部署与叠层效率）",
    "补充纠偏（FireShot 012）：不屈卡西与精准灵巧是不同分支；转职、精锐和装备不到时不要照搬另一分支，也不要为凑乌萨斯拆掉已成型的卡西不屈。",
    "停二本是原一图流参考节奏，漏怪或缺核心时先补战力；求助帖有道中兜80怪但Boss输出不够的失败例，层数不能代替输出检查。",
    "同帖更新（FireShot 016）：有人认为卡西不屈大丑缺电话/转职也能过渡，另一评论坚持转职球优先、其次精锐。两者存在分歧，本卡保留按实际伤害和来牌决定升本的退路。",
    "经济装：博士玩偶 + 阿米娅玩偶（二本停留期间滚雪球核心）",
    "二本给暴躁铁皮带上无线电对讲机，其余战力装备全部给大丑带上",
    "五本寻找缪尔赛思拿到【变形同构体】复制核心或给大丑补齐三不屈"
  ],
  "phases": [
    {
      "phaseName": "前期阵容组成",
      "rounds": "1~2回合",
      "shopTier": "1~2本",
      "covenantTarget": "2奇迹 / 2不屈（以开出不屈+抓到砾为第一目标）",
      "fieldOperators": [
        {
          "name": "野鬃",
          "tier": "I",
          "role": "先锋/卡西米尔"
        },
        {
          "name": "折桠",
          "tier": "I",
          "role": "萨尔贡/不屈"
        },
        {
          "name": "砾",
          "tier": "II",
          "role": "特种/核心沙砾",
          "note": "下掉模组，带1技能，绑定注射器+弹射器"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "奇迹/灵巧"
        },
        {
          "name": "暴躁铁皮",
          "tier": "V",
          "role": "策略家专属核心",
          "note": "技能同时攻击敌我，自动杀砾"
        }
      ],
      "benchOperators": [
        {
          "name": "矩",
          "tier": "II",
          "note": "常驻整备区激活2奇迹盟约"
        }
      ],
      "keyActions": [
        "第2回合直接升二本，第一时间搜出【砾】并配合【折桠】凑齐2不屈+【云迹+矩】开2奇迹",
        "砾进图前记得下掉模组并带1技能，刷得更快"
      ]
    },
    {
      "phaseName": "中期阵容组成（停二本叠层）",
      "rounds": "3~8回合",
      "shopTier": "停在2本",
      "covenantTarget": "3卡西米尔 / 2不屈 / 2奇迹 / 2灵巧（有条件开3不屈）",
      "fieldOperators": [
        {
          "name": "野鬃",
          "tier": "I",
          "role": "卡西米尔"
        },
        {
          "name": "折桠",
          "tier": "I",
          "role": "不屈"
        },
        {
          "name": "砾",
          "tier": "II",
          "role": "核心叠层",
          "note": "可抓复数砾站大丑右侧连续被砍"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "奇迹/灵巧"
        },
        {
          "name": "暴躁铁皮",
          "tier": "V",
          "role": "自动杀砾机"
        },
        {
          "name": "乌啾",
          "tier": "III",
          "role": "卡西米尔/乌萨斯"
        },
        {
          "name": "奥尔佳",
          "tier": "III",
          "role": "乌萨斯/突袭"
        },
        {
          "name": "历阵锐枪芬",
          "tier": "III",
          "role": "突袭/前排过渡"
        }
      ],
      "benchOperators": [
        {
          "name": "矩",
          "tier": "II",
          "note": "整备区激活奇迹"
        }
      ],
      "keyActions": [
        "2~8回合是原低本路线参考；能守住才继续抓复数砾，站位为：[暴躁铁皮] [砾] [砾]。持续漏怪就补战力或提前升本",
        "三不屈能帮忙杀砾，但如果有复数砾就不急着开三不屈"
      ]
    },
    {
      "phaseName": "五本成型 & 最终Boss战阵容",
      "rounds": "9~15回合",
      "shopTier": "参考R9四本、R10五本，资金不足顺延",
      "covenantTarget": "3卡西米尔 / 3乌萨斯 / 2灵巧 / 2奇迹 / 3不屈",
      "fieldOperators": [
        {
          "name": "折桠",
          "tier": "I",
          "role": "不屈挂件"
        },
        {
          "name": "砾",
          "tier": "II",
          "role": "满装永动沙砾"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "奇迹/灵巧"
        },
        {
          "name": "暴躁铁皮",
          "tier": "V",
          "role": "神装主C",
          "note": "带同构体/不屈弹射器/战力装"
        },
        {
          "name": "奥尔佳",
          "tier": "III",
          "role": "乌萨斯突袭"
        },
        {
          "name": "玛恩纳",
          "tier": "IV",
          "role": "核心对空与清杂"
        },
        {
          "name": "耀骑士临光",
          "tier": "VI",
          "role": "Boss战决战卡西米尔终端",
          "note": "六阶须奖励或六本取得，未到保现有输出"
        },
        {
          "name": "史尔特尔",
          "tier": "VI",
          "role": "Boss战决战地面终端",
          "note": "六阶须奖励或六本取得，未到保现有输出"
        }
      ],
      "benchOperators": [
        {
          "name": "矩",
          "tier": "II",
          "note": "整备区维持2奇迹"
        },
        {
          "name": "缪尔赛思",
          "tier": "VI",
          "note": "五本对子奖励候选，实际取得后拿同构体"
        }
      ],
      "keyActions": [
        "稳场且能留买牌钱再升三四本；五本留对子碰缪尔赛思，未取得就保持现有配置。",
        "玛恩纳补充对空和清杂；Boss战换上耀骑士临光+史尔特尔，若没找到转职就上手头同盟约干员并换满战力装"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "抓野鬃/折桠与一阶对子，优先稳血"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "资金够升二找砾与不屈，留购买战力的钱"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "停2本搜复数砾、云迹、矩与砾专武（注射器+弹射器）"
    },
    {
      "round": 4,
      "tier": 2,
      "action": "【推导】先验大丑与砾的循环是否稳定；缺再部署装备先补战力，不空刷专武"
    },
    {
      "round": 5,
      "tier": 2,
      "action": "继续停2本，摆出[暴躁铁皮][砾][砾]自动沙砾机狂叠层"
    },
    {
      "round": 6,
      "tier": 2,
      "action": "【推导】补砾与现成对子，检查不屈、卡西米尔触发；持续漏怪时提前升本找输出"
    },
    {
      "round": 7,
      "tier": 2,
      "action": "【推导】仍能守住才继续低本养成；给主输出补装备，保留下一轮升本资金"
    },
    {
      "round": 8,
      "tier": 2,
      "action": "能守住就留对子与升本钱，承压先补输出"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "资金够再升三四本，补乌啾、奥尔佳与玛恩纳；不足顺延"
    },
    {
      "round": 10,
      "tier": 5,
      "action": "场面稳再升五，留对子尝试缪尔赛思奖励；没来不硬赌"
    },
    {
      "round": 11,
      "tier": 5,
      "action": "【推导】有转职再补乌萨斯等挂件，不拆已成型卡西不屈；缺球先强化玛恩纳输出"
    },
    {
      "round": 12,
      "tier": 5,
      "action": "【推导】检查对空与清杂，淘汰只占格却无收益的过渡位；精锐和输出装备优先"
    },
    {
      "round": 13,
      "tier": 5,
      "action": "六阶耀骑士临光或史尔特尔取得后再替换，未到强化现有主C"
    },
    {
      "round": 14,
      "tier": 5,
      "action": "【推导】进入决战前检查主C存活、技能回转与有效伤害；道中兜怪不能替代Boss输出"
    },
    {
      "round": 15,
      "tier": 5,
      "action": "【推导】最后整备把闲置战力装备穿满，核对砾站位与整备区召唤目标，不临时拆成熟体系"
    }
  ]
},
  {
  "id": "fuzou-tier1-leithanien",
  "title": "复奏一本 · 精灵奥莱",
  "subtitle": "一本留对子，R6三本、R9四本作参考",
  "difficulty": "进阶公式",
  "strategist": "复奏 (二重奏)",
  "strategistTip": "每轮争取一次精锐额外奖励；锁好三连再升本。升五看核心与对子，高压先补战力。",
  "covenants": [
    "3莱塔尼亚",
    "精准",
    "奥术",
    "灵巧（可调整）",
    "2(3)聚合",
    "远见 / 奇迹"
  ],
  "imageUrl": "/assets/aistudio/86a0177a75f0c1701ba6cde6a68e36ff_720_96c896a8.png",
  "secondaryImageUrl": "/assets/community/fuzou-fast-four.png",
  "coreHighlight": "先确认莱塔尼亚与霍尔海雅可用。一本留对子碰体系牌，四本补精奥聚合；关底佩佩、黑键按生存需求换夜莺、承曦格雷伊。",
  "equipmentTips": [
    "1~5回合多余资金优先买低阶战力/经济装备稳住前期血量，剩余资金再刷新找对子",
    "主线R6升三、R9升四。快线只在已有对子且能守路时采用：R4可提前升三；缺战力先留低本补牌。",
    "复奏奖励的另一种分配（059）：先各碰一次三阶、四阶，后续对子在四本碰五阶。没有可合的对子或正在漏怪，就先买战力，不强追奖励档。",
    "059 速三分支：能守路、升完还有钱买牌，才在 R3–4 直接上三；二本有关键对子可晚一轮。R7–9 先补输出，不套用到二本大丑。",
    "评论比较一本三连购卡约6块、二本以上约9块，不包含全部刷新、升本和装备费；成绩截图不代表稳定通关。",
    "新两页稿配装：精准狙击镜给艾雅法拉；承曦格雷伊未被Ban时，通过他取得，不直接购买。三连与装备取舍仍看本轮战力。",
    "Ban替代：华法琳缺失可放弃灵巧，依次考虑风絮、流明，再莎草、乌啾；佩佩缺失放弃道中灵巧并换夜莺；空弦缺失可换鸿雪或迷迭香。灵巧提升上限、远见加快启动，均不应当作这条分支绝对不能缺的硬条件。",
    "承曦格雷伊被Ban时三选一：①放弃灵巧，关底佩佩换夜莺；②放弃三聚合，关底沿用道中构筑；③R11/12上五本三连找缪尔赛思，艾雅法拉转精准或霍尔海雅转灵巧，关底佩佩换夜莺。不可把三条同时列成必带。",
    "升五条件：仅剩五阶和至多一名四阶未精锐，结合对子余量决定，或当轮已完成一次三连。原稿对子多少的括号表述有歧义，不设置固定对子阈值。原稿R6/R9为最晚目标，若升本后仍有三连且合成后对子充足可提前；战力与经济不足则延后。",
    "每回合第二次三连：对子少时，可花一两块代价锁到下轮，避免下一轮没有复奏触发。已获得精准转职且资金足时，旧图仍可走高本逻各斯；这是条件分支，不强制R13升六。",
    "通用抓牌讨论补充：空弦值得精锐，渡桥主要配空弦；没空弦不为远见单抓渡桥。来源为《以通关终极隐藏为目标》作者意见，与两页稿的二本以上奖励取卡规则分开使用。",
    "来源：资料库《复奏莱塔尼亚构筑笔记·上/下》与《终极隐藏构筑讨论》；后一帖强度排名存在卡西米尔玩家异议，不据此删除其他流派。",
    "050排错：霍尔海雅用1技能；艾雅法拉关底先查精锐、有效精准与绝技收益，再按覆盖选狙击镜、骨刺刃等装备。此为作者建议，不保证固定倍率；不覆盖另一作者信仰搅拌机的雅雅2技能分支。"
  ],
  "phases": [
    {
      "phaseName": "前期阵容组成与运营",
      "rounds": "1~5回合",
      "shopTier": "停在1本",
      "covenantTarget": "2奇迹 / 2远见（三合一优先选奇迹盟约）",
      "fieldOperators": [
        {
          "name": "复奏",
          "tier": "II",
          "role": "莱塔尼亚/奥术",
          "note": "三合一碰出，每回合+4/8层莱塔尼亚"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "奇迹核心",
          "note": "三合一奖励拿到后直接上场，Boss战再下场"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "role": "远见叠层",
          "note": "休整期结束时自身及身前+4层"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "role": "优质道中卡",
          "note": "获得时白送2件精准狙击镜"
        }
      ],
      "benchOperators": [
        {
          "name": "矩",
          "tier": "II",
          "note": "奇迹在整备区即可激活，千万不要卖掉"
        }
      ],
      "keyActions": [
        "R1~5留对子，优先每轮一次三连；已锁三连且剩余对子足，可提前升本。",
        "三合一优先拿【奇迹】盟约（云迹+矩）与【远见】渡桥、复奏、承曦格雷伊",
        "低本候选：精准灰喉；奥术卡达；灵巧霜叶；聚合褐果；坚守摆渡人/角峰；助力野鬃/夏栎；莱塔尼亚地灵。按对子与当前战力选择，不要求全部买齐。",
        "二本以上候选以奖励取得为主，不直接买（奇迹例外）：精准雪猎/伺夜/鸿雪/迷迭香，奥术伊桑/溯光星源，灵巧云迹/仇白及原稿俗称“异银”，聚合莎草/乌啾，远见渡桥/寒檀/黍。",
        "奇迹优先云迹、星极、复奏、吉星；通用Mon3tr/阿米娅。坚守可选罗比菈塔/蛇屠箱/青枳，助力罗比菈塔/安哲拉/星源；莱塔尼亚复奏/车尔尼，车尔尼小鼓给霍尔海雅，中期先凑三莱。",
        "可三连：道中与关底主力、星极/至简/真理、一次刷出两张的一本卡及霜叶/灰喉/夏栎/褐果。已有150远见后转抓远见干员、至简、真理，最后四个低本牌除已有对子不再主动抓。"
      ]
    },
    {
      "phaseName": "中期阵容组成（三本找核）",
      "rounds": "6~8回合",
      "shopTier": "升至3本",
      "covenantTarget": "3莱塔尼亚 / 2奥术 / 2精准（有远见奇迹最好）",
      "fieldOperators": [
        {
          "name": "黑键",
          "tier": "IV",
          "role": "莱塔尼亚/奥术核心",
          "note": "三本奖励碰出；不能替代本分支霍尔海雅前提"
        },
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "中期关键叠层核心",
          "note": "本分支需未被Ban，华法琳优先配合其叠精准奥术"
        },
        {
          "name": "地灵",
          "tier": "I",
          "role": "莱塔尼亚/远见"
        },
        {
          "name": "卡达",
          "tier": "I",
          "role": "奇迹/奥术"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "奇迹叠层"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "role": "精准/灵巧过渡"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "远见/精准叠层"
        },
        {
          "name": "艾雅法拉",
          "tier": "IV",
          "role": "莱塔尼亚/奥术输出"
        }
      ],
      "benchOperators": [
        {
          "name": "复奏",
          "tier": "II",
          "note": "备战或上场凑莱塔尼亚"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "note": "整备区激活远见"
        }
      ],
      "keyActions": [
        "新两页稿参考R6连升三；锁三连后升本，利用复奏额外奖励碰霍尔海雅、黑键等四阶核心",
        "优先保持每轮复奏触发，再准备四本；没有三连先停本补对子。"
      ]
    },
    {
      "phaseName": "四本成型与关底换人",
      "rounds": "9~15回合",
      "shopTier": "R9四本参考；五本看核心精锐与对子，不强制六本",
      "covenantTarget": "3莱塔尼亚 / 3奥术 / 3精准 / 2(3)聚合 / 2奇迹 / 2远见",
      "fieldOperators": [
        {
          "name": "空弦",
          "tier": "III",
          "role": "高频精准物理副C"
        },
        {
          "name": "黑键",
          "tier": "IV",
          "role": "莱塔尼亚法核"
        },
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "风场控制/叠层"
        },
        {
          "name": "纯烬艾雅法拉",
          "tier": "V",
          "role": "五本核心聚合奶"
        },
        {
          "name": "艾雅法拉",
          "tier": "IV",
          "role": "莱塔尼亚奥术输出"
        },
        {
          "name": "薇薇安娜",
          "tier": "V",
          "role": "莱塔尼亚/聚合前排"
        },
        {
          "name": "佩佩",
          "tier": "V",
          "role": "道中叠灵巧远见",
          "note": "优先配奶羊叠远见；关底换夜莺"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "灵巧与聚合",
          "note": "优先配霍尔海雅叠精准奥术"
        }
      ],
      "benchOperators": [
        {
          "name": "复奏",
          "tier": "II",
          "note": "整备区候命"
        },
        {
          "name": "云迹",
          "tier": "II",
          "note": "用于开启奇迹盟约，Boss战下场"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "note": "关底替换黑键；被Ban时在装备页三条替代分支中择一"
        },
        {
          "name": "夜莺",
          "tier": "IV",
          "note": "关底替换佩佩，补聚合与生存；道中生存不足也可提前调整"
        }
      ],
      "keyActions": [
        "参考R9四本，用三连奖励碰纯烬艾雅法拉、薇薇安娜；前者与佩佩/空弦叠远见，华法琳配霍尔海雅叠精准奥术",
        "道中堵门相对站位：下路佩佩+奶羊+空弦、霍尔海雅+华法琳；中路小羊，上路黑键+薇薇安娜。下路有空位黑键优先下路；具体朝向和射程按地图调整",
        "关底佩佩、黑键换夜莺、承曦格雷伊；承曦被Ban时在放弃灵巧、放弃三聚合、五本碰缪尔赛思三条分支中择一，不拼成一套全都要"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "停1本！见对子就拿，多余的钱先买装备稳血再D牌"
    },
    {
      "round": 2,
      "tier": 1,
      "action": "【推导】买现成对子和便宜战力装备；先保本路，少为指定牌耗光刷新资金"
    },
    {
      "round": 3,
      "tier": 1,
      "action": "【推导】整理对子与空位，按当前战力选悬赏；漏怪时优先补场，不为凑对子放空防线"
    },
    {
      "round": 4,
      "tier": 1,
      "action": "攒够3个对子以上碰三合一，借复奏拿双2阶（优先云迹/渡桥/承曦格雷伊/复奏）"
    },
    {
      "round": 5,
      "tier": 1,
      "action": "【推导】把对子留到奖励档位合适时再合；检查手牌能否支持下一轮升三本碰四阶"
    },
    {
      "round": 6,
      "tier": 3,
      "action": "新稿参考：连升三本，锁好三连碰霍尔海雅、黑键等四阶核心；经济或战力不足先稳场"
    },
    {
      "round": 7,
      "tier": 3,
      "action": "【推导】用合成奖励找霍尔海雅或黑键；核心未到先补精准奥术，战力稳再升四本"
    },
    {
      "round": 8,
      "tier": 3,
      "action": "【推导】维持本轮三连并锁下轮对子；有战力且升本后仍能三连可提前四本，否则按R9参考线"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "新稿参考：升四本，用对子碰薇薇安娜、纯烬艾雅法拉，凑齐聚合与道中叠层搭档"
    },
    {
      "round": 10,
      "tier": 4,
      "action": "【推导】核对叠层位置、主C精锐和技能启动；核心未齐可多停一轮，别只追高本"
    },
    {
      "round": 11,
      "tier": 4,
      "action": "【推导】仅剩五阶与至多一名四阶未精锐时评估升五，结合对子与当轮三连；不因到了R11硬升"
    },
    {
      "round": 12,
      "tier": 4,
      "action": "【推导】承曦被Ban且选择转职补位时，可R11/12上五碰缪尔赛思；其余情况先补现有核心"
    },
    {
      "round": 13,
      "tier": 4,
      "action": "【推导】保每轮一次复奏，第二次三连可留到下轮；新稿不强制六本，有余力才走高本装备分支"
    },
    {
      "round": 14,
      "tier": 4,
      "action": "【推导】准备关底佩佩、黑键换夜莺、承曦格雷伊；按Ban选择替代，核对三聚合与主C存活"
    },
    {
      "round": 15,
      "tier": 4,
      "action": "【推导】按既定分支完成关底换人，检查输出射程与治疗覆盖；已升五六本按实际档位补装，不拆成熟体系"
    }
  ]
},
  {
  "id": "yan-bastion-chen-wang",
  "title": "杜遥夜四本炎 · 精锐风絮",
  "subtitle": "四本追风絮，策略火陈或已取得的老鲤接输出",
  "difficulty": "新手轮椅",
  "strategist": "杜遥夜（火陈外援）",
  "strategistTip": "保血与升本资金优先，R5~6四本作参考；二本不强追经济组件，成型后按需升本。",
  "covenants": [
    "3炎",
    "聚合",
    "灵巧",
    "坚守（按需）"
  ],
  "imageUrl": "/assets/aistudio/05e26e934e562dc78febb551ab9c3366_31155c5f.png",
  "secondaryImageUrl": "/assets/community/source-049.jpg",
  "coreHighlight": "精奥受限时，先用坚守聚合稳场，再上精锐风絮、余和仇白。仇白配华法琳叠灵巧，火陈或精锐老鲤到手再换输出。",
  "equipmentTips": [
    "四本优先风絮精锐、有效叠灵巧与主C装备；先核对灵巧、聚合是否有足够存活组件。余可补阻挡，但不是本分支每局唯一启动卡。",
    "049的四五百层炎、三四百层聚合与一两百层灵巧是作者终盘样本，不是人数要求或通关阈值。帖子中火陈面对Boss用远距离狙击镜还是贴脸的问题没有明确答复，按实际攻击覆盖与生存调整。",
    "火陈六阶，不能四本直购；老鲤五阶，四本也不能直购。已有精锐老鲤可选2技能替代缺席火陈，不能把替代卡写成低本必出。",
    "014、065：前期能开三坚守、两聚合就先稳场。仇白1技能配华法琳叠灵巧；道中群怪挡不住可试2技能。沿用杜遥夜刷新，不套拜松包店节奏。",
    "030速四分支：R2没来牌可用杜遥夜刷新，R4三本碰四阶，R5找风絮/乌有，R6四本锁余/仇白/华法琳，R7后追核心精锐与两投资人。与旧图前期不开策略的省钱分支分开选。",
    "030作者用余2、仇白1，核心齐后再升五；远见奇迹顺带即可。“五本火陈”不能理解为五本直购六阶，须由策略外援实际取得。评论指出治疗迟到、无余或高压怪潮可能暴毙；升本后买不起战力就延后。",
    "049与030的取舍：四本先搜精锐风絮，不为投资人/奇迹强追低本组件；049正文也允许之后升五补火陈相关支援，前提是不过多损失风絮叠层。030与慢六炎另有上五线，不把不同经济线同时当必做；随机刷新会空刷，不能保证核心按时到。",
    "046四本炎补充：三本起抓有用本家，四本找风絮、余、仇白与实际灵巧来源；投资人顺手开，不为100投资人耽误主战力。余2技能偏道中清杂，精锐老鲤2技能可作Boss输出，作者提醒不要同时摆两个行商。",
    "046高阶支援为碰五或升本后选择：佩佩面对仇白/老鲤，塞雷娅面对风絮/可露希尔；可露希尔可补投资人与战力，之后也可换老鲤。这里只记录相对对象，不给未经证实的固定坐标。",
    "生存与退路：049承认次数怪和寒霜飞机难处理；046有前期崩线、关键牌迟到与元素持续险路失败反馈。先补当轮阻挡、治疗和输出，不能预设队友兜底或只靠高层数过关。",
    "《终极隐藏构筑讨论》的另一分支：莱塔尼亚与逻各斯均被Ban时，复奏走双火陈灵巧炎，作者建议三投资人补经济；可只上七人、不强凑六炎。双火陈需要实际取得，与本卡杜遥夜给卡线分开，不视为固定保底。",
    "该分支不为精准/奥术硬追转职占人口，资源优先火陈有效装备；作者称六本合成动能轰击弩难遇，另提五本“元素瓶”可重复装备。后者为原帖俗称，正式名称和数值未核实，以游戏装备说明为准。"
  ],
  "phases": [
    {
      "phaseName": "前期锁血升本",
      "rounds": "1~4回合",
      "shopTier": "1~3本",
      "covenantTarget": "2坚守 / 2聚合 / 2灵巧",
      "fieldOperators": [
        {
          "name": "摆渡人",
          "tier": "I",
          "role": "一本强力坚守盾"
        },
        {
          "name": "褐果",
          "tier": "I",
          "role": "低本过渡医疗",
          "note": "中期换夜莺或华法琳"
        },
        {
          "name": "风絮",
          "tier": "III",
          "role": "中期炎+聚合核心过渡"
        }
      ],
      "benchOperators": [
        {
          "name": "夏栎",
          "tier": "I",
          "note": "整备区自动叠最高层盟约"
        },
        {
          "name": "星源",
          "tier": "II",
          "note": "整备区自动叠最高层盟约"
        }
      ],
      "keyActions": [
        "先买能守路的低阶牌与对子，给三本和四本留钱；049不在二本死找云迹、空弦，未开投资人也可推进。"
      ]
    },
    {
      "phaseName": "四本风絮与策略输出",
      "rounds": "5~15回合（按经济顺延）",
      "shopTier": "5~6回合视经济上四，四本可收束",
      "covenantTarget": "炎 / 聚合 / 灵巧，坚守按承压补；人数按实际组件核对",
      "fieldOperators": [
        {
          "name": "风絮",
          "tier": "III",
          "role": "优先精锐的炎/聚合组件"
        },
        {
          "name": "仇白",
          "tier": "IV",
          "role": "灵巧叠层候选",
          "note": "1技能配华法琳；未到不代表整套无法继续"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "叠层支援与治疗",
          "note": "覆盖仇白等实际受益目标"
        },
        {
          "name": "余",
          "tier": "IV",
          "role": "阻挡与生存候选",
          "note": "030作者使用2技能；按敌人类型与承压选择"
        },
        {
          "name": "假日威龙陈",
          "tier": "VI",
          "role": "策略外援主C",
          "note": "实际取得后部署，四本不能直购"
        },
        {
          "name": "老鲤",
          "tier": "V",
          "role": "缺火陈时的替代候选",
          "note": "已有精锐可选2技能；四本须通过奖励或适用策略取得"
        }
      ],
      "benchOperators": [
        {
          "name": "淬羽赫默",
          "tier": "IV",
          "note": "强化整备区叠层"
        }
      ],
      "keyActions": [
        "先追精锐风絮与当前战力，按实际成员补聚合和灵巧；这六名是候选，不是天然开齐所有盟约的固定六人阵。",
        "策略火陈到位再换输出；缺卡先维持成熟阵容，不为追六炎或六阶拆生存底座。"
      ]
    },
    {
      "phaseName": "可选高本出口（非必经）",
      "rounds": "四本成型且经济有余后",
      "shopTier": "按需五/六本，不与四本收束线强行混用",
      "covenantTarget": "保成熟灵巧聚合，按来牌扩6炎或补高阶输出",
      "fieldOperators": [
        {
          "name": "塔露拉",
          "tier": "VI",
          "role": "六阶不屈/炎系决战终端"
        },
        {
          "name": "酒神",
          "tier": "VI",
          "role": "六阶维多利亚/奇迹终端"
        },
        {
          "name": "余",
          "tier": "IV",
          "role": "不死主T+拉怪"
        },
        {
          "name": "仇白",
          "tier": "IV",
          "role": "近卫副C"
        },
        {
          "name": "黍",
          "tier": "V",
          "role": "五阶炎/远见护佑盾"
        },
        {
          "name": "塞雷娅",
          "tier": "V",
          "role": "三盾聚合永动机"
        },
        {
          "name": "遥",
          "tier": "VI",
          "role": "六阶聚合/奇迹支援"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "拿到【塔露拉】、【酒神】或【烛煌】后检查输出与生存；余2技能对适用的小体型Boss可调整位置，仍需确保主C射程覆盖"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】抓摆渡人、褐果等有效前排与治疗；杜遥夜技能按当前战力和资金使用，不只为省钱持续漏怪"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "【推导】先用坚守和聚合守场；有牌就向三坚守、两聚合补，留升本与买牌钱"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】少刷新，攒升三本与碰四阶的钱；有现成对子保留，选能处理的悬赏"
    },
    {
      "round": 4,
      "tier": 3,
      "action": "【推导】经济允许升三找风絮，策略或对子尝试余、仇白等四阶；按现成战力推进，不把指定卡当必出"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "来源区间049：5~6回合有资金可上四，先风絮与即时战力；不为追云迹、空弦和投资人滞留二本"
    },
    {
      "round": 6,
      "tier": 4,
      "action": "来源区间030/049：四本用策略刷新，优先风絮精锐；买不起战力则延后升本，不假定随机刷新必出"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "【推导】用风絮与可用成员补聚合，仇白1技能配华法琳叠灵巧；余可补生存，缺仇白先用已有战力"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】检查AOE、对空和远程怪压力；按缺口补输出或治疗，不只堆盾"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】优先精锐风絮与有效灵巧循环，策略取得火陈再换位；六阶火陈不是四本商店卡"
    },
    {
      "round": 10,
      "tier": 4,
      "action": "【推导】检查炎、聚合和灵巧实际人数；仇白未到先保成熟输出，不因模板停掉整套构筑"
    },
    {
      "round": 11,
      "tier": 4,
      "action": "【推导】四本已稳就继续精锐与装备；确需五阶支援且有余钱才上五，不按回合强升"
    },
    {
      "round": 12,
      "tier": 4,
      "action": "【推导】火陈未到而已有精锐老鲤，可参考2技能替代；老鲤五阶，四本须奖励或适用策略取得"
    },
    {
      "round": 13,
      "tier": 4,
      "action": "【推导】为大体型Boss核对聚合、灵巧循环与实际伤害，作者层数只作参考；不强凑六炎"
    },
    {
      "round": 14,
      "tier": 4,
      "action": "【推导】调整主C射程、狙击镜距离与治疗；高本出口只在当前阵容和经济允许时选择"
    },
    {
      "round": 15,
      "tier": 4,
      "action": "【推导】以成熟火陈或老鲤等输出收束，保灵巧聚合底座；不临场赌六阶终端"
    }
  ]
},
  {
  "id": "victoria-bastion-jessica",
  "title": "坚守维多利亚 · 涤火杰西卡",
  "subtitle": "四本坚守底座，取得高阶与转职后再扩六维",
  "difficulty": "新手轮椅",
  "strategist": "杰西卡（集结指示） / 变形者集群（变形同构）",
  "strategistTip": "杰西卡策略参考R7找涤火；复奏可三本碰四阶。精锐和生存稳定后再考虑升本。",
  "covenants": [
    "3/6维多利亚",
    "3坚守",
    "2助力",
    "灵巧",
    "聚合（按需）"
  ],
  "imageUrl": "/assets/aistudio/bd7b9f5af0ce29a4c9b417fb9c80c354_e3603720.png",
  "secondaryImageUrl": "/assets/community/source-043.jpg",
  "coreHighlight": "先守住道中，再用涤火杰西卡开三维三坚守。水灯心可过渡；群怪、对空和关底伤害缺哪项就补哪项。",
  "equipmentTips": [
    "注意（056求助帖的回帖建议）：先用精准、灵巧、坚守等实际战力过渡，涤火杰西卡到手再转三维；核心迟到或装备不足就保过渡阵，别用八格硬塞六维三坚守。",
    "涤火杰西卡到位后，优先买便宜有效的装备，按场上带装备干员数叠维多利亚与坚守。三维能守再看五本塞雷娅与高阶输出，Boss不必硬凑六维。",
    "NGA 066：若选机械师，低本用每轮两次免费装备刷新找能合的对子。合并并进阶后拿免费三选一，四本再找涤火杰西卡；不把白铁自动升装算作这次手动合并。",
    "NGA 074：没拿到转职时，可有条件用承曦格雷伊等三精准配三维守路。遇到连续怪海要加群攻；水灯心只是过渡，不押作唯一关底输出。",
    "065 灵巧坚守分支：塞雷娅到手后站在涤火杰西卡身后复制叠层；华法琳朝向水灯心。白铁只进阶自身携带的装备，可在休整期后再分配。",
    "有维多利亚转职可给【塞雷娅】或【佩佩】（有佩佩可换云迹）",
    "补充技能选择（FireShot 009）：涤火杰西卡2技能偏输出、3技能偏道中稳定；按当前清怪和生存缺口选择。",
    "野排变体（FireShot 014）：涤火杰西卡、塞雷娅、罗比菈塔、白铁搭3坚守与2助力，聚合可用时补生存；补足AOE与对空，坚守层数高不代表能及时清怪。",
    "灵巧坚守助力分支（FireShot 015/018，同一篇）：水灯心1技能、白铁3技能、涤火杰西卡2技能配罗比菈塔；四人框架还需补1灵巧与1坚守，才能开齐目标。",
    "前期云迹过渡，中期华法琳对水灯心叠灵巧，罗比到位补助力。3~4本可长停找核心；助力后期保2即可，压力大可四本收束，不必追六本酒神。",
    "后期转维精锐帕拉斯3技能是有转职时的选择；原帖与非精锐烛煌作比较，不能据此认定帕拉斯普遍更强。",
    "FireShot 032补充（与015/018同路线）：生存已足时可让助力位换输出，奥术也是可选分支；仍先满足三坚守与实际清怪需求，不把辅助词条全部列为必带。",
    "三坚守维补充（FireShot 021）：先3维启动装备与叠层，塞雷娅对涤火杰西卡，白铁升级装备；是否补余和3炎看来牌，不是每局固定终盘。",
    "纯奥维失败排错（FireShot 023）：一派用已有转职补3精准与输出终端；另一派保3坚守、华法琳与水灯心叠灵巧。按现有资源选一条，不把精奥灵守聚合六维全列为必选，也别等到11回合才补第一个核心。",
    "《终极隐藏构筑讨论》补充风险：作者自述维多利亚经验较少，强调全员装备的费用与操作成本；成型叠层强不等于前期稳，仍需补本家输出或条件转职，不能只凑装备人数。",
    "043大变分支：空弦可用、有对应策略与转职才考虑四本双精锐空弦终端；水灯心配华法琳，青枳补坚守。海霜转维属于该条件变体，原帖“一回合12层”是作者陈述，不当通用固定收益；保留现有奥术外援线，不把“不叠奥术”套到所有维阵。",
    "043的另一条是森蚺二本大丑兜底，之后再接维；“核心来前不买无用装备”来自这条经济线。帖子同时有核心11~12回合才到、早期崩线和无检索找不到输出的反例，不能预支终盘层数或队友兜底。",
    "047追随者是策略选择，非新固定阵容。前期高压才多放坚守聚合，核心到位且能守路后腾出过渡位；坚守与灵巧并行，先处理本波对空、次数怪与阻挡缺口，再考虑六维。追随者与复奏各有随机性，不以作者连胜作保证。",
    "050失败局纠偏：道中以3维与坚守占约四五个位置，余位留聚合、灵巧和实际输出；高压可保3坚守，不为硬凑6维挤掉生存与叠层手。先看核心精锐、清怪和余钱，再决定上五六本；这是道中取舍，不删除已成型后的六维上限线。"
  ],
  "phases": [
    {
      "phaseName": "前期阵容组成与三路灵活过渡",
      "rounds": "1~5回合",
      "shopTier": "1~3本",
      "covenantTarget": "2维多利亚 + 1坚守（配2远见/2助力/2奇迹过渡）",
      "fieldOperators": [
        {
          "name": "慕斯",
          "tier": "I",
          "role": "维多利亚/奥术起手"
        },
        {
          "name": "折光",
          "tier": "II",
          "role": "送维式重锤"
        },
        {
          "name": "Miss.Christine",
          "tier": "II",
          "role": "使自身携带装备变为精锐"
        },
        {
          "name": "水灯心",
          "tier": "III",
          "role": "弱点输出",
          "note": "先用现有装备；到手涤火杰西卡再按装备人数叠层"
        },
        {
          "name": "罗比菈塔",
          "tier": "III",
          "role": "坚守+助力过渡"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "精准+远见过渡"
        }
      ],
      "benchOperators": [
        {
          "name": "星源",
          "tier": "II",
          "note": "整备区挂机叠最高层盟约"
        },
        {
          "name": "矩",
          "tier": "II",
          "note": "整备区激活奇迹"
        }
      ],
      "keyActions": [
        "前期在现有远见、坚守或灵巧中选过渡。精奥受限就先用坚守、灵巧与治疗；装备优先买能马上增加战力的。"
      ]
    },
    {
      "phaseName": "四本涤火杰西卡底座",
      "rounds": "6~9回合",
      "shopTier": "参考R7四本，缺资金延后",
      "covenantTarget": "3维多利亚 / 3坚守；灵巧与助力按来牌",
      "fieldOperators": [
        {
          "name": "涤火杰西卡",
          "tier": "IV",
          "role": "按装备人数叠维多利亚与坚守",
          "note": "策略适用或四本购买，未到先用当前输出"
        },
        {
          "name": "水灯心",
          "tier": "III",
          "role": "弱点输出，吃华法琳朝向"
        },
        {
          "name": "罗比菈塔",
          "tier": "III",
          "role": "同行人数叠坚守+助力"
        },
        {
          "name": "白铁",
          "tier": "IV",
          "role": "进阶自身装备，补助力"
        },
        {
          "name": "蛇屠箱",
          "tier": "II",
          "role": "第三坚守；塞雷娅未到时顶前排"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "对水灯心叠灵巧与治疗"
        }
      ],
      "benchOperators": [
        {
          "name": "云迹",
          "tier": "II",
          "note": "后台保留奇迹组件；免费刷新需上场，不能只放整备区计收益"
        },
        {
          "name": "矩",
          "tier": "II",
          "note": "整备区激活奇迹"
        }
      ],
      "keyActions": [
        "3维多利亚+3坚守作为生存底座，配白铁与罗比补2助力；四本用对子碰五阶塞雷娅，当前战力足且需要五阶时再升本"
      ]
    },
    {
      "phaseName": "四本精锐与生存收束",
      "rounds": "10~15回合",
      "shopTier": "四本可停，高本按缺口选择",
      "covenantTarget": "3维多利亚 / 3坚守 / 2灵巧 / 2助力；聚合按需",
      "fieldOperators": [
        {
          "name": "涤火杰西卡",
          "tier": "IV",
          "role": "按装备人数叠维多利亚与坚守",
          "note": "策略适用或四本购买，未到先用当前输出"
        },
        {
          "name": "水灯心",
          "tier": "III",
          "role": "弱点输出，吃华法琳朝向"
        },
        {
          "name": "罗比菈塔",
          "tier": "III",
          "role": "同行人数叠坚守+助力"
        },
        {
          "name": "白铁",
          "tier": "IV",
          "role": "进阶自身装备，补助力"
        },
        {
          "name": "蛇屠箱",
          "tier": "II",
          "role": "第三坚守；有塞雷娅再换位"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "对水灯心叠灵巧与治疗"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "优先涤火杰西卡精锐、三坚守与有效治疗；五阶塞雷娅取得后可换入。",
        "六维和转职齐后再手动切高本阶段，缺终端保四本主体。"
      ]
    },
    {
      "phaseName": "条件六维高本终端",
      "rounds": "取得高阶与足够本家后手动选择",
      "shopTier": "高阶须奖励或对应商店档位",
      "covenantTarget": "3/6维多利亚 / 3坚守 / 2助力，灵巧与聚合按需",
      "fieldOperators": [
        {
          "name": "涤火杰西卡",
          "tier": "IV",
          "role": "坚守维多利亚主C"
        },
        {
          "name": "维娜·维多利亚",
          "tier": "V",
          "role": "维多利亚+奇迹核心"
        },
        {
          "name": "塞雷娅",
          "tier": "V",
          "role": "特异化复制叠层盾"
        },
        {
          "name": "水灯心",
          "tier": "III",
          "role": "凑齐6维多利亚本家"
        },
        {
          "name": "凯瑟琳",
          "tier": "III",
          "role": "维多利亚+不屈护盾"
        },
        {
          "name": "白铁",
          "tier": "IV",
          "role": "休整期精准+助力+20"
        },
        {
          "name": "烛煌",
          "tier": "VI",
          "role": "元素爆条叠维多利亚+炎"
        },
        {
          "name": "酒神",
          "tier": "VI",
          "role": "六阶维多利亚/奇迹终端"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "上述六维名单为高本上限候选；四本可保涤火杰西卡、水灯心、白铁、罗比与华法琳，再补一名坚守。高阶终端没来不必等，实际取得转职与足够本家牌再扩六维"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】拿便宜战力和对子，以前排、治疗为底座；不因只追维多利亚放弃能守路的牌"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "【推导】按来牌补维与坚守；优先买有效战力和能马上提升战力的装备"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】留对子为三本碰四阶准备；灵巧、助力、远见按发牌选一条过渡"
    },
    {
      "round": 4,
      "tier": 3,
      "action": "根据发牌用空弦+渡桥（远见）或云迹+承曦格雷伊（奇迹灵巧）过渡"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "【推导】补水灯心、罗比菈塔及现成坚守位，先补3坚守；有对子就尝试碰涤火杰西卡"
    },
    {
      "round": 6,
      "tier": 3,
      "action": "【推导】用对子或策略检索核心；经济和血量允许可提前四本，没钱先买战力"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "7回合速4本！用寻呼模块或对子三合一找出核心卡【涤火杰西卡】"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】追涤火杰西卡精锐并找白铁，装备优先能立刻提高战力的；缺续航补聚合"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】核心没精锐继续四本找白铁、华法琳；需要塞雷娅等五阶且有余钱才升五，或用对子碰五"
    },
    {
      "round": 10,
      "tier": 4,
      "action": "【推导】给塞雷娅安排可复制的叠层目标，补AOE和对空；六维条件不够先保三维坚守"
    },
    {
      "round": 11,
      "tier": 4,
      "action": "【推导】分别检查主C伤害和盾奶存活，杰西卡2偏输出、3偏稳场，按缺口调整"
    },
    {
      "round": 12,
      "tier": 4,
      "action": "【推导】四本能稳住可收束，经济足再补五六阶输出与装备；有牌扩六维，不能只扛不杀"
    },
    {
      "round": 13,
      "tier": 4,
      "action": "【推导】已上五六本就补对应终端，仍在四本则强化现有输出；不为六维人数挤掉坚守灵巧底座"
    },
    {
      "round": 14,
      "tier": 4,
      "action": "【推导】决战核对范围伤害、对空、聚合覆盖与技能启动；高坚守不能替代伤害"
    },
    {
      "round": 15,
      "tier": 4,
      "action": "【推导】按最终敌人调整输出朝向与治疗站位，空装备穿满；不临场拆成熟的坚守生存线"
    }
  ]
},
  {
  "id": "kazimierz-fartooth-6",
  "title": "六卡西 · 远牙玛恩纳",
  "subtitle": "砾再部署叠层，四本玛恩纳远牙稳场",
  "difficulty": "进阶公式",
  "strategist": "卡西米尔 / 任意策略家",
  "strategistTip": "六卡激活后，整备区最右侧留卡西干员接召唤；主力尽量在远牙射程内。",
  "covenants": [
    "6卡西米尔",
    "3不屈",
    "2突袭"
  ],
  "imageUrl": "/assets/aistudio/bba35c19e269a4f120602e9edd23f9bc_d0a3c042.png",
  "secondaryImageUrl": "/assets/aistudio/e778a8ca1370b949f540e862a04df703_f94c3d19.png",
  "coreHighlight": "砾叠不屈与卡西米尔，玛恩纳输出，远牙帮助再部署。六卡按实际人数开启，未齐先用四本精锐与三不屈守路。",
  "equipmentTips": [
    "卡西米尔转职章优先给高攻速或强力前排，凑齐6卡西米尔触发65%真伤",
    "砾带减少再部署时间装备，整备区最右侧放【耀骑士临光】或【焰尾】等召唤入场爆发",
    "补充收束路线（FireShot 014）：四本取得精锐玛恩纳后，3不屈辅助回转可先稳住；耀骑士临光是后续上限，不必每局强追五六本。此变体不替代原六卡西米尔配方。"
  ],
  "phases": [
    {
      "phaseName": "前中期：找砾与红松过渡",
      "rounds": "1~5回合",
      "shopTier": "1~3本",
      "covenantTarget": "3卡西米尔 / 2不屈",
      "fieldOperators": [
        {
          "name": "野鬃",
          "tier": "I",
          "role": "部署+1/2卡西米尔层数"
        },
        {
          "name": "砾",
          "tier": "II",
          "role": "核心叠层",
          "note": "部署时卡西米尔+不屈层数+2/4（每场至多12/24层）"
        },
        {
          "name": "风丸",
          "tier": "III",
          "role": "部署自身盟约+3/6"
        },
        {
          "name": "乌啾",
          "tier": "III",
          "role": "倒地召唤整备区卡西米尔并减30%/60%再部署"
        }
      ],
      "benchOperators": [
        {
          "name": "历阵锐枪芬",
          "tier": "III",
          "note": "放在整备区最右侧待命被召唤上场"
        }
      ],
      "keyActions": [
        "反复撤退再部署【砾】与【野鬃】快速拉高卡西米尔与不屈层数"
      ]
    },
    {
      "phaseName": "后期：远牙射程阵 + 玛恩纳耀光真伤",
      "rounds": "6~15回合",
      "shopTier": "4~6本",
      "covenantTarget": "6卡西米尔 / 3不屈 / 2突袭",
      "fieldOperators": [
        {
          "name": "玛恩纳",
          "tier": "IV",
          "role": "本家绝对站场主C",
          "note": "卡西米尔每5层加基础攻10/20、生命50/100"
        },
        {
          "name": "远牙",
          "tier": "IV",
          "role": "减CD引擎",
          "note": "射程内每击倒1敌使射程内及整备区再部署-3/6秒"
        },
        {
          "name": "焰尾",
          "tier": "V",
          "role": "休整期按整备区人数加卡西米尔+迅捷"
        },
        {
          "name": "薇薇安娜",
          "tier": "V",
          "role": "同盟约叠层上限+7/14"
        },
        {
          "name": "耀骑士临光",
          "tier": "VI",
          "role": "倒地召唤+盟约+6/12，回技力真伤战神"
        },
        {
          "name": "史尔特尔",
          "tier": "VI",
          "role": "不屈/突袭决战大C"
        }
      ],
      "benchOperators": [
        {
          "name": "耀骑士临光",
          "tier": "VI",
          "note": "放整备区最右侧触发召唤连携"
        }
      ],
      "keyActions": [
        "把主力干员全部摆在【远牙】攻击范围内，杀怪无限刷新再部署CD，开出6卡西米尔刀刀烈火65%真伤"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】野鬃或可用前排配即时输出，先留对子，不在一本硬搜砾"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "抓砾与野鬃，每场战斗反复部署刷满砾的12/24层上限"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】继续补砾与现成卡西牌；战斗操作兼顾本路，不为刷再部署漏怪"
    },
    {
      "round": 4,
      "tier": 3,
      "action": "【推导】经济够则上三本，找乌啾、风丸等过渡；对子奖励尝试玛恩纳或远牙"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "【推导】留可合成对子准备四阶核心，补足前排和对空；核心到位可提前升四本"
    },
    {
      "round": 6,
      "tier": 4,
      "action": "升4本第一优先级抓玛恩纳与远牙，全员摆进远牙射程"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "【推导】优先精锐玛恩纳与3不屈回转；缺远牙先以现有核心稳住，不空等完整六卡"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】确认远牙射程覆盖与砾循环，守不住先补防护装备；按来牌找合适转职"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】精锐玛恩纳已够用可停四本收束，缺关键五阶卡且经济足再升五本"
    },
    {
      "round": 10,
      "tier": 5,
      "action": "凑齐6卡西米尔，备战席最右侧留卡触发召唤与真伤"
    },
    {
      "round": 11,
      "tier": 5,
      "action": "【推导】核对六卡人数和整备区最右召唤位；缺转职先保三卡不屈的实战强度"
    },
    {
      "round": 12,
      "tier": 5,
      "action": "【推导】给主C补输出装备，耀骑士临光属于六阶上限，需奖励碰出或再升本"
    },
    {
      "round": 13,
      "tier": 5,
      "action": "【推导】将只为叠层的多余位置换成决战输出，保留再部署链和必要的后台卡西位"
    },
    {
      "round": 14,
      "tier": 5,
      "action": "【推导】分别检查Boss输出与前排承伤，三不屈回转不够时先修装备和技能"
    },
    {
      "round": 15,
      "tier": 5,
      "action": "【推导】锁定最终整备区顺序、主力射程和复活循环，停止为追耀骑士临光透支成熟阵容"
    }
  ]
},
  {
  "id": "kjerag-permafrost-3",
  "title": "三谢远见 · 双冰空弦",
  "subtitle": "空弦戴冰，初雪覆盖冻结；寒檀补远见经济",
  "difficulty": "进阶公式",
  "strategist": "远见 / 复奏 / 任意策略家",
  "strategistTip": "先有云迹、华法琳等灵巧来源再投入循环；缺发动机先保精准坚守，精迅线另选雪猎方案。",
  "covenants": [
    "3谢拉格",
    "远见",
    "灵巧/奥术（可选）",
    "精准/迅捷（可选）"
  ],
  "imageUrl": "/assets/aistudio/99896ed8f4e0e6febfb86823c73e873c_2ab3353f.png",
  "secondaryImageUrl": "/assets/community/source-041.jpg",
  "coreHighlight": "耶拉产不融冰给空弦，普通初雪覆盖冻结区，寒檀补远见。免控或伤害不足时补直接输出和生存。",
  "equipmentTips": [
    "核心装备：【谢拉格不融冰】（由3阶耶拉获得时产出1/2件）直接绑给高攻速的【空弦】或主C",
    "两名远见即可激活，整备区也可凑人数。按随附盟约记录，每10层给2资金，80层与150层各降低1点远见干员购买价。",
    "041灵巧启动：前期云迹，后期实际取得佩佩或华法琳后再强化循环；已有外援仇白也可另选灵巧支线。缺这些发动机先用精准坚守保战力，未确认的“牛牛”昵称不绑定实名。",
    "灵奥与精迅占用不同位置。灵巧给附近干员攻速，迅捷在技能结束时有概率返还技力；按主C与本波压力选。",
    "普通初雪靠攻击范围内的冻结叠谢拉格；圣聆初雪还会回自身技力。凛御银灰才提高身前符合条件干员的战斗叠层上限，寒檀本身只挂远见。",
    "追随者前期可用角峰等坚守配治疗，云迹到手再投灵巧。063/064 的装备开局与格雷伊控场另见“机械师谢拉格 · 格雷伊控场”。",
    "该帖允许雪猎道中暂下、Boss再上，也讨论普通初雪与圣聆初雪的不同位置。Mon3tr或阿米娅是已取得后的治疗/上限候选，Boss须检查其存活；原帖以“芦苇”替换的想法仍是作者试验，不作为成熟解。",
    "转型前先验证实际输出：核心可用不代表会及时发牌；坚守聚合能站住也可能超时漏怪。保留当轮必要生存，免控Boss或冻控不足时改直接输出，不保证全程冻结。"
  ],
  "phases": [
    {
      "phaseName": "前中期：远见经济与不融冰收集",
      "rounds": "1~6回合",
      "shopTier": "1~3本",
      "covenantTarget": "2远见过渡；角峰、雪猎、耶拉到齐再开3谢",
      "fieldOperators": [
        {
          "name": "角峰",
          "tier": "I",
          "role": "谢拉格前排"
        },
        {
          "name": "雪猎",
          "tier": "II",
          "role": "获得时谢拉格+精准层数+4/8"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "role": "远见叠层核心"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "远见+精准永冻射手",
          "note": "佩戴双不融冰，进入休整期自身及身前+6层"
        },
        {
          "name": "耶拉",
          "tier": "III",
          "role": "产谢拉格不融冰",
          "note": "普通/精锐获得时给1/2件不融冰"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "灵巧启动候选",
          "note": "有实际叠层来源再投入灵巧，不只凑标签"
        }
      ],
      "benchOperators": [
        {
          "name": "地灵",
          "tier": "I",
          "note": "整备区的远见干员也可用于激活盟约"
        }
      ],
      "keyActions": [
        "买耶拉拿【谢拉格不融冰】给空弦；远见至少两人成组，再计算经济收益。"
      ]
    },
    {
      "phaseName": "四本远见空弦冻控",
      "rounds": "7~15回合",
      "shopTier": "长停4本，经济与战力足再选5本支援",
      "covenantTarget": "3谢拉格 / 2远见；灵巧与精准按来牌",
      "fieldOperators": [
        {
          "name": "角峰",
          "tier": "I",
          "role": "前排与谢拉格"
        },
        {
          "name": "耶拉",
          "tier": "III",
          "role": "供冰与谢拉格"
        },
        {
          "name": "寒檀",
          "tier": "IV",
          "role": "休整期叠远见，补经济"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "佩戴双不融冰高频致冻"
        },
        {
          "name": "初雪",
          "tier": "III",
          "role": "冻结叠谢拉格",
          "note": "攻击范围覆盖空弦的冻结区"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "灵巧发动机候选",
          "note": "按实际受益目标安排覆盖；缺灵巧可改走精迅"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "四本寒檀补远见，普通初雪覆盖空弦控住的怪。保持三谢；剩余位置先补前排、治疗或对空。",
        "先验证云迹或华法琳等灵巧来源与生存；已取得高阶支援再手动切条件阶段。"
      ]
    },
    {
      "phaseName": "条件高阶支援",
      "rounds": "取得五六阶支援后手动选择",
      "shopTier": "五阶须奖励或五本，六阶须奖励或六本",
      "covenantTarget": "3谢拉格 / 2远见；优先补实战输出",
      "fieldOperators": [
        {
          "name": "寒檀",
          "tier": "IV",
          "role": "休整期叠远见，补经济"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "佩戴双不融冰高频致冻"
        },
        {
          "name": "初雪",
          "tier": "III",
          "role": "冻结叠谢拉格",
          "note": "攻击范围覆盖冻结区"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "灵巧发动机候选",
          "note": "按实际受益目标安排覆盖；缺灵巧可改走精迅"
        },
        {
          "name": "圣聆初雪",
          "tier": "V",
          "role": "可选寒冷与输出支援",
          "note": "攻击范围内触发冻结可回自身技力；五阶须奖励或升五"
        },
        {
          "name": "凛御银灰",
          "tier": "V",
          "role": "前排与叠层支援",
          "note": "身前一格放符合谢拉格/灵巧条件的干员"
        },
        {
          "name": "逻各斯",
          "tier": "VI",
          "role": "终极远见法核大C"
        }
      ],
      "benchOperators": [
        {
          "name": "溯光星源",
          "tier": "V",
          "note": "整备区凑齐高层远见"
        },
        {
          "name": "妮芙",
          "tier": "VI",
          "note": "整备区凑齐高层远见"
        }
      ],
      "keyActions": [
        "高阶候选按实际取得和空位替换，不要求全部上场。",
        "保留寒檀空弦控制链，免控或伤害不足时以直接输出和生存为先。"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】拿便宜前排、输出和对子，给后续远见组件留空位"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "抓渡桥、雪猎；远见须两名，谢拉格须三名，未凑齐先保现成战力"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】找渡桥与现成远见对子；保战力和升三本的钱，不硬追三谢拉格"
    },
    {
      "round": 4,
      "tier": 2,
      "action": "【推导】准备空弦与耶拉的三阶档位；有钱且对子合适可提前三本"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "抓空弦与耶拉，把耶拉给的不融冰塞给空弦"
    },
    {
      "round": 6,
      "tier": 3,
      "action": "【推导】补空弦、耶拉与普通初雪，对子尝试寒檀；先确认云迹等灵巧发动机，缺卡保精准坚守"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "【推导】资金够再升四找寒檀补远见；让普通初雪攻击范围罩住空弦的冻结区"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】追寒檀与初雪精锐，华法琳或奖励佩佩到位再强化灵巧；五阶支援不能四本直购"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】检查普通初雪对冻结区的覆盖；空弦没打到关键路就先调方向"
    },
    {
      "round": 10,
      "tier": 4,
      "action": "【推导】保持三谢与小盟约，不为六谢拆控制链；对免控或漏控敌人补直接伤害"
    },
    {
      "round": 11,
      "tier": 4,
      "action": "【推导】主C与治疗仍未稳就继续四本；对子收益低且战力已足再准备五本"
    },
    {
      "round": 12,
      "tier": 4,
      "action": "【推导】评估Boss伤害，选择补装备还是升本碰终端；保留成熟寒檀空弦体系"
    },
    {
      "round": 13,
      "tier": 4,
      "action": "【推导】只有经济与战力允许才上五碰六阶逻各斯补输出；未出保现有寒檀空弦，不为表格强升"
    },
    {
      "round": 14,
      "tier": 4,
      "action": "【推导】六阶逻各斯靠五本奖励碰出或上六本取得；没来就用现有输出，不赌最后一张"
    },
    {
      "round": 15,
      "tier": 4,
      "action": "【推导】核对冰冻覆盖、主C射程和治疗位置，适当把纯叠层位换成即战力"
    }
  ]
},
  {
  "id": "minor-pact-dynasty-logos",
  "title": "小盟约 · 逻各斯条件终端",
  "subtitle": "四本精奥过渡，取得六阶逻各斯后转终端",
  "difficulty": "高难上限",
  "strategist": "任意策略家；可选复奏 / 森蚺等",
  "strategistTip": "先保精准奥术与生存，再补灵巧远见；有钱且升后能买牌再上高本。",
  "covenants": [
    "精准",
    "灵巧",
    "奥术",
    "远见",
    "奇迹"
  ],
  "imageUrl": "/assets/aistudio/f72f386c3d669a3f61f18dae3eb64b33_5b333aaa.png",
  "secondaryImageUrl": "/assets/aistudio/df942b1692d631fed4626a916500e23b_f3034bb2.png",
  "coreHighlight": "空弦、渡桥与华法琳搭叠层底座，现有精奥主C过渡。逻各斯实际取得后接有效输出装备，层数不能替代Boss伤害检查。",
  "equipmentTips": [
    "逻各斯毕业神装：【天马之翼】（攻击上限+160%，每次攻击造成160%真伤）+【佩尔森式】或双金色狙击镜",
    "普通加攻与乘区装备按主C实际收益选择，优先解决当前输出缺口，不因等毕业装空置装备位。远见达到190层后利用装备减费补输出装，先检查本局实际费用。",
    "《终极隐藏构筑讨论》认为逻各斯自带攻速、精锐后回转快，可作为精准奥术终端；小羊即使不凑莱塔也能吃精灵奥。属于作者的构筑意见，不能理解为无装备或固定层数必过。"
  ],
  "phases": [
    {
      "phaseName": "前中期：通用叠层机器启动",
      "rounds": "1~7回合",
      "shopTier": "1~4本",
      "covenantTarget": "2精准 / 2灵巧 / 2奥术 / 2远见",
      "fieldOperators": [
        {
          "name": "渡桥",
          "tier": "II",
          "role": "身前+4层"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "身前+6层"
        },
        {
          "name": "青枳",
          "tier": "III",
          "role": "身后+6层"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "赋予身前干员开技能+2层特质"
        }
      ],
      "benchOperators": [
        {
          "name": "夏栎",
          "tier": "I",
          "note": "后台挂机每回合+2最高层盟约"
        },
        {
          "name": "星源",
          "tier": "II",
          "note": "后台挂机每回合+4最高层盟约"
        },
        {
          "name": "淬羽赫默",
          "tier": "IV",
          "note": "使整备区每名干员已激活盟约+2"
        }
      ],
      "keyActions": [
        "把多词条干员（同时带精准/灵巧/奥术/远见）摆在渡桥、空弦身前与青枳身后，每回合休整期全盟约齐涨"
      ]
    },
    {
      "phaseName": "四本精奥底座与升本准备",
      "rounds": "8~15回合",
      "shopTier": "四本稳场，经济足再五六本",
      "covenantTarget": "精准奥术打底，补灵巧远见",
      "fieldOperators": [
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "叠层与过渡输出"
        },
        {
          "name": "黑键",
          "tier": "IV",
          "role": "奥术输出"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "精准远见"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "支援与治疗"
        }
      ],
      "benchOperators": [
        {
          "name": "夏栎",
          "tier": "I",
          "note": "后台挂机每回合+2最高层盟约"
        },
        {
          "name": "星源",
          "tier": "II",
          "note": "后台挂机每回合+4最高层盟约"
        },
        {
          "name": "淬羽赫默",
          "tier": "IV",
          "note": "使整备区每名干员已激活盟约+2"
        }
      ],
      "keyActions": [
        "先补精锐、装备与生存，缺输出不要只堆层数。",
        "五六阶实际取得后再手动切终端阶段，升本须留购买资金。"
      ]
    },
    {
      "phaseName": "条件逻各斯终端",
      "rounds": "六阶输出取得后手动选择",
      "shopTier": "5~6本",
      "covenantTarget": "保精奥输出与生存，其余按空位",
      "fieldOperators": [
        {
          "name": "逻各斯",
          "tier": "VI",
          "role": "六阶精奥主C",
          "note": "带天马之翼+双狙击镜/佩尔森式"
        },
        {
          "name": "阿米娅",
          "tier": "V",
          "role": "战斗中叠层放大器",
          "note": "身前一格干员每次提升层数额外+2"
        },
        {
          "name": "Mon3tr",
          "tier": "V",
          "role": "周围八格叠层上限+60%"
        },
        {
          "name": "帕拉斯",
          "tier": "VI",
          "role": "休整期自身及身前+18层"
        },
        {
          "name": "魔王",
          "tier": "VI",
          "role": "休整期核心盟约+20层"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "逻各斯取得后交接装备，其他高阶支援按空位选择。",
        "装备优先实际输出收益，Boss仍需检查射程、控制与生存。"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】拿能守路的便宜对子，不为未来六阶终端牺牲开局战力"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "抓渡桥、夏栎、星源，开启远见与小盟约底座"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】整理远见与精准组件，先补前排治疗；下一档要找三阶卡就留钱升本"
    },
    {
      "round": 4,
      "tier": 2,
      "action": "【推导】有对子和余钱可提前三本，否则买战力稳住，不空刷等空弦"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "补空弦、青枳，排好身前身后十字叠层阵"
    },
    {
      "round": 6,
      "tier": 3,
      "action": "【推导】空弦与渡桥互叠，青枳按作用方向放置；确认每个位置实际获得的词条"
    },
    {
      "round": 7,
      "tier": 3,
      "action": "【推导】对子碰霍尔海雅、黑键或华法琳，核心到位准备四本；缺生存优先补坚守聚合"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "四本抓华法琳，用对子奖励碰五阶阿米娅、Mon3tr加速叠层"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】补精锐核心与治疗，五阶阿米娅、Mon3tr通过奖励碰出；不要在四本直接硬搜"
    },
    {
      "round": 10,
      "tier": 5,
      "action": "【推导】战力允许再上五本找五阶支援，给六本留搜牌资金；钱紧继续四本补装备"
    },
    {
      "round": 11,
      "tier": 6,
      "action": "【推导】经济和场面允许再升六找逻各斯；也可五本奖励碰六阶，未到保持现有主C"
    },
    {
      "round": 12,
      "tier": 6,
      "action": "【推导】六阶终端来了再接装备和小盟约，没来保持旧主C，不能先卖掉输出等逻各斯"
    },
    {
      "round": 13,
      "tier": 6,
      "action": "【推导】优先补主C有效输出装备与聚合生存，避免把所有资源都花在继续叠层"
    },
    {
      "round": 14,
      "tier": 6,
      "action": "【推导】检查控制、进场暴毙与射程，按Boss伤害缺口调整装备；不以层数认定伤害足够"
    },
    {
      "round": 15,
      "tier": 6,
      "action": "【推导】停止追无用对子，把最后资金用于马上生效的装备、治疗和站位修正"
    }
  ]
},
  {
  "id": "sargon-pozy-pepe-swift",
  "title": "萨尔贡迅捷 · 佩佩鸿雪",
  "subtitle": "四本过渡、五本养核心；六萨与转职看条件",
  "difficulty": "进阶公式",
  "strategist": "任意策略家",
  "strategistTip": "本卡走迅捷萨。先用已有战力过渡，四本异客衔接；三萨精奥请选独立方案。",
  "covenants": [
    "3/6萨尔贡",
    "迅捷(核心)",
    "精准",
    "灵巧"
  ],
  "imageUrl": "/assets/aistudio/8f27be849c1e862bb779e60b567e847d_f791bfa6.png",
  "secondaryImageUrl": "/assets/community/sargon-nov13-part2.png",
  "coreHighlight": "佩佩、鸿雪取得后补三萨与迅捷，五本追核心精锐。迅捷转职到手再给霍尔海雅或佩佩，六萨不挤掉必要治疗与对空。",
  "equipmentTips": [
    "迅捷转职实际取得后可给霍尔海雅，配华法琳；没有转职就按原生迅捷与当前战力过渡。",
    "四阶异客进入休整期提供浓茶或盟约之币，偶有拟态物质；至简是固定一费的萨尔贡过渡牌。",
    "补充运营（FireShot 010/014）：四本可用对子碰五阶佩佩、鸿雪，取得核心再决定三萨混搭或六萨；六萨与高迅捷层数仍可能缺Boss输出。",
    "11月13日新补图的五本分支：四本短停找异客、霍尔海雅并碰对子，战力与经济成熟再升五，停3~4回合找佩佩、鸿雪，用五本奖励碰六阶支援；没有固定升五回合。真言有新来源支持，作为取得后的六阶输出候选，不必强追或先于已有支援。",
    "新分支有条件给佩佩转迅捷，叠层足够后按实际词条换灵巧组件；不强制六萨，也不把原三萨三精三奥与作者精迅配置拼成同一套必选名单。缺核心可转已有莱塔尼亚或乌萨斯来牌。",
    "NGA 068 精迅分支：四本前可用三坚守和精迅过渡，后期用莎草、卡涅利安、异客、佩佩、鸿雪打底，再补精准、迅捷与生存各一位。精准转职先考虑佩佩，缺迅捷改看灵巧，不硬凑精奥或六萨。",
    "莎草R2~R15为作者单局留场经验；“90%出怪”“两回合叠满迅捷”和打字机bug均未提供复现依据，不作为通关率、固定层数或机制说明。两段长图与评论可在资料库查看。",
    "三萨三精准三奥术另见“三萨精奥 · 异客佩佩鸿雪”，不沿用本卡迅捷转职步骤。"
  ],
  "phases": [
    {
      "phaseName": "前中期：叠精灵迅过渡找鸿雪",
      "rounds": "1~5回合",
      "shopTier": "1~3本",
      "covenantTarget": "2精准 / 2灵巧 / 2迅捷 -> 拿到鸿雪开3萨尔贡",
      "fieldOperators": [
        {
          "name": "艾丝黛尔",
          "tier": "I",
          "role": "每次开技能萨尔贡+1/2"
        },
        {
          "name": "泡泡",
          "tier": "II",
          "role": "开启技能使萨尔贡/坚守层数+2/4"
        },
        {
          "name": "莎草",
          "tier": "II",
          "role": "萨尔贡、聚合；开技能给身前干员回技力"
        },
        {
          "name": "至简",
          "tier": "III",
          "role": "一费萨尔贡过渡牌"
        }
      ],
      "benchOperators": [
        {
          "name": "艾丝黛尔",
          "tier": "I",
          "note": "对子候选，部署后才计入本家人数"
        }
      ],
      "keyActions": [
        "前期先用精准/灵巧/迅捷打工，4本碰5阶搜出鸿雪后开启3萨尔贡"
      ]
    },
    {
      "phaseName": "四本衔接与五本迅捷萨",
      "rounds": "6~15回合",
      "shopTier": "4~5本",
      "covenantTarget": "3萨 + 迅捷；人数和生存允许再6萨",
      "fieldOperators": [
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "取得迅捷转职后接叠层"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "身前开技能+2层拐"
        },
        {
          "name": "异客",
          "tier": "IV",
          "role": "休整发币或茶，补法伤"
        },
        {
          "name": "佩佩",
          "tier": "V",
          "role": "周围八格眩晕或沉睡触发叠层"
        },
        {
          "name": "鸿雪",
          "tier": "V",
          "role": "开技能叠萨尔贡和精准"
        },
        {
          "name": "真言",
          "tier": "VI",
          "role": "五本奖励或六本取得后的可选输出"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "四本异客稳场，奖励或五本找佩佩鸿雪；高阶没到先保成熟输出。",
        "迅捷转职到手后再给霍尔海雅或佩佩，六萨按实际人数补。"
      ]
    },
    {
      "phaseName": "三萨精迅 · 佩佩转精准",
      "rounds": "佩佩、鸿雪和精准转职到手后手动选择",
      "shopTier": "四本碰五阶；没碰到再酌情五本",
      "covenantTarget": "3萨尔贡、3精准、2迅捷",
      "fieldOperators": [
        { "name": "莎草", "tier": "II", "role": "身前回技力" },
        { "name": "卡涅利安", "tier": "III", "role": "迅捷、供迅捷作战粮" },
        { "name": "异客", "tier": "IV", "role": "产装备、补法伤" },
        { "name": "佩佩", "tier": "V", "role": "有球再转精准" },
        { "name": "鸿雪", "tier": "V", "role": "叠萨尔贡与精准、远程输出" },
        { "name": "空弦", "tier": "III", "role": "第三精准示例" },
        { "name": "青枳", "tier": "III", "role": "第二迅捷示例、兼顾阻挡" }
      ],
      "benchOperators": [],
      "keyActions": [
        "第八格留给实际需要的治疗或前排。找不到适用的转职，就保留能守住的阵容。",
        "佩佩可按四合院相对方向给目标叠层。不是三萨精迅的成型前提。"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】拿低费战力与对子，先用可用小盟约过渡，不硬抓整套萨尔贡"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "【推导】补泡泡、莎草等本家战力或精准灵巧；保留升三本与购买新牌的钱"
    },
    {
      "round": 3,
      "tier": 3,
      "action": "升3本用精灵迅打工，抓泡泡、莎草、至简"
    },
    {
      "round": 4,
      "tier": 3,
      "action": "【推导】三本找至简与对子，尝试碰四阶异客、霍尔海雅或华法琳，缺核心先补战力"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "【推导】找到四阶核心且有余钱可提前四本；没来先维持小盟约，不强凑六萨"
    },
    {
      "round": 6,
      "tier": 4,
      "action": "四本补霍尔海雅、华法琳与异客；迅捷转职到手后再安排叠层"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "【推导】用四本对子碰五阶鸿雪、佩佩，核心来后开三萨；迅捷转职没来不照抄转职配置"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】根据输出和来牌决定三萨混搭或六萨，空位补生存和对空，不拆已成型小盟约"
    },
    {
      "round": 9,
      "tier": 5,
      "action": "【推导】战力与经济成熟再升五找佩佩、鸿雪；新补图建议五本停3~4回合，但未指定从R9开始，缺战力可延后"
    },
    {
      "round": 10,
      "tier": 5,
      "action": "【推导】鸿雪、佩佩与合适支援优先精锐，萨尔贡道具按当前主C需求分配"
    },
    {
      "round": 11,
      "tier": 5,
      "action": "【推导】观察伤害是否跟得上怪量；缺输出先补装备与核心，别继续只堆迅捷层数"
    },
    {
      "round": 12,
      "tier": 5,
      "action": "【推导】五本继续追核心精锐，奖励可碰六阶；真言为有来牌的终端候选，三萨成型不为凑六萨丢关键治疗"
    },
    {
      "round": 13,
      "tier": 5,
      "action": "【推导】准备决战主C与聚合覆盖，剩余位置按实际伤害/生存缺口收束"
    },
    {
      "round": 14,
      "tier": 5,
      "action": "【推导】核对远程输出覆盖和技能启动，六萨并不保证Boss伤害合格"
    },
    {
      "round": 15,
      "tier": 5,
      "action": "【推导】最终装备全部服务当前输出，没来牌就维持成熟分支，不临时换未经成型的终端"
    }
  ]
},
  {
  "id": "eunectes-precision-arcane-big-ugly",
  "title": "精灵奥森蚺 · 条件转职大丑",
  "subtitle": "二本养大丑，核心稳定再升本找叠层与转职",
  "difficulty": "进阶公式",
  "strategist": "森蚺 (暴躁铁皮/大丑)",
  "strategistTip": "R2二本养大丑；R8四本、R10五本为旧图参考。精锐和装备未齐先补战力，不盲升赌球。",
  "covenants": [
    "3精准",
    "2灵巧",
    "2奥术",
    "2(3)聚合",
    "2奇迹",
    "2远见",
    "3/4莱塔尼亚"
  ],
  "imageUrl": "/assets/aistudio/image_babfd902.png",
  "secondaryImageUrl": "/assets/aistudio/image_7fa89991.png",
  "coreHighlight": "用远见经济与精奥支援养铁皮，缪尔赛思和转职实际到位再换配置。逐只检查灵巧覆盖；双六镜长停二本另选云迹奇迹线。",
  "equipmentTips": [
    "二本核心：【简易通讯器】在2本时拖给大丑直接复制升精锐（不要硬找，但必须在升3本前用防歪初雪）；二本大概率拿到【阿米娅玩偶】滚经济",
    "与042/044/045/048的新二本镜子线分开：本卡保留旧空弦渡桥远见、升五转职出口；新线集中刷云迹并长期停二本，不把两套刷新预算、升本回合与终盘装备合成一张必做清单。",
    "五本神装：【缪尔赛思（变形同构体）】+ 承曦格雷伊送的【精准狙击镜】给大丑转精准；五本见到【投机骰子】即可买（森蚺策略开局已触发，换陈的弱点指令巨赚）",
    "六本终极续航：【吸血镰刀】让不屈者大丑每次伤害转化为生命；多余狙击镜给【逻各斯】，Boss战建议开至少2~3聚合保生存",
    "补充前提（FireShot 012）：精准灵巧分支更依赖精锐大丑、转职与输出装备；前排续航不足先补生存。原回合表仅作参考，不能把求助帖当成成功复现记录。",
    "道中能兜怪不等于Boss伤害合格：检查主C输出词条、技能回转与站位，再考虑继续追层数；不要将单局层数或兜怪数量当通关阈值。",
    "052补充：前期铁皮用于保血，同时寻找实际叠层来源；二本电话线先确认奇迹、灵巧已开。精锐与装备未成型时别按旧表硬升；精灵奥转职和低本六镜是不同预算方向，作者及评论对隐藏Boss的适用性存在争议。",
    "052评论纠正多邻接误区：同一只铁皮只计算一次有效灵巧覆盖，不因身边有多名灵巧干员重复加成；每只铁皮都应各自确认覆盖、攻击线与装备距离。未按评论倍数修改任何伤害计算。",
    "《终极隐藏构筑讨论》二本搜电话分支：主要买云迹及凑灵巧、奇迹的牌，少拿无关对子；作者称约35次刷新是精锐铁皮的期望，不是3~5刷，也不是保底。仍需确认电话候选池和血线，不用该数字硬刷。",
    "该作者推荐六本动能轰击弩，重视攻速和独立增伤，称铁皮可携两件；装备稀缺，不能作为每局必出。原帖另外两件装备名被截断，原图保留在资料库，不据此臆造神装清单。"
  ],
  "phases": [
    {
      "phaseName": "前期阵容组成（3~7回合卡二本）",
      "rounds": "1~7回合",
      "shopTier": "2回合升2本 → 3~7回合停2本",
      "covenantTarget": "2奇迹 / 2远见 / 2灵巧 / 2精准",
      "fieldOperators": [
        {
          "name": "暴躁铁皮",
          "tier": "V",
          "role": "道中战神",
          "note": "2本拿简易通讯器可复制升精锐"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "role": "远见核心",
          "note": "与空弦面对面放置互叠远见层数"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "role": "精准+灵巧",
          "note": "获得时白送2件精准狙击镜"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "灵巧+奇迹",
          "note": "可上场两个及以上狂刷层数"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "远见+精准",
          "note": "二本靠对子三合一3选1奖励提前碰出"
        }
      ],
      "benchOperators": [
        {
          "name": "矩",
          "tier": "II",
          "note": "整备区优先开2奇迹再刷新卡池，有一个就行"
        }
      ],
      "keyActions": [
        "第2回合升2本，3~7回合停二本对对子，利用3选1奖励找出【空弦】，将【渡桥】与【空弦】面对面摆放互叠远见",
        "第3回合赏金怪求稳只选2费（不碰3费枯朽战车防炸缸）"
      ]
    },
    {
      "phaseName": "中期阵容组成（8回合跳3/4本找雅雅）",
      "rounds": "8~9回合",
      "shopTier": "8回合连升3本、4本",
      "covenantTarget": "2远见 / 2灵巧 / 3精准 / 2奥术 / 2奇迹",
      "fieldOperators": [
        {
          "name": "暴躁铁皮",
          "tier": "V",
          "role": "前排核心"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "role": "远见叠层"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "role": "精准灵巧胚子"
        },
        {
          "name": "云迹",
          "tier": "II",
          "role": "奇迹灵巧"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "身前+6层"
        },
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "第一优先级叠层手",
          "note": "8回合找霍尔海雅>黑键，找到雅雅后就上五本"
        },
        {
          "name": "纯烬艾雅法拉",
          "tier": "V",
          "role": "聚合医疗过渡"
        }
      ],
      "benchOperators": [
        {
          "name": "矩",
          "tier": "II",
          "note": "常驻整备区维持2奇迹免费刷新"
        }
      ],
      "keyActions": [
        "8回合升三本四本，第一优先级找【霍尔海雅】（优先级高于黑键）叠精准与奥术，找到雅雅后立即准备上五本"
      ]
    },
    {
      "phaseName": "后期五本转职大丑 & 最终Boss战阵容",
      "rounds": "10~15回合",
      "shopTier": "10回合上5本（富裕可上6本）",
      "covenantTarget": "3精准 / 2灵巧 / 2奥术 / 2~3聚合 / 莱塔尼亚",
      "fieldOperators": [
        {
          "name": "暴躁铁皮",
          "tier": "V",
          "role": "精准/莱塔转职主C",
          "note": "带变形同构体+精准狙击镜+吸血镰刀"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "role": "吃帕拉斯身前叠层"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "高频精准副C"
        },
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "精准奥术叠层核心"
        },
        {
          "name": "纯烬艾雅法拉",
          "tier": "V",
          "role": "聚合生存保障"
        },
        {
          "name": "塞雷娅",
          "tier": "V",
          "role": "凑2/3聚合+复制叠层"
        },
        {
          "name": "艾雅法拉",
          "tier": "IV",
          "role": "奥术爆发副C"
        }
      ],
      "benchOperators": [
        {
          "name": "华法琳",
          "tier": "IV",
          "note": "辅助叠层卡"
        },
        {
          "name": "阿米娅",
          "tier": "V",
          "note": "身前叠层+2"
        },
        {
          "name": "Mon3tr",
          "tier": "V",
          "note": "周围八格上限+60%"
        }
      ],
      "keyActions": [
        "上五留对子碰缪尔赛思；拿到同构体才转精准。第八格二选一：缺叠层上帕拉斯朝向承曦格雷伊，缺输出上逻各斯拿多余狙击镜。未取得六阶就留原战力。",
        "关底保两聚合，有额外转职再开三聚合。两名六阶都上场时必须替换原有位置；别为追转职拆掉治疗。"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】用策略大丑配便宜战力与对子，规划前排位置，不先追完整精灵奥"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "升2本！整备区先开2奇迹，场上抓云迹、渡桥、承曦格雷伊"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】赏金选当前能稳打的目标；简易通讯器出现再考虑复制大丑，不为找它耗光资金"
    },
    {
      "round": 4,
      "tier": 2,
      "action": "停2本对对子！3选1碰出空弦，渡桥与空弦面对面互叠远见"
    },
    {
      "round": 5,
      "tier": 2,
      "action": "【推导】补云迹、承曦格雷伊等精锐与输出装备，检查大丑是否能守当前怪潮"
    },
    {
      "round": 6,
      "tier": 2,
      "action": "【推导】漏怪时提前补生存或升本；能稳才继续空渡叠远见，不能把低本停留当硬规则"
    },
    {
      "round": 7,
      "tier": 2,
      "action": "【推导】整理对子和升本资金；协防复制还未完成就按现有战力规划，别空等关键装备"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "连升3本4本！搜霍尔海雅(>黑键)叠精准，找到雅雅准备上5"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】优先霍尔海雅和治疗，精锐、转职与输出装备分开检查；已有战力再准备五本"
    },
    {
      "round": 10,
      "tier": 5,
      "action": "留对子上5本碰缪尔赛思拿转职球给大丑，见到投机骰子必买"
    },
    {
      "round": 11,
      "tier": 5,
      "action": "【推导】转职给实际受益的输出核心；缺球则按现有词条收束，不为完整模板卖空阵容"
    },
    {
      "round": 12,
      "tier": 5,
      "action": "【推导】补前排续航与主C装备，有钱且缺六阶装备才上六；道中兜怪与Boss输出分别检查"
    },
    {
      "round": 13,
      "tier": 6,
      "action": "保住塞雷娅和奶羊的聚合覆盖。六阶到手再选：缺叠层用帕拉斯，缺伤害用逻各斯。"
    },
    {
      "round": 14,
      "tier": 6,
      "action": "【推导】已上六本补终端，未上则五本收束；主C暴毙先修聚合覆盖，刮痧先修输出词条"
    },
    {
      "round": 15,
      "tier": 6,
      "action": "【推导】最后检查站位避免友伤误杀关键支援，把额外资源用于决战伤害和存活"
    }
  ]
},
  {
  "id": "leithanien-shapeshifter-standard",
  "title": "标准升本莱 · 精奥聚合",
  "subtitle": "四本对子碰奶羊与薇薇安娜，转职按实际取得分配",
  "difficulty": "进阶公式",
  "strategist": "变形者集群 / 杰西卡 / 昆图斯",
  "strategistTip": "先确认霍尔海雅可用；R3二本、R4~5三本作参考。四本找核心，缺生存先补，升五保留买牌钱。",
  "covenants": [
    "6莱塔尼亚",
    "3精准",
    "3奥术",
    "2远见",
    "2(3)聚合"
  ],
  "imageUrl": "/assets/aistudio/image_7fa89991.png",
  "secondaryImageUrl": "/assets/aistudio/86a0177a75f0c1701ba6cde6a68e36ff_720_96c896a8.png",
  "coreHighlight": "空弦渡桥互叠远见，霍尔海雅与黑键接精奥。四本对子碰薇薇安娜、纯烬艾雅法拉；转职足够再扩六莱，聚合生存优先。",
  "equipmentTips": [
    "小鼓与同构体实际取得后先给空弦过渡；空弦精锐且霍尔海雅到位后再转交。第二套转职到手才给空弦，不以R10保证发放。",
    "062 转莱分支：四本碰到五阶纯烬艾雅法拉可补治疗，中期伤害交给四阶艾雅法拉。缺灵巧时，人数允许才用六莱补攻速。",
    "NGA 073：术羊打伤害，奶羊保生存。火山打完仍漏怪就查空弦朝向、黑键或霍尔海雅的覆盖；小鼓优先给承担连续输出的人。三聚合或六莱不能代替实际伤害。",
    "道中强力外援：道中看到4阶【温蒂（带3技能）】首选抓取过渡，5阶可选【Mon3tr】与【阿米娅】辅助莱塔尼亚干员叠层",
    "后期若有多余转职球可给【逻各斯】吃莱塔尼亚效果；若没聚合转职道具则优先开3聚合保生存（可不上逻各斯）",
    "Boss排错（FireShot 009）：有层数仍打不动时，先检查法术输出位艾雅法拉是否精锐、是否被眩晕或进场暴毙、输出词条是否齐全；额外狙击镜、骨刺刀按缺口补，不只盯莱塔层数。",
    "《终极隐藏构筑讨论》的精灵奥莱分支：道中或关底生存不足可补夜莺凑三聚合；无转职的精锐逻各斯也是输出备选，是否上场仍看人口和生存，不能把作者与小羊的强度比较当固定结论。"
  ],
  "phases": [
    {
      "phaseName": "前期理想阵容（空弦渡桥互叠远见）",
      "rounds": "1~5回合",
      "shopTier": "3回合升2本 → 4/5回合升3本",
      "covenantTarget": "3莱塔尼亚 / 2远见 / 2奥术 / 2精准",
      "fieldOperators": [
        {
          "name": "地灵",
          "tier": "I",
          "role": "莱塔尼亚+远见起手"
        },
        {
          "name": "复奏",
          "tier": "II",
          "role": "莱塔尼亚+奥术叠层"
        },
        {
          "name": "车尔尼",
          "tier": "III",
          "role": "送2件莱塔尼亚小鼓"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "role": "与空弦互叠远见"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "前期带小鼓+转职球打工"
        },
        {
          "name": "至简",
          "tier": "III",
          "role": "莱塔尼亚+迅捷"
        },
        {
          "name": "承曦格雷伊",
          "tier": "II",
          "role": "送精准狙击镜"
        },
        {
          "name": "卡达",
          "tier": "I",
          "role": "低阶奥术/奇迹"
        }
      ],
      "benchOperators": [
        {
          "name": "伺夜",
          "tier": "III",
          "note": "本家前期核心，中后期放到整备区千万不卖（每回合首次刷新白嫖层数）"
        }
      ],
      "keyActions": [
        "3回合升2本、4/5回合升3本；空弦与渡桥前期优先互叠远见，一直持续到黑键/霍尔海雅登场"
      ]
    },
    {
      "phaseName": "中期理想阵容（四本对对碰找五阶双姝）",
      "rounds": "6~9回合",
      "shopTier": "参考R7~8四本，经济不足顺延",
      "covenantTarget": "4~5莱塔尼亚 / 2远见 / 3精准 / 2奥术",
      "fieldOperators": [
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "接手小鼓+转职球核心叠层"
        },
        {
          "name": "黑键",
          "tier": "IV",
          "role": "对子碰出可直接上4本"
        },
        {
          "name": "空弦",
          "tier": "III",
          "role": "精准远见主力"
        },
        {
          "name": "薇薇安娜",
          "tier": "V",
          "role": "4本对对子碰出（莱塔+聚合叠层）"
        },
        {
          "name": "纯烬艾雅法拉",
          "tier": "V",
          "role": "4本对对子碰出（聚合生存核心）"
        },
        {
          "name": "车尔尼",
          "tier": "III",
          "role": "凑齐高莱塔尼亚"
        }
      ],
      "benchOperators": [
        {
          "name": "伺夜",
          "tier": "III",
          "note": "整备区每回合首次刷新叠层"
        },
        {
          "name": "渡桥",
          "tier": "II",
          "note": "整备区保留远见激活"
        }
      ],
      "keyActions": [
        "四本对子碰薇薇安娜与纯烬艾雅法拉；缺战力可用温蒂3技能过渡，升五看资金与收益。"
      ]
    },
    {
      "phaseName": "后期大成阵容（6莱塔+3精+3奥+聚合）",
      "rounds": "10~15回合",
      "shopTier": "双五阶找到后升5本（一般不升6）",
      "covenantTarget": "6莱塔尼亚 / 2远见 / 3精准 / 3奥术 / 2(3)聚合",
      "fieldOperators": [
        {
          "name": "空弦",
          "tier": "III",
          "role": "第二套转职实际取得后接手"
        },
        {
          "name": "黑键",
          "tier": "IV",
          "role": "莱塔尼亚+奥术+精准法核"
        },
        {
          "name": "霍尔海雅",
          "tier": "IV",
          "role": "带转职+小鼓全场风场叠层"
        },
        {
          "name": "薇薇安娜",
          "tier": "V",
          "role": "莱塔尼亚+聚合副T"
        },
        {
          "name": "纯烬艾雅法拉",
          "tier": "V",
          "role": "聚合治疗核心"
        },
        {
          "name": "塞雷娅",
          "tier": "V",
          "role": "带转职聚合重装主T"
        },
        {
          "name": "艾雅法拉",
          "tier": "IV",
          "role": "莱塔尼亚+奥术爆发"
        },
        {
          "name": "逻各斯",
          "tier": "VI",
          "role": "多余转职可给逻各斯吃莱塔效果"
        }
      ],
      "benchOperators": [
        {
          "name": "伺夜",
          "tier": "III",
          "note": "整备区刷新叠层"
        },
        {
          "name": "阿米娅",
          "tier": "V",
          "note": "五阶辅助叠层"
        },
        {
          "name": "Mon3tr",
          "tier": "V",
          "note": "五阶八格上限+60%"
        }
      ],
      "keyActions": [
        "薇薇安娜与奶羊到位后按需求上5本补塞雷娅等支援；六阶逻各斯需奖励碰出或再升本；若没聚合转职道具则优先开3聚合保生存（可下了逻各斯）"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】拿地灵等便宜战力与对子，规划精准奥术过渡，先保本路"
    },
    {
      "round": 2,
      "tier": 1,
      "action": "【推导】补前排与现成对子，留升二本资金；不要提前在低档商店硬找三阶车尔尼"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "3回合升2本，抓复奏、渡桥等过渡；车尔尼需三阶奖励或上三本取得"
    },
    {
      "round": 4,
      "tier": 2,
      "action": "【推导】有对子与余钱可升三本；空弦和车尔尼需三阶档位或奖励取得"
    },
    {
      "round": 5,
      "tier": 3,
      "action": "资金足升三，空弦渡桥互叠远见；小鼓与转职实际到手再装备"
    },
    {
      "round": 6,
      "tier": 3,
      "action": "【推导】对子碰霍尔海雅/黑键；命中核心且补场资金够可提前四本，缺战力先补生存"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "场面与资金允许升四，找霍尔海雅黑键；有转职再交接，留对子碰五阶"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】四本追核心精锐，用对子碰五阶薇薇安娜/纯烬艾雅法拉；温蒂可作道中过渡"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "【推导】检查法术主C技能能否启动和存活，狙击镜、骨刺刀按缺口配；聚合不足先补"
    },
    {
      "round": 10,
      "tier": 5,
      "action": "双五阶与场面稳定后按需升五；第二套转职到手再给空弦，塞雷娅补生存"
    },
    {
      "round": 11,
      "tier": 5,
      "action": "【推导】双五阶没齐可继续四本，已升五本补支援与装备；逻各斯需六阶奖励或六本取得"
    },
    {
      "round": 12,
      "tier": 5,
      "action": "【推导】不要只凑莱塔人数，先让主C吃到精准奥术收益；缺聚合可牺牲一个上限输出位"
    },
    {
      "round": 13,
      "tier": 5,
      "action": "【推导】决定决战阵容，检查艾雅法拉精锐与抗控制能力，余钱用于有效装备"
    },
    {
      "round": 14,
      "tier": 5,
      "action": "【推导】按Boss站位检查射程与治疗覆盖，眩晕、暴毙、输出不足分别处理"
    },
    {
      "round": 15,
      "tier": 5,
      "action": "【推导】保住已经成型的精奥聚合底座，停止硬追六阶终端，把装备交给实际主C"
    }
  ]
},
  {
  "id": "harmony-yan-victoria-chen",
  "title": "调和炎维 · 重锤转职",
  "subtitle": "四本灵巧坚守底座，调和与高阶转职有条件再接",
  "difficulty": "高难上限",
  "strategist": "Pith / 调和体系",
  "strategistTip": "先保场面再升四；调和到位后核对炎维人数，不把未来六阶收益算进开局。",
  "covenants": [
    "1调和",
    "3炎",
    "3维多利亚",
    "2/3坚守",
    "2/3灵巧",
    "2聚合"
  ],
  "imageUrl": "/assets/aistudio/image_7fa89991.png",
  "secondaryImageUrl": "/assets/aistudio/05e26e934e562dc78febb551ab9c3366_31155c5f.png",
  "coreHighlight": "仇白配华法琳叠灵巧，余与涤火杰西卡保坚守，风絮补聚合。高阶主C、变形同构体和维式重锤齐后再接转职终端。",
  "equipmentTips": [
    "注意（056求助帖的回帖建议）：四本维系核心未到，先保炎、灵巧与坚守战力；人数与装备齐后再开三维，不为标签提前卖掉有效输出。",
    "关键转职收尾：买【维式重锤/特殊维式重锤】搭配【缪尔赛思（变形同构体）】给主C转职，同时吃满炎+维多利亚+坚守+灵巧全部加成",
    "先开3维多利亚，再按需要分装备。涤火杰西卡按携带装备的在场人数叠层，水灯心负责弱点伤害。"
  ],
  "phases": [
    {
      "phaseName": "稳场升本",
      "rounds": "1~4回合",
      "shopTier": "逐步升三，场面稳再四本",
      "covenantTarget": "2坚守 / 2聚合 / 调和过渡",
      "fieldOperators": [
        {
          "name": "风絮",
          "tier": "III",
          "role": "开启聚合羁绊过渡"
        },
        {
          "name": "水灯心",
          "tier": "III",
          "role": "维多利亚灵巧输出",
          "note": "按敌人双抗切换伤害类型"
        },
        {
          "name": "罗比菈塔",
          "tier": "III",
          "role": "前期坚守稳血"
        },
        {
          "name": "泡泡",
          "tier": "II",
          "role": "前期坚守稳血"
        }
      ],
      "benchOperators": [
        {
          "name": "夏栎",
          "tier": "I",
          "note": "后台挂机自动叠最高层盟约"
        },
        {
          "name": "星源",
          "tier": "II",
          "note": "后台挂机自动叠最高层盟约"
        }
      ],
      "keyActions": [
        "低阶战力守路，升本后留买牌资金；不为R4速四卖空阵容。"
      ]
    },
    {
      "phaseName": "四本灵巧坚守底座",
      "rounds": "5~15回合",
      "shopTier": "四本成型；稳血后可升五，高阶与重锤到手再换阵",
      "covenantTarget": "3维多利亚 / 3坚守 / 2灵巧 / 2聚合 / 调和",
      "fieldOperators": [
        {
          "name": "余",
          "tier": "IV",
          "role": "炎与坚守前排",
          "note": "周围8格敌人元素爆发时叠自身已激活盟约"
        },
        {
          "name": "涤火杰西卡",
          "tier": "IV",
          "role": "维多利亚+坚守核心C",
          "note": "休整期结束按场上带装备人数叠层"
        },
        {
          "name": "华法琳",
          "tier": "IV",
          "role": "灵巧+赋予身前开技能+2层"
        },
        {
          "name": "仇白",
          "tier": "IV",
          "role": "炎+灵巧地面主C",
          "note": "吃华法琳拐高频开技能叠层"
        },
        {
          "name": "水灯心",
          "tier": "III",
          "role": "维多利亚灵巧输出"
        },
        {
          "name": "风絮",
          "tier": "III",
          "role": "炎聚合"
        }
      ],
      "benchOperators": [],
      "keyActions": [
        "余与涤火保坚守，仇白配华法琳，风絮补聚合；核对实际人数。",
        "水灯心到位再按预算分配装备；维娜需五阶奖励或升五取得。"
      ]
    },
    {
      "phaseName": "条件重锤转职终端",
      "rounds": "高阶与转职到位后手动选择",
      "shopTier": "5~6本",
      "covenantTarget": "1调和 + 炎 + 维多利亚 + 高灵巧 + 高坚守 + 聚合",
      "fieldOperators": [
        {
          "name": "塔露拉",
          "tier": "VI",
          "role": "维式重锤转职终极主C",
          "note": "配维式重锤+变形同构体吃满炎维双阵营"
        },
        {
          "name": "烛煌",
          "tier": "VI",
          "role": "炎+维多利亚双系六阶终端"
        },
        {
          "name": "魔王",
          "tier": "VI",
          "role": "调和核心+休整期核心盟约+20层",
          "note": "使场上核心盟约激活人数+1"
        },
        {
          "name": "余",
          "tier": "IV",
          "role": "前排与拉怪"
        },
        {
          "name": "涤火杰西卡",
          "tier": "IV",
          "role": "副T兼弱点输出"
        },
        {
          "name": "仇白",
          "tier": "IV",
          "role": "炎+灵巧高频副C"
        },
        {
          "name": "黍",
          "tier": "V",
          "role": "炎系护佑盾"
        }
      ],
      "benchOperators": [
        {
          "name": "缪尔赛思",
          "tier": "VI",
          "note": "提供变形同构体配合维式重锤完成转职"
        }
      ],
      "keyActions": [
        "高阶主C与重锤、同构体实际齐后才转职，保留必要治疗与前排。"
      ]
    }
  ],
  "roundPace": [
    {
      "round": 1,
      "tier": 1,
      "action": "【推导】拿便宜前排与治疗对子，先确认调和路线所需的关键盟约仍可用"
    },
    {
      "round": 2,
      "tier": 2,
      "action": "二本拿战力与对子，准备三本再找风絮、水灯心、罗比菈塔铺垫生存"
    },
    {
      "round": 3,
      "tier": 2,
      "action": "【推导】保留对子与升三本资金；坚守聚合过渡能守住才追速本"
    },
    {
      "round": 4,
      "tier": 3,
      "action": "【推导】找罗比菈塔、风絮、水灯心，利用对子碰余/涤火杰西卡，缺战力不强冲四本"
    },
    {
      "round": 5,
      "tier": 4,
      "action": "速升4本D牌！抢余+涤火杰西卡（坚守）与华法琳+仇白（灵巧）"
    },
    {
      "round": 6,
      "tier": 4,
      "action": "【推导】优先余和涤火杰西卡稳定场面，再补仇白、华法琳启动灵巧"
    },
    {
      "round": 7,
      "tier": 4,
      "action": "开出3维多利亚后全员挂满武器装备，五系羁绊同时高速叠层"
    },
    {
      "round": 8,
      "tier": 4,
      "action": "【推导】补核心精锐与聚合治疗，先解决对空清杂；羁绊多不代表每个输出都已启动"
    },
    {
      "round": 9,
      "tier": 4,
      "action": "四本补精锐；能守且升本后还有买牌钱，再上五找黍或维娜·维多利亚"
    },
    {
      "round": 10,
      "tier": 4,
      "action": "【推导】没有转职就维持炎维底座；有维多利亚转职再选已到手的输出位"
    },
    {
      "round": 11,
      "tier": 4,
      "action": "【推导】检查是否有足够资金升六后继续搜牌；不足就强化现有主C与装备"
    },
    {
      "round": 12,
      "tier": 4,
      "action": "经济允许上六本找缪尔赛思与魔王；实际拿到维式重锤和转职后再调整，先保生存输出"
    },
    {
      "round": 13,
      "tier": 4,
      "action": "【推导】六阶卡取得后再替换过渡位，别先卖成熟输出等塔露拉/烛煌/魔王"
    },
    {
      "round": 14,
      "tier": 4,
      "action": "【推导】按实际来牌收束，核对调和及炎维人数，关键生存位优先于凑全图标"
    },
    {
      "round": 15,
      "tier": 4,
      "action": "【推导】给现有核心分装备，检查治疗覆盖和对空；没走高本分支就用四本阵决战"
    }
  ]
},
  {
    "id": "jessica-precision-arcane-foresight",
    "title": "杰西卡精奥 · 精准检索",
    "subtitle": "R4/7/10检索补对子，三碰四找核心",
    "difficulty": "新手轮椅",
    "strategist": "杰西卡 (Jessica)",
    "strategistTip": "先留可用精准检索目标；R3二本、R4三本，再按核心与资金上四。指定牌未到先稳场。",
    "covenants": [
      "3精准",
      "3奥术",
      "聚合/协防保命",
      "远见/灵巧按来牌",
      "莱塔尼亚等大盟约可选"
    ],
    "imageUrl": "/assets/community/source-051-preview.jpg",
    "secondaryImageUrl": "/assets/aistudio/f72f386c3d669a3f61f18dae3eb64b33_5b333aaa.png",
    "coreHighlight": "精准检索补对子，霍尔海雅与黑键搭精奥输出，按来牌补聚合和治疗。远见与大盟约按需，四本能守住即可收束。",
    "equipmentTips": [
      "技能参考：051与050均支持霍尔海雅1技能；旧资料保留空弦1、黑键2、艾雅法拉3、纯烬艾雅法拉2、塞雷娅3。按实际场面选择，不能以层数承诺通关。",
      "转职取舍：霍尔海雅转远见或灵巧在评论中有分歧；已有空渡经济链可补远见，已有有效灵巧发动机再补灵巧，不把任一转职当必需。",
      "地面压力：低本蛇屠箱、泡泡先保阻挡；三本罗比菈塔补坚守/助力，青枳补地面。开局预览敌人，遇冲锋、次数怪或隐匿按地图补控制与处理手段，不只堆高台。",
      "Boss生存：优质治疗配聚合/协防或减伤，华法琳主要负责叠层，不能充当主治疗兜底。面对禁疗蜘蛛须处理敌人和站位，仅加奶不能解决；高精准奥术也可能被秒。",
      "旧远见分支：已有空弦与渡桥可互指叠层，后台星源/夏栎辅助；缺渡桥不强搜、不放弃精准检索。旧图中的R2升二、寻呼必出空弦与固定R9上五已由本卡修正。",
      "高阶来源：四本只能通过适用三合一/策略奖励取得五阶支援；维什戴尔、逻各斯等六阶须有适用外援/奖励或六本商店，五本不能直接购买。大盟约与高阶终端均为条件补强。",
      "资料边界：051没有完整R1–R15表，明确节点注明来源，其余为推导。作者层数、战绩与复奏强弱比较是个人样本；全部可见原帖收录资料库050/051。"
    ],
    "phases": [
      {
        "phaseName": "低本稳场与首次精准检索",
        "rounds": "1~4回合",
        "shopTier": "R1/R2一本 → R3二本 → R4三本（保留购牌资金）",
        "covenantTarget": "可用精准成员 + 当轮阻挡；远见不强求",
        "fieldOperators": [
          {
            "name": "灰喉",
            "tier": "I",
            "role": "精准目标与过渡"
          },
          {
            "name": "雪猎",
            "tier": "II",
            "role": "精准池候选"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "精准/灵巧候选"
          },
          {
            "name": "空弦",
            "tier": "III",
            "role": "三本叠层候选",
            "note": "不保证首次策略命中"
          },
          {
            "name": "泡泡",
            "tier": "II",
            "role": "地面阻挡"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "三本助力/坚守候选"
          }
        ],
        "benchOperators": [
          {
            "name": "夏栎",
            "tier": "I",
            "note": "后台叠层，有余钱再补"
          },
          {
            "name": "云迹",
            "tier": "II",
            "note": "有对子可留；需上场才有免费刷新"
          }
        ],
        "keyActions": [
          "来源051：R1买两人；R2用刷新/币/玩偶等资源双买，不默认升二。R3留对子升二，R4按资金升三使用第一次策略。",
          "选牌参考：精准本盟约 > 对子 > 副盟约 > 前期优质战力 > 通用叠层手；承压时优先守住本路。始终没有精准目标，先用可用自选补叠层或战力，再评估换线。"
        ]
      },
      {
        "phaseName": "三本碰四与地面承压检查",
        "rounds": "5~8回合",
        "shopTier": "三本留对子碰四；核心齐且有资金可在R7以后上四",
        "covenantTarget": "精准/奥术叠层 + 地面阻挡与有效治疗",
        "fieldOperators": [
          {
            "name": "空弦",
            "tier": "III",
            "role": "叠层主力"
          },
          {
            "name": "霍尔海雅",
            "tier": "IV",
            "role": "1技能精奥核心",
            "note": "三本需通过适用奖励取得"
          },
          {
            "name": "黑键",
            "tier": "IV",
            "role": "精奥与莱塔候选",
            "note": "三本不能直购四阶"
          },
          {
            "name": "华法琳",
            "tier": "IV",
            "role": "叠层与盟约辅助",
            "note": "不能代替主治疗；三本需奖励"
          },
          {
            "name": "青枳",
            "tier": "III",
            "role": "地面过渡"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "保护高台与坚守"
          }
        ],
        "benchOperators": [
          {
            "name": "星源",
            "tier": "II",
            "note": "后台加最高已激活盟约；不挤占前排资金"
          }
        ],
        "keyActions": [
          "来源051：三本留对子碰四阶；R7第二次策略按对子与四阶核心进度选择留三或升四，不保证拿到指定人。",
          "【推导】R6–8先预防剑怪、冲锋和高台受压；有三精准也不能撤掉必要阻挡。缺核心继续三碰四，能买战力才升本。",
          "空渡齐可面对面叠远见；三莱顺来就开，不为缺黑键或五阶奶羊强等大盟约。"
        ]
      },
      {
        "phaseName": "四本收束与关底换人",
        "rounds": "9~15回合",
        "shopTier": "默认四本；缺核心可继续三本，五本以上另按条件",
        "covenantTarget": "保留有效精准/奥术 + 聚合/协防与优质治疗",
        "fieldOperators": [
          {
            "name": "霍尔海雅",
            "tier": "IV",
            "role": "精奥与控制"
          },
          {
            "name": "艾雅法拉",
            "tier": "IV",
            "role": "四本可用输出终端"
          },
          {
            "name": "黑键",
            "tier": "IV",
            "role": "奥术输出候选"
          },
          {
            "name": "空弦",
            "tier": "III",
            "role": "保留必要叠层/人数"
          },
          {
            "name": "夜莺",
            "tier": "IV",
            "role": "治疗与盟约支援"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "坚守/助力过渡"
          }
        ],
        "benchOperators": [],
        "keyActions": [
          "来源051：R10第三次策略按实际缺口补核心/对子；四本对子可碰五阶支援，不强制R9升五。",
          "【推导】有聚合组件则补覆盖，不足可考虑协防与减伤；是否有治疗、能否挡住敌人比展示层数更重要。",
          "来源051：关底逐步换掉复数纯叠层卡，保留三精准/三奥术等有效人数；四阶艾雅法拉也可作终端，不必等六阶。"
        ]
      },
      {
        "phaseName": "条件分支：远见经济与高阶支援",
        "rounds": "条件：来牌与资金允许时手动选择",
        "shopTier": "远见可低本启动；五阶须奖励或五本，六阶须奖励/外援或六本",
        "covenantTarget": "沿现有精奥补远见或大盟约，不拆生存链",
        "fieldOperators": [
          {
            "name": "渡桥",
            "tier": "II",
            "role": "已有时与空弦互指"
          },
          {
            "name": "空弦",
            "tier": "III",
            "role": "远见/精准叠层"
          },
          {
            "name": "薇薇安娜",
            "tier": "V",
            "role": "聚合与莱塔支援",
            "note": "四本须适用奖励"
          },
          {
            "name": "纯烬艾雅法拉",
            "tier": "V",
            "role": "优质治疗候选",
            "note": "四本须适用奖励"
          },
          {
            "name": "Mon3tr",
            "tier": "V",
            "role": "地面与叠层支援",
            "note": "四本须适用奖励"
          },
          {
            "name": "维什戴尔",
            "tier": "VI",
            "role": "实际取得后可替换输出",
            "note": "外援/奖励或六本；五本不能直购"
          }
        ],
        "benchOperators": [],
        "keyActions": [
          "来源051：远见空渡是看发牌的一种分支；不是主线硬条件。上五可补鸿雪/迷迭香等，但会改变商店池，不强行冲本。",
          "【推导】高阶卡未到继续四本成熟阵容。按已有成员补莱塔尼亚/萨尔贡等，不为了人数丢掉精准、治疗或阻挡。"
        ]
      }
    ],
    "roundPace": [
      {
        "round": 1,
        "tier": 1,
        "action": "来源051：一本买两人，保本路战力并留对子"
      },
      {
        "round": 2,
        "tier": 1,
        "action": "来源051：继续一本，利用刷新/币/玩偶等资源双买；不默认直接升二"
      },
      {
        "round": 3,
        "tier": 2,
        "action": "来源051：找对子升二，留精准目标与必要地面，不硬搜渡桥"
      },
      {
        "round": 4,
        "tier": 3,
        "action": "来源051：有资金升三，第一次策略按精准目标与对子选牌，不保证命中空弦/雅雅"
      },
      {
        "round": 5,
        "tier": 3,
        "action": "【推导】三本留对子碰四阶精奥核心；空渡顺来可叠远见，缺牌先保战力"
      },
      {
        "round": 6,
        "tier": 3,
        "action": "【推导】先补剑怪/冲锋所需阻挡和控制，三精准不等于锁血；再留对子碰四"
      },
      {
        "round": 7,
        "tier": 3,
        "action": "来源051：第二次策略；对子多或核心缺继续三本，四阶核心齐且有购牌钱可升四再碰五"
      },
      {
        "round": 8,
        "tier": 4,
        "action": "【推导】四本补精锐与生存，尚未满足升本条件可继续三本碰四；别拆掉前排"
      },
      {
        "round": 9,
        "tier": 4,
        "action": "【推导】默认四本收束，不强制上五；按实际成员补聚合/协防与优质治疗"
      },
      {
        "round": 10,
        "tier": 4,
        "action": "来源051：第三次策略，按核心/对子缺口补强，四本可碰五阶支援；不要求升五"
      },
      {
        "round": 11,
        "tier": 4,
        "action": "【推导】核对聚合覆盖与治疗，缺组件补协防/减伤；未取得五阶支援就先用现有战力"
      },
      {
        "round": 12,
        "tier": 4,
        "action": "【推导】按敌人处理隐匿、冲锋与高台受压；有禁疗须处理敌人和站位，不仅加奶"
      },
      {
        "round": 13,
        "tier": 4,
        "action": "【推导】关底换掉多余纯叠层卡，保留精准/奥术人数，补可立即生效的输出和生存"
      },
      {
        "round": 14,
        "tier": 4,
        "action": "【推导】检查主C射程、阻挡、治疗与减伤；四阶终端可用，不为六阶拆成熟阵容"
      },
      {
        "round": 15,
        "tier": 4,
        "action": "【推导】用余钱补有效装备与精锐；没有高阶奖励维持四本收束，核对最终站位"
      }
    ]
  },
  ...COMMUNITY_COMPS,
  ...NGA_COMMUNITY_COMPS,
];

// ---------------------------------------------------------------------------
// 10 MAJOR COVENANT GUIDES (Complete encyclopedia from the 2 tall infographics)
// ---------------------------------------------------------------------------
export const COVENANT_GUIDES: CovenantGuide[] = [
  {
    id: 'ursus',
    name: '乌萨斯盟约 (Ursus)',
    subtitle: '击杀敌人获取临时层数 · 休整期按比例转化为永久固定层数',
    stackCore: '击杀敌人获取临时层数 + 休整期转化永久层数（烈夏/真理/冻河/乌啾/塔露拉）',
    pactSummary: '战斗中击杀单位叠加【乌萨斯】临时层数，并在休整期通过烈夏、真理等干员转化为永久固定层数；在场6名不同乌萨斯干员时击杀叠层大幅提升。',
    synergySubPacts: ['迅捷', '突袭', '奥术', '灵巧', '奇迹'],
    difficulty: '新手首选',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '烈夏', tier: 'I', category: '前中期叠层', effect: '<进入休整期时>转化2/4层【乌萨斯】临时层数为固定层数（纯乌萨斯词条可喂寻呼）' },
      { name: '真理', tier: 'II', category: '前中期叠层', effect: '<进入休整期时>场上每有一名【乌萨斯】干员，转化1/2层临时层数为固定层数' },
      { name: '奥尔佳', tier: 'III', category: '前中期叠层', effect: '<战斗中>部署时使已激活的【乌萨斯】【突袭】层数+4/8（每场至多12/24层）' },
      { name: '乌啾', tier: 'III', category: '前中期叠层', effect: '【叠层核心】<战斗中>攻击范围内每有一名敌人被击倒使已激活的【乌萨斯】【迅捷】层数+1/2（每场至多16/32层）' },
      { name: '极光', tier: 'III', category: '辅助/过渡', effect: '<战斗中>冻结敌人叠层，兼具乌萨斯与谢拉格双标签过渡' },
      { name: '维伊', tier: 'IV', category: '后期叠层', effect: '【乌萨斯+奥术核心】精奥远后期蹭乌萨斯大盟约必拿，高额法伤与叠层兼备' },
      { name: '赫拉格', tier: 'IV', category: '本家输出终端', effect: '<战斗中>【乌萨斯】每叠加2/1层，本干员攻速+1；残血高攻速单挑极强' },
      { name: '怒潮凛冬', tier: 'V', category: '辅助/过渡', effect: '<战斗开始时>使已激活的【乌萨斯】临时层数+4/8，获得乌萨斯呼吸器' },
      { name: '冻河', tier: 'V', category: '后期叠层', effect: '【乌萨斯+灵巧】五阶高台核心，配合灵巧/迅捷发牌灵活叠层' },
      { name: '塔露拉', tier: 'VI', category: '本家输出终端', effect: '【叠层+输出终端】<战斗中>乌萨斯盟约强化：击倒单位叠加的临时层数提升至4/6层；在场6名乌萨斯时提升至6/8层' },
    ],
    proTips: [
      '新手第一把强烈推荐从乌萨斯上手，配【迅捷】【奥术】【灵巧】，打一场Boss凭空多出500层直接冲上999层',
      '精奥远后期若想蹭乌萨斯大盟约，只需拿：维伊(IV)、塔露拉(VI)、冻河(V)/奥尔佳(III)，再用寻呼喂纯乌萨斯词条（烈夏）即可！',
    ],
  },
  {
    id: 'kazimierz',
    name: '卡西米尔盟约 (Kazimierz)',
    subtitle: '再部署高频叠层（不屈/突袭） · 倒地自动召唤整备区干员上场+65%真伤',
    stackCore: '再部署叠层（不屈/突袭） + 远牙射程减CD + 倒地召唤整备区干员',
    pactSummary: '每次干员部署时卡西米尔干员攻击力提升；在场6名卡西米尔时，地面干员被击倒召唤整备区最右侧卡西米尔干员上场，且开技能或部署后30秒内攻击附带65%攻击力真实伤害！',
    synergySubPacts: ['不屈', '突袭', '迅捷', '灵巧'],
    difficulty: '爽快爆发',
    imageUrl: '/assets/aistudio/e778a8ca1370b949f540e862a04df703_f94c3d19.png',
    operators: [
      { name: '野鬃', tier: 'I', category: '前中期叠层', effect: '<战斗中>部署时使已激活的【卡西米尔】层数+1/2（每回合至多2/4层）' },
      { name: '砾', tier: 'II', category: '前中期叠层', effect: '<战斗中>部署时使已激活的【卡西米尔】【不屈】层数+2/4（每场至多12/24层）' },
      { name: '历阵锐枪芬', tier: 'III', category: '前中期叠层', effect: '<战斗中>部署时使自身已激活的【卡西米尔】【突袭】盟约层数+3/6（每场至多9/18层）' },
      { name: '风丸', tier: 'III', category: '辅助/过渡', effect: '<战斗中>被击倒时召唤整备区一名【卡西米尔】干员（优先最右侧）上场，并使整备区干员再部署时间-30%/60%' },
      { name: '瑕光', tier: 'III', category: '辅助/过渡', effect: '三阶重装，提供卡西米尔前排阻挡与受击治疗' },
      { name: '远牙', tier: 'IV', category: '辅助/过渡', effect: '<战斗中>攻击范围内每有一名敌人被击倒使攻击范围内及整备区中的干员再部署时间-3/6秒' },
      { name: '玛恩纳', tier: 'IV', category: '本家输出终端', effect: '【本家站场输出】<战斗中>【卡西米尔】每叠加5层，本干员部署后100秒内基础攻击力+10/20、基础生命上限+50/100' },
      { name: '焰尾', tier: 'V', category: '后期叠层', effect: '<休整期结束时>整备区每有一名干员，使已激活的【卡西米尔】【迅捷】层数+1/2' },
      { name: '薇薇安娜', tier: 'V', category: '后期叠层', effect: '<战斗中>卡西米尔与莱塔尼亚双标签，场上同盟约干员战斗期叠层上限+7/14' },
      { name: '耀骑士临光', tier: 'VI', category: '本家输出终端', effect: '<战斗中>被击倒时召唤整备区最右侧【卡西米尔】【突袭】上场并使双方盟约+6/12；无视部署位空降真伤' },
    ],
    proTips: [
      '既可搭配森蚺大丑玩“自动沙砾机”，也能走“6卡西米尔远牙阵”把干员全摆远牙射程内无限减CD刷层',
      '整备区最右侧一定要放高战力卡西米尔干员（如耀骑士临光、玛恩纳）触发倒地召唤特效',
    ],
  },
  {
    id: 'iberia',
    name: '伊比利亚盟约 (Iberia)',
    subtitle: '根据场上干员售出价格获取海量层数 · 养成高身价精锐滚雪球',
    stackCore: '旅骨朝向高售价温蒂或海沫；流明按存活人数叠层，普通棘刺按场上总售价补伊比利亚。',
    pactSummary: '围绕干员“售出价格”进行指数级叠层，通过每回合自动涨价的干员配合旅骨、艾丽妮等按售价倍数加层的核心实现中后期层数爆炸。',
    synergySubPacts: ['聚合', '迅捷', '精准'],
    difficulty: '经济运营',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '深靛', tier: 'I', category: '前中期叠层', effect: '<休整期结束时>使已激活的【伊比利亚】层数+2/4' },
      { name: '旅骨', tier: 'III', category: '前中期叠层', effect: '【前期叠层核心】<休整期结束时>使自身及身前一格干员已激活的盟约叠加等同于其售出价格1倍/2倍的层数' },
      { name: '海沫', tier: 'III', category: '辅助/过渡', effect: '<休整期结束时>自身售出价格+1/2（自身售出价格至多为4/8）' },
      { name: '温蒂', tier: 'IV', category: '辅助/过渡', effect: '伊比利亚、坚守。售价3/6，可站旅骨身前；3技能补控场。' },
      { name: '流明', tier: 'IV', category: '前中期叠层', effect: '战斗结束时，每名存活的我方干员使已激活的伊比利亚、聚合叠加1/2层。' },
      { name: '艾丽妮', tier: 'V', category: '本家输出终端', effect: '战斗中周围12格每击倒一名敌人，回复自身3/6技力。' },
      { name: '棘刺', tier: 'V', category: '后期叠层', effect: '休整期结束时按场上干员总售价的1/2倍叠伊比利亚，上限12/24层。' },
      { name: '引星棘刺', tier: 'VI', category: '本家输出终端', effect: '【六本终端】使已激活的【伊比利亚】【迅捷】层数+12/24，炼金海域全屏输出' },
    ],
    proTips: [
      '精锐旅骨面向售价6的精锐温蒂或养到售价8的海沫，可给目标叠12或16层。先确认站位、当前售价和已激活盟约。',
    ],
  },
  {
    id: 'leithanien',
    name: '莱塔尼亚盟约 (Leithanien)',
    subtitle: '击杀敌人与首次主动刷新获取层数 · 高台法术与精准聚合轰炸',
    stackCore: '击杀敌人叠层 + 每回合首次主动刷新叠层（伺夜整备区也生效）',
    pactSummary: '前期靠每回合首次刷新与击杀叠层，中期黑键+艾雅法拉联动奥术与精准，后期薇薇安娜+纯烬艾雅法拉提供聚合与治疗兜底。',
    synergySubPacts: ['奥术', '精准', '聚合', '奇迹', '远见'],
    difficulty: '公式主流',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '地灵', tier: 'I', category: '前中期叠层', effect: '<战斗中>攻击范围内每有一名敌人被击倒使【莱塔尼亚】+1/2（每回合至多1/2层）' },
      { name: '折光', tier: 'II', category: '辅助/过渡', effect: '【纯莱塔尼亚词条】二阶单莱塔尼亚词条干员，喂杰西卡寻呼机可100%定向搜出高阶莱塔尼亚核心！' },
      { name: '复奏', tier: 'II', category: '前中期叠层', effect: '二阶莱塔尼亚与奇迹干员，过渡期优质凑羁绊挂件' },
      { name: '车尔尼', tier: 'III', category: '前中期叠层', effect: '<休整期结束时>使已激活的【莱塔尼亚】层数+4/8，自带莱塔尼亚小鼓底材' },
      { name: '伺夜', tier: 'III', category: '前中期叠层', effect: '<刷新时>若为本回合首次主动刷新，使已激活的【叙拉古】【莱塔尼亚】层数+2/4（整备区也生效）' },
      { name: '黑键', tier: 'IV', category: '本家输出终端', effect: '【精奥远必抓】<战斗中>【莱塔尼亚】【奥术】每叠加2/1层，技力回复+0.02/秒，攻击力+1%（推荐带2技能）' },
      { name: '艾雅法拉', tier: 'IV', category: '本家输出终端', effect: '【四本法术大C】有莱塔尼亚+奥术时输出极高（推荐带3技能火山，也可背对佩佩叠层）' },
      { name: '薇薇安娜', tier: 'V', category: '后期叠层', effect: '<战斗中>攻击范围内每有一名敌人被击倒使已激活的【莱塔尼亚】【聚合】层数+2/4（打茧Boss必带）' },
      { name: '纯烬艾雅法拉', tier: 'V', category: '后期叠层', effect: '【五本神奶】大范围治疗与元素损伤恢复，推荐带2技能，打新Boss防秒杀核心' },
    ],
    proTips: [
      '杰西卡精奥远分奴口诀：莱塔尼亚很多人没必要抓，只要抓【黑键】【艾雅法拉】【纯烬艾雅法拉】【折光（纯莱词条喂寻呼）】即可！',
      '【伺夜】抓到后中后期直接放进整备区不要卖，每回合按一次刷新就能白嫖叙拉古+莱塔尼亚层数',
    ],
  },
  {
    id: 'aegir',
    name: '阿戈尔盟约 (Aegir)',
    subtitle: '前期靠部署与击倒叠层 · 双路分别守 · 克莱门莎终结',
    stackCore: '安哲拉击倒叠层；浊心斯卡蒂范围内部署叠层，有战斗上限。',
    pactSummary: '三人激活。开战时吞噬身前一格干员，造成物理伤害，取得其基础攻击力与阻挡数，并按对方等阶叠层。场上有六名不同阿戈尔时，前 3 名首次被击倒的本家可复活；歌蕾蒂娅策略会改为整备区替换。',
    synergySubPacts: ['灵巧', '突袭', '助力', '聚合'],
    difficulty: '进阶体系',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '幽灵鲨', tier: 'I', category: '前中期叠层', effect: '<战斗中>部署时使已激活的【阿戈尔】层数+1/2；每回合上限1/2层' },
      { name: '安哲拉', tier: 'II', category: '前中期叠层', effect: '<战斗中>每击倒一名敌人或我方干员使已激活的【阿戈尔】【助力】层数+3/6（每回合至多9/18层）' },
      { name: '深巡', tier: 'III', category: '辅助/过渡', effect: '<战斗中>部署时阿戈尔每20/10层，使自身及周围四格干员攻速+1，持续30秒' },
      { name: '斯卡蒂', tier: 'III', category: '前中期叠层', effect: '部署时阿戈尔层数 +4/8（每场战斗至多 8/16 层）' },
      { name: '水月', tier: 'IV', category: '辅助/过渡', effect: '副路输出。阿戈尔每 20/10 层，自身与相邻四格的队友造成伤害时令目标移速 -1%，持续 3 秒；与华法琳可开灵巧。' },
      { name: '归溟幽灵鲨', tier: 'IV', category: '辅助/过渡', effect: '被击倒或与替身切换时，让周围八格的阿戈尔干员回复 5/10 技力。' },
      { name: '歌蕾蒂娅', tier: 'V', category: '辅助/过渡', effect: '<进入休整期时>普通需同行3人，精锐无需人数条件，获得幽灵鲨、安哲拉、深巡或斯卡蒂之一' },
      { name: '乌尔比安', tier: 'V', category: '辅助/过渡', effect: '部署时阿戈尔每 20/10 层，使自身及相邻四格的干员攻击力 +1%，持续 30 秒。' },
      { name: '浊心斯卡蒂', tier: 'VI', category: '后期叠层', effect: '<战斗中>攻击范围内每有一名我方干员部署使已激活的【阿戈尔】层数+2/4（每场至多20/40层）' },
      { name: '克莱门莎', tier: 'VI', category: '本家输出终端', effect: '【后期输出核心】<战斗开始时>【阿戈尔】每叠加20/10层，使场上所有敌人侵蚀伤害冷却恢复速度+1%' },
    ],
    proTips: [
      '双路让深巡或幽灵鲨接重压侧。水月放另一侧，避免开战就被吞噬击倒。',
      '灵巧优先；有实际突袭来源、能达到 50 层再用突袭补攻速。聚合按元素损伤压力加。',
      'Boss 战先保证克莱门莎覆盖走线，再排吞噬链。假想敌·械可能被 2 技能推离友方火力区，开打后确认落点。',
    ],
  },
  {
    id: 'siracusa',
    name: '叙拉古盟约 (Siracusa)',
    subtitle: '刷新卡池叠层 · 免费刷新永动机与斥罪/伺夜/荒芜拉普兰德',
    stackCore: '主动刷新卡池叠层 + 免费刷新次数叠加（云迹/矩/贝洛内）',
    pactSummary: '每次刷新商店都能直接转化为【叙拉古】与【奇迹】层数，配合云迹、矩与伺夜实现D牌即叠层！',
    synergySubPacts: ['奇迹', '精准', '突袭', '不屈', '莱塔尼亚'],
    difficulty: 'D牌爽局',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '拉普兰德', tier: 'I', category: '前中期叠层', effect: '<获得时>【叙拉古】层数+2/4，自带沉默特效' },
      { name: '奥斯塔', tier: 'II', category: '前中期叠层', effect: '二阶散射手，叙拉古前期群体物理过渡' },
      { name: '云迹', tier: 'II', category: '辅助/过渡', effect: '<进入休整期时>获得1/2次免费刷新（必须上场生效）' },
      { name: '矩', tier: 'II', category: '辅助/过渡', effect: '二阶叙拉古与奇迹干员，整备区激活奇迹并触发获得时联动' },
      { name: '伺夜', tier: 'III', category: '前中期叠层', effect: '<刷新时>若为本回合首次主动刷新，使【叙拉古】【莱塔尼亚】+2/4（整备区也生效）' },
      { name: '忍冬', tier: 'III', category: '前中期叠层', effect: '<战斗中>造成弱点伤害；每击倒1敌使【叙拉古】【精准】+2/4（每回合至多8/16层）' },
      { name: '斥罪', tier: 'IV', category: '本家输出终端', effect: '【叙拉古】【不屈】每3层攻+1%/2%，高额护盾反伤单守一路' },
      { name: '铃兰', tier: 'V', category: '辅助/过渡', effect: '<休整期结束时>本回合每进行1次刷新，使已激活的【叙拉古】+2/4、【奇迹】+1/2' },
      { name: '贝洛内', tier: 'V', category: '后期叠层', effect: '获得免费刷新（触发后升级，至多获得3次免费刷新）' },
      { name: '荒芜拉普兰德', tier: 'VI', category: '本家输出终端', effect: '<战斗中>每击倒1敌【叙拉古】+2（精锐：范围扩大到所有叙拉古干员，击倒+4，每场至多40层）' },
    ],
    proTips: [
      '搭配策略家【电弧】，每回合首次刷新倒赚资金，还能玩二本叙拉古（伺夜+全息投影+云迹）无限刷层',
    ],
  },
  {
    id: 'yan',
    name: '炎盟约 (Yan)',
    subtitle: '获取干员叠层 + 元素损伤爆发叠层 · 余与烛煌版本T0',
    stackCore: '每回合购买/获取干员叠层 + 余/黍元素损伤爆发叠层',
    pactSummary: '前期靠购买干员与获得时词条快速起层，中期靠余/灼烧元素损伤爆发与聚合坚守肉成铁桶，后期黍+夕+烛煌接管比赛。',
    synergySubPacts: ['聚合', '坚守', '灵巧', '奥术', '远见', '维多利亚', '投资人'],
    difficulty: '版本强势',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '拜松', tier: 'I', category: '前中期叠层', effect: '<获得时>【炎】层数+2/4，一阶优质重装过渡' },
      { name: '宴', tier: 'II', category: '前中期叠层', effect: '<获得时>获得等同于当前调度中心等级1/2倍的【炎】层数' },
      { name: '风絮', tier: 'III', category: '前中期叠层', effect: '<休整期结束时>本回合每获得过一名干员，使已激活的【炎】【聚合】层数+2/4（每回合至多16/32层）' },
      { name: '乌有', tier: 'III', category: '辅助/过渡', effect: '三阶炎国特种，提供控制与前中期过渡' },
      { name: '余', tier: 'IV', category: '前中期叠层', effect: '【四本真神】<战斗中>周围八格每有一名敌人触发元素损伤爆发使自身已激活的盟约层数+1/2（每回合至多8/16层）' },
      { name: '仇白', tier: 'IV', category: '前中期叠层', effect: '【炎+灵巧核心】配合华法琳高频开技能狂叠【炎】与【灵巧】层数' },
      { name: '黍', tier: 'V', category: '后期叠层', effect: '<战斗中>攻击范围内每有一名敌人触发元素损伤爆发使已激活的【炎】【聚合】高额回血与叠层' },
      { name: '老鲤', tier: 'V', category: '本家输出终端', effect: '<战斗中>【炎】【投资人】每叠加3层，本干员攻击力+1%/2%' },
      { name: '夕', tier: 'VI', category: '后期叠层', effect: '<休整期结束时>本回合每获得过一名干员，使已激活的【炎】【奥术】层数+2/4（每回合至多24/48层）' },
      { name: '烛煌', tier: 'VI', category: '本家输出终端', effect: '【六本炎维双神】攻击范围内敌人触发元素损伤爆发使【炎】【维多利亚】+1/2，吃满终极维式重锤与瓶装烈性反应！' },
    ],
    proTips: [
      '精奥远全被Ban时的头号救星【炎灵聚】！【余(IV)】自带坚守+聚合+炎，只要阻挡敌人触发元素爆条就能同时叠自身所有已激活盟约！',
    ],
  },
  {
    id: 'kjerag',
    name: '谢拉格盟约 (Kjerag)',
    subtitle: '不融冰控场 · 初雪覆盖冻结区',
    stackCore: '耶拉产出不融冰，高频攻击触发冻结，初雪覆盖冻结地点叠层。',
    pactSummary: '三谢拉格可用冰冻和叠层强化本家输出。飞行、分路与免控敌人需要独立处理。',
    synergySubPacts: ['精准', '远见', '灵巧', '维多利亚'],
    difficulty: '新手兜底',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '角峰', tier: 'I', category: '辅助/过渡', effect: '一阶谢拉格重装，高法抗前排过渡' },
      { name: '雪猎', tier: 'II', category: '前中期叠层', effect: '<获得时>【谢拉格】【精准】层数+4/8' },
      { name: '极光', tier: 'III', category: '前中期叠层', effect: '<获得时>叠加谢拉格；每次触发后升级' },
      { name: '耶拉', tier: 'III', category: '辅助/过渡', effect: '<获得时>获得1/2件“谢拉格不融冰”' },
      { name: '初雪', tier: 'III', category: '前中期叠层', effect: '<战斗中>攻击范围内敌人进入冻结时使【谢拉格】+1/2（每回合至多16/32层）' },
      { name: '寒檀', tier: 'IV', category: '辅助/过渡', effect: '<休整期开始及结束时>使已激活的【远见】层数+3/6' },
      { name: '灵知', tier: 'IV', category: '辅助/过渡', effect: '四阶谢拉格辅助，提供脆弱与群体冻结控制' },
      { name: '圣聆初雪', tier: 'V', category: '后期叠层', effect: '五阶谢拉格核心，大范围寒冷领域与法术爆发' },
      { name: '凛御银灰', tier: 'V', category: '后期叠层', effect: '<战斗中>身前一格【谢拉格】【灵巧】干员的单场战斗叠层上限+75%/150%' },
      { name: '锏', tier: 'VI', category: '本家输出终端', effect: '【六本谢拉格大C】无视寒冷冻结高频三连斩，吃满谢拉格层数瞬间清场' },
    ],
    proTips: [
      '三谢可留外援位置。机械师用格雷伊带手套、不融冰控场；空弦双冰走远见经济。让初雪覆盖冻结区，Boss免控或卡输出时换位。',
    ],
  },
  {
    id: 'victoria',
    name: '维多利亚盟约 (Victoria)',
    subtitle: '携带装备干员数量叠层 · 免费锻造维式重锤与装备升精锐',
    stackCore: '场上携带装备干员数叠层 + 杰西卡速四找涤火杰西卡 + 重锤全员武装',
    pactSummary: '通过赠送维式重锤、随机装备以及将普通装备升级为精锐装备，全员神装触发【维多利亚】【坚守】【奥术】【奇迹】多路叠层。',
    synergySubPacts: ['坚守', '奥术', '奇迹', '炎', '谢拉格'],
    difficulty: '装备大户',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '慕斯', tier: 'I', category: '前中期叠层', effect: '<休整期结束时>使已激活的【维多利亚】【奥术】层数+1/2' },
      { name: '褐果', tier: 'I', category: '前中期叠层', effect: '<休整期结束时>使已激活的【维多利亚】层数+1/2' },
      { name: 'Miss.Christine', tier: 'II', category: '前中期叠层', effect: '<休整期结束时>使已激活的【维多利亚】【奥术】层数+3/6（适合挂火锤）' },
      { name: '哈洛德', tier: 'II', category: '辅助/过渡', effect: '二阶医疗，奥术坚守维前期必留，适合挂伪装服/聚合箱/护盾无人机' },
      { name: '水灯心', tier: 'III', category: '辅助/过渡', effect: '<战斗中>按敌人防御与法抗切换伤害类型' },
      { name: '凯瑟琳', tier: 'III', category: '辅助/过渡', effect: '<获得时>获得维式重锤，小概率获得特殊维式重锤' },
      { name: '涤火杰西卡', tier: 'IV', category: '后期叠层', effect: '<休整期结束时>每有一名带装备的在场干员，【维多利亚】【坚守】层数+2/4' },
      { name: '白铁', tier: 'IV', category: '辅助/过渡', effect: '<进入休整期时>使自身携带的装备变为精锐版本' },
      { name: '维娜·维多利亚', tier: 'V', category: '后期叠层', effect: '<休整期结束时>场上每有一名不同阶的【维多利亚】干员，使已激活的【维多利亚】【奇迹】层数+2/4（挂双模机械臂）' },
      { name: '烛煌', tier: 'VI', category: '本家输出终端', effect: '【六本第一主C】元素损伤爆发叠炎+维多利亚，必挂【终极维式重锤】【瓶装烈性反应】【双模机械臂】' },
      { name: '酒神', tier: 'VI', category: '本家输出终端', effect: '【六本副C】维多利亚高阶终端，适合挂【瓶装烈性反应】' },
    ],
    proTips: [
      '奥术坚守维装备口诀：终极维式重锤→烛煌/水灯心；瓶装烈性反应→烛煌/酒神；双模机械臂→烛煌/维娜/水灯心；电流锤→高台+杰西卡；加速锤→水灯心；伪装服/聚合箱/护盾无人机→哈洛德；蜂鸣器→凯瑟琳/杰西卡！',
    ],
  },
  {
    id: 'sargon',
    name: '萨尔贡盟约 (Sargon)',
    subtitle: '开启技能高频叠层 · 异客佩佩鸿雪真言与蜜茶经济补给',
    stackCore: '干员每次开启技能叠层（搭配华法琳/至简） + 佩佩背对术羊/雅雅眩晕叠层',
    pactSummary: '围绕“开启技能”次数叠加萨尔贡、坚守与精准层数，道中提供盟约之币与萨尔贡蜜茶，后期异客、佩佩、鸿雪、真言输出拉满。',
    synergySubPacts: ['迅捷', '精准', '坚守', '不屈', '奥术'],
    difficulty: '高频技能',
    imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
    operators: [
      { name: '折桠', tier: 'I', category: '前中期叠层', effect: '<战斗中>部署时使已激活的【萨尔贡】【不屈】层数+1/2，沙砾机1本核心' },
      { name: '艾丝黛尔', tier: 'I', category: '前中期叠层', effect: '<战斗中>每次开启技能时使已激活的【萨尔贡】层数+1/2（每回合至多2/4层）' },
      { name: '泡泡', tier: 'II', category: '前中期叠层', effect: '<战斗中>每次开启技能时使已激活的【萨尔贡】【坚守】层数+2/4（每回合至多4/8层）' },
      { name: '莎草', tier: 'II', category: '辅助/过渡', effect: '二阶医疗，提供萨尔贡治疗过渡' },
      { name: '瑰盐', tier: 'II', category: '辅助/过渡', effect: '伊比利亚聚合医疗，可作外援续航；不计入萨尔贡人数' },
      { name: '至简', tier: 'III', category: '辅助/过渡', effect: '固定一费，只有萨尔贡词条。' },
      { name: '卡涅利安', tier: 'III', category: '辅助/过渡', effect: '获得时发一件迅捷作战粮，精锐发两件。' },
      { name: '异客', tier: 'IV', category: '辅助/过渡', effect: '休整期发盟约之币或萨尔贡浓茶；精锐发两件，有小概率发现拟态物质。' },
      { name: '森蚺', tier: 'IV', category: '辅助/过渡', effect: '四阶重装巨像，萨尔贡与不屈双标签前排大盾' },
      { name: '佩佩', tier: 'V', category: '后期叠层', effect: '周围八格每有单位进入沉睡或眩晕，给自身和身后一格目标叠1/2层；每场上限9/18层。' },
      { name: '鸿雪', tier: 'V', category: '本家输出终端', effect: '开技能叠萨尔贡和精准4/8层，每回合至多16/32层。' },
      { name: '真言', tier: 'VI', category: '本家输出终端', effect: '【六本输出终端】<战斗中>【萨尔贡】每叠加5层，本干员攻击力+1%/2%' },
    ],
    proTips: [
      '佩佩3技能的自我眩晕也可触发。用四合院时让凛御银灰和阿米娅都面向佩佩，把指定叠层干员放在佩佩身后。',
      '杰西卡精奥远蹭萨尔贡大盟约口诀：萨尔贡只要抓【异客】【鸿雪】【佩佩】【至简（纯萨词条喂寻呼）】！',
    ],
  },
];

// ---------------------------------------------------------------------------
// 13 UNIVERSAL STACKING OPERATORS (From /assets/aistudio/e88e3dcc6c1b11c17535b2bd941f2bd4_caa476ba.png)
// ---------------------------------------------------------------------------
export const UNIVERSAL_STACKERS: UniversalStacker[] = [
  {
    id: 'pallas',
    name: '帕拉斯',
    tier: 'VI',
    tag: '休整期身前+18',
    timing: '休整期结束时',
    targetZone: '身前一格',
    baseStacksPerRound: 18,
    worksOnBench: false,
    description: '<休整期结束时>使自身以及身前一格干员已激活的盟约层数+18',
    bestPartner: '塞雷娅（站帕拉斯身后复制+18）或逻各斯（站帕拉斯身前吃满全词条+18）',
  },
  {
    id: 'civilight-eterna',
    name: '魔王',
    tier: 'VI',
    tag: '核心盟约+20',
    timing: '休整期结束时',
    targetZone: '全场核心盟约',
    baseStacksPerRound: 20,
    worksOnBench: false,
    description: '<休整期结束时>使已激活的核心盟约层数+20',
    bestPartner: '任何大盟约主C阵容（直接无条件+20核心盟约）',
  },
  {
    id: 'saria',
    name: '塞雷娅',
    tier: 'V',
    tag: '特异化复制身前',
    timing: '休整期结束时',
    targetZone: '身前一格',
    baseStacksPerRound: 18,
    worksOnBench: false,
    description: '【特异化】身前一格干员若为“休整期结束时”特质，本干员的特质与其相同（推荐换3技能钙质化）',
    bestPartner: '站【帕拉斯】【魔王】【旅骨】【渡桥】【水灯心】正后方，完美克隆其休整期叠层效果！',
  },
  {
    id: 'mon3tr',
    name: 'Mon3tr',
    tier: 'V',
    tag: '八格上限+60%',
    timing: '战斗中',
    targetZone: '周围八格',
    baseStacksPerRound: 12,
    multiplierEffect: 1.6,
    worksOnBench: false,
    description: '<战斗中>周围八格干员每场战斗的叠层上限+60%（带3技能道中战力极强）',
    bestPartner: '寒檀、异客、霍尔海雅、余、砾等有单场叠层上限的核心卡',
  },
  {
    id: 'amiya',
    name: '阿米娅',
    tier: 'V',
    tag: '身前每次叠层+2',
    timing: '战斗中',
    targetZone: '身前一格',
    baseStacksPerRound: 16,
    worksOnBench: false,
    description: '<战斗中>身前一格干员提升盟约层数时，每次提升的层数额外+2（不受叠层上限影响）',
    bestPartner: '站【寒檀】【余】【乌啾】【霍尔海雅】身后，每次触发+1直接变成+3！',
  },
  {
    id: 'warfarin',
    name: '华法琳',
    tier: 'IV',
    tag: '赋予开技能+2层',
    timing: '战斗开始时',
    targetZone: '身前一格',
    baseStacksPerRound: 14,
    worksOnBench: false,
    description: '<战斗开始时>使身前一格干员获得特质“<开启技能时>使自身已激活的盟约层数+2（每回合至多叠加14层）”',
    bestPartner: '霍尔海雅、异客、仇白、砾等高频短轴技能干员',
  },
  {
    id: 'silence-alt',
    name: '淬羽赫默',
    tier: 'IV',
    tag: '整备区全员+2',
    timing: '休整期结束时',
    targetZone: '整备区生效',
    baseStacksPerRound: 12,
    worksOnBench: false,
    description: '<休整期结束时>使整备区每名干员已激活的盟约层数+2',
    bestPartner: '整备区塞满多盟约干员（如远见/奇迹挂件），每回合群体+2层',
  },
  {
    id: 'archetto',
    name: '空弦',
    tier: 'III',
    tag: '休整期身前+6',
    timing: '进入休整期时',
    targetZone: '身前一格',
    baseStacksPerRound: 6,
    worksOnBench: false,
    description: '<进入休整期时>使自身及身前一格干员已激活的盟约层数+6（推荐换1技能）',
    bestPartner: '精准+远见双词条神卡，与渡桥面对面互指瞬间启动200+层远见！',
  },
  {
    id: 'poncirus',
    name: '青枳',
    tier: 'III',
    tag: '休整期身后+6',
    timing: '进入休整期时',
    targetZone: '身后一格',
    baseStacksPerRound: 6,
    worksOnBench: false,
    description: '<进入休整期时>使自身及身后一格干员已激活的盟约层数+6',
    bestPartner: '可站在主C身前当盾/先锋，同时给身后主C已激活盟约+6层',
  },
  {
    id: 'haigu',
    name: '旅骨',
    tier: 'III',
    tag: '售价2倍叠层',
    timing: '休整期结束时',
    targetZone: '身前一格',
    baseStacksPerRound: 12,
    worksOnBench: false,
    description: '<休整期结束时>使自身及身前一格干员已激活的盟约叠加等同于其售出价格2倍的层数',
    bestPartner: '精锐温蒂（售价6）、养满售价8的海沫；精锐旅骨按目标实际售价×2叠层。',
  },
  {
    id: 'windscoot',
    name: '渡桥',
    tier: 'II',
    tag: '休整期身前+4',
    timing: '休整期结束时',
    targetZone: '身前一格',
    baseStacksPerRound: 4,
    worksOnBench: false,
    description: '<休整期结束时>使自身及身前一格干员已激活的盟约层数+4（已有空弦时可互指叠远见）',
    bestPartner: '已有空弦时可配对叠远见；杰西卡精准检索不强绑渡桥，也不保证策略命中指定卡。',
  },
  {
    id: 'astgenne',
    name: '星源',
    tier: 'II',
    tag: '后台最高盟约+4',
    timing: '休整期结束时',
    targetZone: '整备区生效',
    baseStacksPerRound: 4,
    worksOnBench: true,
    description: '<休整期结束时>使当前已激活且层数最多的盟约层数+4（此干员在整备区也生效）',
    bestPartner: '买下后直接丢在整备区即可每回合白嫖+4最高层盟约',
  },
  {
    id: 'quercus',
    name: '夏栎',
    tier: 'I',
    tag: '后台最高盟约+2',
    timing: '休整期结束时',
    targetZone: '整备区生效',
    baseStacksPerRound: 2,
    worksOnBench: true,
    description: '<休整期结束时>使当前已激活且层数最多的盟约层数+2（此干员在整备区也生效）',
    bestPartner: '一阶神仙挂件，放整备区不占人口白嫖层数',
  },
];

// ---------------------------------------------------------------------------
// ALL UPLOADED GALLERY IMAGES (For 1-click full-resolution inspection)
// ---------------------------------------------------------------------------
export interface UploadedAssetItem {
  id: string;
  title: string;
  category: '站位一图流' | '公式化运营' | '盟约全图鉴' | '贴吧高分实战';
  url: string;
  description: string;
}

export const UPLOADED_GALLERY_ITEMS: UploadedAssetItem[] = [
  ...BOSS_ROUTE_GUIDES,
  { id: 'nga-084-pepe', title: '佩佩四合院 · 指定目标叠层', category: '站位一图流', url: PEPE_POSITION_IMAGE, description: 'NGA 084 摆位示意：凛御银灰与阿米娅面向佩佩，目标放佩佩背后一格。' },
  {id:'source-059', title:'复奏：三连奖励留给哪一档', category:'贴吧高分实战', url:'/assets/community/source-059.jpg', description:'作者的奖励分配；速三与一本留对子分开选择'},
  {id:'source-060', title:'拜松：前六轮买牌与包店', category:'贴吧高分实战', url:'/assets/community/source-060.jpg', description:'R5 包店、R6 上四；高层数为个人样本'},
  {id:'source-061', title:'雪猎：聚合回血或角峰抗首击', category:'贴吧高分实战', url:'/assets/community/source-061.jpg', description:'精迅三谢的两种生存配置'},
  {id:'source-062', title:'多阵营运营：稳场后再升本', category:'贴吧高分实战', url:'/assets/community/source-062.jpg', description:'维、谢、阿、卡、伊、莱的启动条件与终端'},
  {id:'source-063', title:'机械师分队：装备开局', category:'贴吧高分实战', url:'/assets/community/source-063.jpg', description:'同一策略搭配不同终盘的实战样本，包含中断局'},
  {id:'source-064', title:'机械师谢拉格：格雷伊控场', category:'贴吧高分实战', url:'/assets/community/source-064.jpg', description:'手套和不融冰控制地面；该样本未通过隐藏Boss'},
  {id:'source-065', title:'精准、奥术受限时的备选', category:'贴吧高分实战', url:'/assets/community/source-065.jpg', description:'拜松走地炎、灵巧坚守维、灵巧阿戈尔的来源摘录'},
  {"id": "source-054", "title": "三本伊比利亚失败与升本讨论", "category": "贴吧高分实战", "url": "/assets/community/source-054.jpg", "description": "三本不硬追双精锐，按回转、清怪与Boss压力补强"},
  {"id": "source-055", "title": "谢拉格冻结位与精迅输出", "category": "贴吧高分实战", "url": "/assets/community/source-055.jpg", "description": "失败求助与回帖建议；腾出输出位，不把层数视为通关保证"},
  {"id": "source-056", "title": "维多利亚前期过渡与转型", "category": "贴吧高分实战", "url": "/assets/community/source-056.jpg", "description": "核心到手再转三维，前期保战力，不硬塞六维"},
  {"id": "source-057", "title": "拜松整店经济与四本炎", "category": "贴吧高分实战", "url": "/assets/community/source-057.jpg", "description": "对子升本、整店购买与成功样本；费用按本局显示"},
  {"id": "source-058", "title": "拜松风絮三炎与坚守", "category": "贴吧高分实战", "url": "/assets/community/source-058.jpg", "description": "三炎灵巧聚合、三坚守与五阶塞雷娅条件"},
  {"id": "suzuran-acquisition", "title": "铃兰低本镜冰获取流", "category": "贴吧高分实战", "url": "/assets/community/suzuran-acquisition.jpg", "description": "正文及回复；及时升三，包含缺牌与Boss失败反馈"},
  {"id": "strategy-reference-unknown-date", "title": "策略参考截图（日期待核）", "category": "贴吧高分实战", "url": "/assets/community/strategy-reference-unknown-date.png", "description": "图中11/25未标年份；数值以详情所列PRTS快照和本局游戏为准"},
  { id: 'source-041', title: '谢拉格灵巧启动与精迅分支', category: '贴吧高分实战', url: '/assets/community/source-041.jpg', description: '先有叠层手再选灵巧；三谢与六谢、灵奥与精迅均有取舍' },
  { id: 'source-042', title: '二本流大丑系统教学·抓取一', category: '贴吧高分实战', url: '/assets/community/source-042.jpg', description: '与044同帖不同抓取；云迹奇迹经济、双精锐大丑各六金镜目标' },
  { id: 'source-043', title: '维多利亚叠层与条件终端讨论', category: '贴吧高分实战', url: '/assets/community/source-043.jpg', description: '大变空弦与大丑兜底分支；三四本核心、装备成本与前期崩线反例' },
  { id: 'source-044', title: '二本流大丑系统教学·抓取二', category: '贴吧高分实战', url: '/assets/community/source-044.jpg', description: '与042合并为一条路线；保留不同展开回复及奇迹组件受限讨论' },
  { id: 'source-045', title: '二本大丑刷新经济与缺牌反例', category: '贴吧高分实战', url: '/assets/community/source-045.jpg', description: '云迹优先、电话随缘、镜子循环；包含无电话、低灵巧飞机和Boss失败反馈' },
  { id: 'source-046', title: '四本炎与投资人取舍', category: '贴吧高分实战', url: '/assets/community/source-046.jpg', description: '余2道中、老鲤2决战；投资人非硬门槛，保留早期崩线与高阶支援条件' },
  { id: 'source-047', title: '追随者策略与生存转型', category: '贴吧高分实战', url: '/assets/community/source-047.jpg', description: '跨谢、维、萨的过渡讨论，不是固定新阵容；作者战绩与理论换人不作保证' },
  { id: 'source-048', title: '二本大丑阶段与协防补强', category: '贴吧高分实战', url: '/assets/community/source-048.jpg', description: 'R2二本、云迹与异格格雷伊、成型后初雪协防；不屈为条件变体' },
  { id: 'source-049', title: '杜遥夜四本走地炎', category: '贴吧高分实战', url: '/assets/community/source-049.jpg', description: '5~6回合有条件上四、精锐风絮优先；火陈/老鲤与按需升五，层数不等于人数' },
  { id: 'source-050', title: '终极隐秘问答补充：技能与成型条件', category: '贴吧高分实战', url: '/assets/community/source-050.jpg', description: '与009同帖的新抓取，合并可见技能、阿戈尔资源集中与维多利亚条件，不重复建路线' },
  { id: 'source-051', title: '杰西卡精准检索与四本精奥', category: '贴吧高分实战', url: '/assets/community/source-051.jpg', description: '三次策略节点、三碰四与四本收束；远见可选，补地面承压与Boss生存' },
  { id: 'source-052', title: '铁皮构筑纠偏与条件讨论', category: '贴吧高分实战', url: '/assets/community/source-052.jpg', description: '原帖正文与可见评论；条件与争议合并到铁皮路线' },
  { id: 'source-053', title: '三谢精迅雪猎终端', category: '贴吧高分实战', url: '/assets/community/source-053.jpg', description: '雪猎2技能、道中承压与迅捷来源条件，不以伤害样本保证强度' },
  { id: 'iberia-bastion-formula', title: '伊比利亚坚守聚合公式一图流', category: '贴吧高分实战', url: '/assets/community/iberia-bastion-formula.png', description: '三本精锐旅骨海沫、坚守聚合过渡，普通棘刺到引星按高阶来源替换' },
  { id: 'fuzou-leithanien-notes-1', title: '复奏莱塔尼亚构筑笔记·上', category: '贴吧高分实战', url: '/assets/community/fuzou-leithanien-notes-1.png', description: '同篇上页：Ban下位、道中与关底换人、相对站位及叠层搭档；对应复奏一本流的新分支' },
  { id: 'fuzou-leithanien-notes-2', title: '复奏莱塔尼亚构筑笔记·下', category: '贴吧高分实战', url: '/assets/community/fuzou-leithanien-notes-2.png', description: '同篇下页：抓牌与三连优先级、狙击镜分配、R6三本/R9四本及有条件升五；对子阈值原文有歧义' },
  { id: 'endgame-factions-discussion', title: '终极隐藏构筑讨论·正文与跟帖', category: '贴吧高分实战', url: '/assets/community/endgame-factions-discussion.png', description: '复奏/森蚺抓牌、精灵奥莱、双火陈、维多利亚成本及末楼卡西米尔异议；强度比较属作者意见' },
  { id: 'ban-community-notes', title: '盟约Ban与顺势构筑讨论', category: '贴吧高分实战', url: '/assets/community/ban-community-notes.png', description: '精灵奥底层组件与转型经验；强度排名存在评论争议，不作统一评分' },
  { id: 'sargon-nov13-part1', title: '萨尔贡五本精迅分支·上', category: '贴吧高分实战', url: '/assets/community/sargon-nov13-part1.png', description: '同篇连续正文上半；低本保血、五阶核心与六阶候选' },
  { id: 'sargon-nov13-part2', title: '萨尔贡五本精迅分支·下', category: '贴吧高分实战', url: '/assets/community/sargon-nov13-part2.png', description: '四本短停、五本停3~4回合；条件转迅捷与缺核心跳车' },
  { id: 'sargon-early-three', title: '早三萨精准坚守评论分支', category: '贴吧高分实战', url: '/assets/community/sargon-early-three.png', description: '四本霍尔海雅、对子奖励碰佩佩鸿雪；昵称未实名，不强绑策略' },
  { id: 'source-029', title: '贾维分队禁叙保复奏', category: '贴吧高分实战', url: '/assets/community/source-029.jpg', description: 'R1~R13实战，正常Boss通过、隐藏弦未过' },
  { id: 'source-030', title: '杜遥夜灵聚坚炎速四分支', category: '贴吧高分实战', url: '/assets/community/source-030.jpg', description: 'R4三本、R6四本，核心齐后升五；保留速四风险讨论' },
  { id: 'source-031', title: '陈策略伊比利亚迅捷混搭', category: '贴吧高分实战', url: '/assets/community/source-031.jpg', description: '三伊生存骨架与条件迅捷转职' },
  { id: 'source-032', title: '坚守维技能与可选分支', category: '贴吧高分实战', url: '/assets/community/source-032.jpg', description: '同015/018路线：助力可让位输出，奥术可选' },
  { id: 'source-034', title: '二本狙击镜大丑讨论', category: '贴吧高分实战', url: '/assets/community/source-034.jpg', description: '特殊Ban池与射程，PDF底部评论截断' },
  { id: 'source-035', title: '伊比利亚技能与失败反馈', category: '贴吧高分实战', url: '/assets/community/source-035.jpg', description: '旅骨1、普通棘刺2的评论参考与Boss生存争议' },
  { id: 'source-036-1', title: '三本灵巧空弦伊比利亚原帖', category: '贴吧高分实战', url: '/assets/community/source-036-1.jpg', description: 'R3二本、R4三本、R5追低本精锐' },
  { id: 'source-036-2', title: '复数旅骨伊比利亚更新', category: '贴吧高分实战', url: '/assets/community/source-036-2.jpg', description: '约40灵巧转本家，复数旅骨与精准海沫，决战转伊格雷伊' },
  { id: 'fuzou-fast-four', title: '复奏R4升三精奥分支', category: '贴吧高分实战', url: '/assets/community/fuzou-fast-four.png', description: '早升三、碰两次四阶再四本，与原一本久停分开' },
  { id: 'kazimierz-priority', title: '卡西三不屈与保命优先级', category: '贴吧高分实战', url: '/assets/community/kazimierz-priority.png', description: '三不屈优先，瑕光突袭衔接，四本守下限' },
  { id: 'kazimierz-flametail', title: '焰尾卡西策略分支', category: '贴吧高分实战', url: '/assets/community/kazimierz-flametail.png', description: 'R2二本、R3策略找牌为作者经验，不保证出砾' },
  { id: 'eunectes-scopes-update', title: '狙击镜大丑经济上限补充', category: '贴吧高分实战', url: '/assets/community/eunectes-scopes-update.png', description: '远见、奇迹电话、铃兰与投资人的条件分支' },
  { id: 'community-ursus-arcane', title: '乌萨斯奥术输出讨论', category: '贴吧高分实战', url: '/assets/community/ursus-arcane.png', description: '塔露拉与怒潮凛冬输出思路，奥术、前排、治疗及评论分歧' },
  { id: 'community-sargon-discussion', title: '三萨精奥与迅捷分支讨论', category: '贴吧高分实战', url: '/assets/community/sargon-discussion.png', description: '异客衔接佩佩鸿雪，三精三奥主线与飞机、缺核心反例' },
  { id: 'community-yan-slow-six', title: '杜遥夜慢升本六炎补充', category: '贴吧高分实战', url: '/assets/community/yan-slow-six.png', description: '二本云迹、三本风絮、四本华法琳仇白、五本佩佩黍的逐档构筑，非固定回合' },
  { id: 'community-siracusa-precision', title: '裁度叙拉古三本长停原帖', category: '贴吧高分实战', url: '/assets/community/siracusa-precision.png', description: '三本叙拉古精准叠层，8~9回合升四、11~12回合升五的来源参考' },
  { id: 'community-siracusa-bastion', title: '坚守叙拉古原帖与评论', category: '贴吧高分实战', url: '/assets/community/siracusa-bastion.png', description: '罗比菈塔与贝洛内条件路线，包含作者收窄适用范围与Boss输出反例' },
  { id: 'community-yan-double-chen', title: '低本双火陈炎灵巧原帖', category: '贴吧高分实战', url: '/assets/community/yan-double-chen.png', description: '拜松开局、四本灵巧聚合与策略双火陈收束思路' },
  { id: 'community-eunectes-scopes', title: '二本灵巧狙击镜大丑原帖', category: '贴吧高分实战', url: '/assets/community/eunectes-scopes.png', description: '二回合升二，精锐装备成型后补聚合坚守；电话候选受Ban池影响' },
  { id: 'community-gavial', title: '百炼嘉维尔卡西米尔原帖节选', category: '贴吧高分实战', url: '/assets/community/kazimierz-gavial.jpg', description: 'FireShot 017：砾→瑕光→四本玛恩纳，三不屈突袭路线；中期有漏怪风险' },
  { id: 'community-suzuran', title: '铃兰忍冬炎倒转原帖节选', category: '贴吧高分实战', url: '/assets/community/yan-suzuran.jpg', description: 'FireShot 022：忍冬获取收益与三投资人刷新循环，先保战力再升本' },
  { id: 'community-mixer', title: '信仰搅拌机策略说明原图', category: '贴吧高分实战', url: '/assets/community/faith-mixer.jpg', description: 'FireShot 010：献身护卫原文，升本以评论修订及当局经济为准' },
  { id: 'community-kjerag', title: '迅捷谢拉格实战讨论图', category: '贴吧高分实战', url: '/assets/community/kjerag-swift.jpg', description: 'FireShot 009：灵知华法琳谢迅案例，不作为固定站位模板' },
  { id: 'community-iberia-thorns', title: '伊比利亚精准混搭实战图', category: '贴吧高分实战', url: '/assets/community/iberia-thorns.jpg', description: 'FireShot 011：棘刺混搭路线的实战参考' },
  { id: 'community-iberia-bluepoison', title: '伊比利亚蓝毒转职阵容图', category: '贴吧高分实战', url: '/assets/community/iberia-bluepoison.jpg', description: 'FireShot 013：蓝毒、旅骨、流明等七人配置，有转职再扩六伊' },
  { id: 'img-1', title: '乌萨斯森蚺自动沙砾机公式化运营一图流', category: '公式化运营', url: '/assets/aistudio/d9635fc45303d1b6421f720d122f0454_0a1a7ecb.png', description: '森蚺大丑自动杀砾叠不屈与卡西米尔全流程一图流' },
  { id: 'img-2', title: '复奏策略一本流公式化运营一图流（精聚奥莱）', category: '公式化运营', url: '/assets/aistudio/86a0177a75f0c1701ba6cde6a68e36ff_720_96c896a8.png', description: '1-5回合停1本凑对子、6/7回合升3本找霍尔海雅黑键公式化流程' },
  { id: 'img-3', title: '卫戍协议盟约通用叠层干员一图流', category: '盟约全图鉴', url: '/assets/aistudio/e88e3dcc6c1b11c17535b2bd941f2bd4_caa476ba.png', description: '塞雷娅、Mon3tr、华法林、渡桥、魔王、阿米娅、空弦、帕拉斯等13名通用叠层干员详解' },
  { id: 'img-4', title: '九大盟约：叠层/过渡/输出终端全景长图', category: '盟约全图鉴', url: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png', description: '涵盖乌萨斯、伊比利亚、莱塔尼亚、阿戈尔、叙拉古、炎、谢拉格、维多利亚、萨尔贡完整叠层与终端卡' },
  { id: 'img-5', title: '卡西米尔盟约：叠层/过渡/输出终端一图流', category: '盟约全图鉴', url: '/assets/aistudio/e778a8ca1370b949f540e862a04df703_f94c3d19.png', description: '卡西米尔再部署叠层、倒地召唤整备区干员与玛恩纳/耀骑士临光终端详解' },
  { id: 'img-6', title: '荒漠峡谷 I · 仙人掌十字高台（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/e6ef20ce1a0e24dc833771b27d890cf0_d19c05b8.png', description: '十字高台输出朝向与Boss战避开右侧红框站位图' },
  { id: 'img-7', title: '荒漠峡谷 II · 双防空箱反打阵（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/40b87d6939e2f1ed3f4dae195069a21b_720_46dabf65.png', description: '道中左右包夹反打与Boss战中左阶梯口集火站位图' },
  { id: 'img-8', title: '荒漠峡谷 III · 炙热格栅阵地（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/618fe16ca0c3c2f4adbd58d7ae537d62_720_97ed276b.png', description: '道中九宫格护卫与Boss战2x4高台射击矩阵站位图' },
  { id: 'img-9', title: '莱塔尼亚街区 · 庆典气球大道（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/0065fe6f6a1ace53a03ee3a2dcce027d_720_b79d1d68.png', description: '右上重装朝下堵门与Boss战气球花车右侧防线站位图' },
  { id: 'img-10', title: '荒漠峡谷 IV · 断崖沟壑阵地（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/1a3d06a1a8c1014e4b24b86986432911_720_4bdb22c8.png', description: '断崖沟壑两侧高台排布与下路走廊阻挡站位图' },
  { id: 'img-11', title: '谢拉格雪原 · 冰封特种战壕（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/23b1e8cc791af8a2a6018e1fcf00e1c5_976348ed.png', description: '雪原特种格利用与Boss战下路双朝上集火站位图' },
  { id: 'img-12', title: '维多利亚圣堂 I · 金色留声机回廊（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/2373e1a8fd8f99aa62c5fa79c83f07b8_720_147190f9.png', description: '圣堂双坑地形道中左翼抱团与Boss战中心推进站位图' },
  { id: 'img-13', title: '维多利亚圣堂 II · 圣堂雕像中庭（道中+Boss战站位）', category: '站位一图流', url: '/assets/aistudio/dfc3bacf28e45685fac17d1b458d9d2f_720_bdb695b0.png', description: '圣堂中央双雕像两侧交叉火力与第5列4连输出站位图' },
  { id: 'img-14', title: '实战流派：炎坚守聚合（火陈+望+余+仇白）', category: '贴吧高分实战', url: '/assets/aistudio/05e26e934e562dc78febb551ab9c3366_31155c5f.png', description: '坚守聚合过渡，四本找余和仇白，补齐输出与对空' },
  { id: 'img-15', title: '实战流派：维多利亚坚守流（金杰西卡+塞爹）', category: '贴吧高分实战', url: '/assets/aistudio/bd7b9f5af0ce29a4c9b417fb9c80c354_e3603720.png', description: '坚守维多利亚案例；仍需补AOE、对空并检查Boss输出' },
  { id: 'img-16', title: '实战流派：六卡西米尔远牙不屈流', category: '贴吧高分实战', url: '/assets/aistudio/bba35c19e269a4f120602e9edd23f9bc_d0a3c042.png', description: '找完砾找马头，备战席留人触发召唤，远牙射程内狂叠432层' },
  { id: 'img-17', title: '旧版实战图：三谢双冰空弦', category: '贴吧高分实战', url: '/assets/aistudio/99896ed8f4e0e6febfb86823c73e873c_2ab3353f.png', description: '旧图留作站位参考；干员特质与远见阈值以更新后的方案和图鉴为准' },
  { id: 'img-18', title: '实战流派：乌萨斯新手轮椅999层流', category: '贴吧高分实战', url: '/assets/aistudio/df942b1692d631fed4626a916500e23b_f3034bb2.png', description: '打个Boss凭空多出500层直达999层，配迅捷奥术灵巧' },
  { id: 'img-19', title: '实战流派：萨尔贡鸿雪/大姨迅捷流讨论', category: '贴吧高分实战', url: '/assets/aistudio/8f27be849c1e862bb779e60b567e847d_f791bfa6.png', description: '四本碰鸿雪或转六萨迅捷，按发牌与输出缺口调整' },
  { id: 'img-20', title: '实战流派：小盟约王朝 · 神装逻各斯镇楼', category: '贴吧高分实战', url: '/assets/aistudio/f72f386c3d669a3f61f18dae3eb64b33_5b333aaa.png', description: '放弃主盟约专心叠精灵奥远见，天马之翼+双金狙击镜独立乘区' },
  { id: 'img-21', title: '实战流派：杜遥夜炎坚守速4碰5保姆流详解', category: '贴吧高分实战', url: '/assets/aistudio/70dbf3b6311674fef5e99042376a37f0_c4ee8a62.png', description: '余配3坚守2聚合稳道中，后续按来牌与经济补输出' },
  { id: 'img-22', title: '附加盟约全图鉴 I（聚合/坚守/助力/远见/奇迹/投资人/协防/调和）', category: '盟约全图鉴', url: '/assets/aistudio/image_7fa89991.png', description: '八大功能与生存附加盟约机制、全阶干员与叠层评级长图' },
  { id: 'img-23', title: '附加盟约全图鉴 II（精准/迅捷/灵巧/奥术/突袭/不屈）', category: '盟约全图鉴', url: '/assets/aistudio/image_babfd902.png', description: '六大输出与爆发附加盟约机制、全阶干员与叠层评级长图' },
  { id: 'img-24', title: '局内核心盟约/附加盟约/干员 Ban 选面板实战截图', category: '盟约全图鉴', url: '/assets/aistudio/e540b6bc8f2cdd41866ef02d4a9d7c33_263d6fd8.png', description: '展示局内核心盟约、附加盟约与禁用干员的Ban选状态及敌方领袖信息' },
];

// ---------------------------------------------------------------------------
// 5. 14 SUB-COVENANTS ENCYCLOPEDIA (附加盟约图鉴 - From image_7fa89991 & image_babfd902)
// ---------------------------------------------------------------------------
export const SUB_COVENANT_GUIDES: CovenantGuide[] = [
  {
    id: 'sub-convergence',
    name: '聚合盟约 (Convergence)',
    subtitle: '两人激活 · 攻击范围内持续恢复；三人增加庇护',
    stackCore: '按实际攻击范围覆盖输出和前排；抗不住时再补三聚合。',
    pactSummary: '聚合干员在攻击范围内为友方持续回复生命值与元素损伤；在场三名聚合干员增加范围内友方的庇护。效果随盟约层数提升。',
    synergySubPacts: ['坚守', '奥术', '炎', '莱塔尼亚'],
    difficulty: '功能神羁绊',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '波登可', tier: 'II', category: '辅助/过渡', effect: '二阶辅助，前期低费凑2聚合过渡' },
      { name: '风絮', tier: 'III', category: '前中期叠层', effect: '三阶医疗，同时具备【炎】与【聚合】标签，每回合获得干员叠层' },
      { name: '流明', tier: 'IV', category: '前中期叠层', effect: '战后按存活人数叠伊比利亚和聚合。' },
      { name: '余', tier: 'IV', category: '前中期叠层', effect: '四阶重装，集齐【炎】【坚守】【聚合】三大神级词条于一身' },
      { name: '薇薇安娜', tier: 'V', category: '后期叠层', effect: '五阶近卫，击倒敌人叠加【莱塔尼亚】与【聚合】层数（打茧Boss必带）' },
      { name: '纯烬艾雅法拉', tier: 'V', category: '后期叠层', effect: '五阶顶尖治疗（推荐2技能），大范围恢复并凑齐高阶莱塔尼亚+聚合' },
      { name: '黍', tier: 'V', category: '本家输出终端', effect: '五阶护佑者，元素损伤爆发叠层并承接全队聚合阻挡' },
    ],
    proTips: [
      '隐秘战前先看是否能扛住首轮伤害；有聚合仍需安排阻挡、治疗与实际清怪位。',
    ],
  },
  {
    id: 'sub-bastion',
    name: '坚守盟约 (Bastion)',
    subtitle: '激活人数 2/3/4 · 随层数提供全队巨额防御/生命与固定减伤',
    stackCore: '涤火杰西卡按装备人数叠层，塞雷娅复制；炎队用余的元素爆发补层。',
    pactSummary: '随盟约层数提升全队防御力与生命值，达到指定层数后额外获得固定数值减伤，是维多利亚坚守流与炎坚守流的绝对核心。',
    synergySubPacts: ['维多利亚', '炎', '聚合', '灵巧'],
    difficulty: '新手轮椅',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '拜松', tier: 'I', category: '辅助/过渡', effect: '一阶重装，炎与坚守过渡前排' },
      { name: '泡泡', tier: 'II', category: '前中期叠层', effect: '<战斗中>每次开启技能时使已激活的【萨尔贡】【坚守】层数+2/4' },
      { name: '蛇屠箱', tier: 'II', category: '前中期叠层', effect: '<战斗中>阻挡敌人时叠加【坚守】层数，前期抗压极强' },
      { name: '涤火杰西卡', tier: 'IV', category: '后期叠层', effect: '<休整期结束时>每有一名带装备的在场干员，【维多利亚】【坚守】层数+2/4' },
      { name: '余', tier: 'IV', category: '后期叠层', effect: '<战斗中>周围八格敌人触发元素爆发时，叠自身已激活的盟约' },
      { name: '塞雷娅', tier: 'V', category: '后期叠层', effect: '复制身前一格干员的“休整期结束时”特质，可对准涤火杰西卡或风絮' },
    ],
    proTips: [
      '精奥受限可用三坚守保场，涤火杰西卡到位再铺装备。四本不能直购塞雷娅；缺伤害或对空时优先补战力。',
    ],
  },
  {
    id: 'sub-assist',
    name: '助力盟约 (Assist)',
    subtitle: '两人激活 · 全队防御、再部署与休整叠层',
    stackCore: '两名助力休整结束给所有已激活盟约叠2层，三名不同助力改为4层。',
    pactSummary: '所有干员防御提高，再部署时间缩短30%。休整结束额外叠加当前已激活的盟约。',
    synergySubPacts: ['坚守', '维多利亚', '阿戈尔'],
    difficulty: '辅助续航',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '野鬃', tier: 'I', category: '辅助/过渡', effect: '一阶先锋，卡西米尔与助力双标签开局卡' },
      { name: '安哲拉', tier: 'II', category: '前中期叠层', effect: '<战斗中>每击倒一名敌人或我方干员使【阿戈尔】【助力】+3/6' },
      { name: '罗比菈塔', tier: 'III', category: '辅助/过渡', effect: '三阶工匠，提供护盾装置与【坚守】【助力】过渡' },
      { name: '白铁', tier: 'IV', category: '辅助/过渡', effect: '四阶工匠，在维多利亚队中兼顾产装置与开助力' },
      { name: '淬羽赫默', tier: 'IV', category: '后期叠层', effect: '<休整期结束时>使整备区每名干员已激活的盟约层数+2/4' },
    ],
    proTips: [
      '前期可用安哲拉/野鬃+罗比菈塔过渡，中期抓淬羽赫默给整备区挂件群体叠层',
    ],
  },
  {
    id: 'sub-foresight',
    name: '远见盟约 (Foresight)',
    subtitle: '两人激活 · 80层与150层降低远见干员购买价',
    stackCore: '已有空弦与渡桥时面对面互指 + 星源/夏栎整备区叠最高盟约',
    pactSummary: '整备区远见也计入人数。每10层获得2资金；首次达到80层和150层时，远见干员各永久减1费。',
    synergySubPacts: ['精准', '灵巧', '奥术', '奇迹'],
    difficulty: '分奴必挂',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '地灵', tier: 'I', category: '前中期叠层', effect: '一阶辅助，莱塔尼亚与远见双标签开局卡' },
      { name: '夏栎', tier: 'I', category: '辅助/过渡', effect: '<休整期结束时>使层数最多的盟约+2（整备区生效）' },
      { name: '渡桥', tier: 'II', category: '前中期叠层', effect: '<休整期结束时>使自身与身前一格干员已激活的盟约+2/4' },
      { name: '星源', tier: 'II', category: '前中期叠层', effect: '<休整期结束时>使当前已激活且层数最多的盟约层数+4/8（整备区生效）' },
      { name: '空弦', tier: 'III', category: '后期叠层', effect: '<进入休整期时>使自身与身前一格干员已激活的盟约+3/6' },
      { name: '寒檀', tier: 'IV', category: '后期叠层', effect: '<休整期开始及结束时>使已激活的【远见】层数+3/6' },
      { name: '溯光星源', tier: 'V', category: '本家输出终端', effect: '五阶高台核心，吃满高远见层数提供强力输出与支援' },
    ],
    proTips: [
      '杰西卡已有空弦与渡桥时可面对面互指；051将远见视为来牌好的经济分支，主线可围绕精准检索。层数与指定核心不保证，逻各斯六阶须实际取得。',
    ],
  },
  {
    id: 'sub-miracle',
    name: '奇迹盟约 (Miracle)',
    subtitle: '激活人数 2/3 · 整备区可直接激活！云迹上场每回合白送免费刷新',
    stackCore: '云迹（必须上场送1/2次刷新） + 复奏/矩/吉星（放整备区凑2奇迹）',
    pactSummary: '唯一全员可在【整备区】直接激活的特殊盟约！周期性触发奇迹随机支援与经济/战斗加成。',
    synergySubPacts: ['远见', '精准', '奥术', '莱塔尼亚'],
    difficulty: '经济核心',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '云迹', tier: 'II', category: '前中期叠层', effect: '【必须上场】<进入休整期时>获得1/2次免费刷新（整备区不生效，可上两个云迹）' },
      { name: '复奏', tier: 'II', category: '辅助/过渡', effect: '二阶莱塔尼亚+奇迹干员，放整备区配合场上的云迹即可凑齐2奇迹' },
      { name: '矩', tier: 'II', category: '辅助/过渡', effect: '二阶叙拉古+奇迹干员，整备区直接激活奇迹盟约' },
      { name: '吉星', tier: 'III', category: '辅助/过渡', effect: '三阶狙击，兼具奇迹与输出过渡' },
      { name: '维娜·维多利亚', tier: 'V', category: '后期叠层', effect: '五阶近卫，按场上不同阶维多利亚干员数叠加【维多利亚】【奇迹】' },
      { name: '缪尔赛思', tier: 'VI', category: '后期叠层', effect: '【六本转职真神】获得时免费送【变形同构体】！' },
    ],
    proTips: [
      '【复奏】和【矩】放在整备区就能激活2奇迹，千万不要卖掉！场上只需挂【云迹】白嫖每回合免费刷新，Boss战再把云迹换下',
    ],
  },
  {
    id: 'sub-investor',
    name: '投资人盟约 (Investor)',
    subtitle: '激活人数 2/3 · 休整期额外资金与刷新经济收益',
    stackCore: '折桠/杰克1本过渡 + 老鲤/鸿雪5本高爆发主C',
    pactSummary: '围绕休整期资金运作、利息与商店刷新收益的经济型附加盟约，帮助快速升本或搜齐高阶金卡。',
    synergySubPacts: ['萨尔贡', '炎', '精准'],
    difficulty: '经济运营',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '杰克', tier: 'I', category: '辅助/过渡', effect: '一阶近卫，1本凑对子三合一常用卡' },
      { name: '褐果', tier: 'I', category: '辅助/过渡', effect: '一阶元素医疗，维多利亚与前期过渡' },
      { name: '乌有', tier: 'III', category: '辅助/过渡', effect: '三阶特种，炎盟约与投资人过渡' },
      { name: '老鲤', tier: 'V', category: '本家输出终端', effect: '五阶特种，【炎】【投资人】每叠加3层攻击力+1%/2%' },
      { name: '可露希尔', tier: 'V', category: '后期叠层', effect: '五阶商店与经济支援核心' },
      { name: '鸿雪', tier: 'V', category: '本家输出终端', effect: '五阶狙击，萨尔贡与精准高破甲打字机点杀Boss' },
    ],
    proTips: [
      '复奏策略一本流在1~5回合优先抓1阶对子触发二重奏双倍三选一奖励',
    ],
  },
  {
    id: 'sub-defense-support',
    name: '协防干员 (Defense Support)',
    subtitle: '激活人数 1/2 · 机械与精英协防单位（暴躁铁皮/初雪/机械师）',
    stackCore: '暴躁铁皮（五本协防大C，自动沙砾机与同构体转职核心）',
    pactSummary: '特殊机械/精英协防单位盟约，提供强力的独立作战或再部署爆破能力。',
    synergySubPacts: ['精准', '灵巧', '奥术', '不屈'],
    difficulty: '大丑核心',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '初雪', tier: 'III', category: '辅助/过渡', effect: '攻击范围内的敌人进入冻结时叠谢拉格，摆位优先覆盖冻结区' },
      { name: '暴躁铁皮', tier: 'V', category: '本家输出终端', effect: '【五本大丑核心】配自动武装献祭砾刷不屈，或贴变形同构体继承精灵奥莱化身核弹' },
      { name: '机械师', tier: 'VI', category: '本家输出终端', effect: '六阶顶尖协防终端，高额机械火力支援' },
    ],
    proTips: [
      '【暴躁铁皮(V)】既能在森蚺沙砾机中配自动武装无限杀砾，也能在莱塔尼亚/精灵奥体系中贴变形同构体12回合狂兜125怪！',
    ],
  },
  {
    id: 'sub-harmony',
    name: '调和盟约 (Harmony)',
    subtitle: '激活人数 2/3 · 按已激活盟约数量提供全队高额攻防与生命加成',
    stackCore: 'Pith特勤策略 + 魔王（核心盟约人数+1） + 炎/维/灵/坚/聚五系同开',
    pactSummary: '根据目前已激活的不同盟约数量（每个已激活盟约计1层，核心盟约达到最高级时额外计2层）提供全队高额攻防与生命加成！',
    synergySubPacts: ['炎', '维多利亚', '灵巧', '坚守'],
    difficulty: '多羁绊焚诀',
    imageUrl: '/assets/aistudio/image_7fa89991.png',
    operators: [
      { name: '哈洛德', tier: 'II', category: '前中期叠层', effect: '二阶医疗，维多利亚与调和过渡核心（适合挂伪装服/聚合箱/护盾无人机）' },
      { name: 'Pith', tier: 'III', category: '前中期叠层', effect: '三阶精英术师，调和与奥术过渡' },
      { name: '阿米娅', tier: 'V', category: '后期叠层', effect: '五阶核心，使身前一格干员每次提升盟约层数额外+2（无视上限）' },
      { name: '魔王', tier: 'VI', category: '本家输出终端', effect: '【调和真神】使核心盟约人数+1，且休整期结束时使已激活核心盟约+20层！' },
    ],
    proTips: [
      '配合Pith策略走【调和灵巧炎维流】，魔王上场凑调和并让核心盟约+20层，塔露拉/烛煌拿维式重锤直接清屏',
    ],
  },
  {
    id: 'sub-precision',
    name: '精准盟约 (Precision)',
    subtitle: '激活人数 2/3/4 · 随层数大幅提升攻击力与高倍率暴击伤害',
    stackCore: '空弦休整期身前对射(+6/12层) + 霍尔海雅1技能高频控制叠层',
    pactSummary: '随盟约层数大幅提升干员攻击力，并在攻击时概率触发高倍率暴击伤害，是【杰西卡精奥远分奴流】与【精聚奥莱】的第一主属性！',
    synergySubPacts: ['奥术', '远见', '灵巧', '莱塔尼亚'],
    difficulty: '爆杀核心',
    imageUrl: '/assets/aistudio/image_babfd902.png',
    operators: [
      { name: '灰喉', tier: 'I', category: '前中期叠层', effect: '一阶狙击，可作杰西卡精准检索目标与过渡；按对子和地面压力取舍' },
      { name: '蓝毒', tier: 'II', category: '前中期叠层', effect: '二阶狙击，多目标高频攻击过渡' },
      { name: '雪猎', tier: 'II', category: '前中期叠层', effect: '<获得时>使【谢拉格】【精准】层数+4/8' },
      { name: '空弦', tier: 'III', category: '前中期叠层', effect: '【对射核心·换1技能】<进入休整期时>使自身与身前干员所有盟约+6/12！按实际来牌与策略候选选择，不保证指定命中' },
      { name: '旅骨', tier: 'III', category: '前中期叠层', effect: '三阶伊比利亚+精准干员，休整期按身前干员售价2倍叠层' },
      { name: '霍尔海雅', tier: 'IV', category: '后期叠层', effect: '【四本真神·换1技能】攻击范围内击倒/控制敌人高速狂叠【莱塔尼亚】【精准】【奥术】' },
      { name: '远牙', tier: 'IV', category: '后期叠层', effect: '四阶狙击，射程内友方再部署减CD并享受精准暴击' },
      { name: '迷迭香', tier: 'V', category: '本家输出终端', effect: '五阶投掷手，高精准下余震物理爆杀极强' },
      { name: '鸿雪', tier: 'V', category: '本家输出终端', effect: '五阶狙击，高精准下打字机破甲秒杀Boss（精奥远蹭萨尔贡首选）' },
      { name: '蕾缪安', tier: 'VI', category: '本家输出终端', effect: '六阶精准大C，超远距离锁头狙杀' },
      { name: '维什戴尔', tier: 'VI', category: '本家输出终端', effect: '【自选第一梯队·带2技能】高精准下维什戴尔2技能吃拐率极其恐怖！' },
    ],
    proTips: [
      '杰西卡051主线用R4/R7/R10策略补精准与对子，三本碰四、四本可收束。三精准不保证锁血，必须补地面、减伤与治疗；远见和高阶输出按来牌选择。',
    ],
  },
  {
    id: 'sub-swift',
    name: '迅捷盟约 (Swift)',
    subtitle: '两人激活 · 技能结束时有概率回复技力',
    stackCore: '伊桑群绑叠层 + 乌啾击杀叠层 + 乌萨斯/萨尔贡/伊比利亚联动',
    pactSummary: '迅捷干员技能结束时有概率立刻回技力；层数提高概率，40层后所有干员也有额外回技力的机会。',
    synergySubPacts: ['萨尔贡', '乌萨斯', '伊比利亚', '卡西米尔'],
    difficulty: '技能回转',
    imageUrl: '/assets/aistudio/image_babfd902.png',
    operators: [
      { name: '伊桑', tier: 'III', category: '前中期叠层', effect: '三阶地刺，大范围多目标攻击高频触发迅捷叠层' },
      { name: '乌啾', tier: 'III', category: '前中期叠层', effect: '<战斗中>攻击范围内每有一名敌人被击倒使【乌萨斯】【迅捷】+1/2' },
      { name: '焰尾', tier: 'V', category: '后期叠层', effect: '<休整期结束时>整备区每有一名干员，使【卡西米尔】【迅捷】+1/2' },
      { name: '佩佩', tier: 'V', category: '后期叠层', effect: '五阶萨尔贡核心，眩晕周围敌人或自身时使自身与身后干员盟约+9/18' },
      { name: '引星棘刺', tier: 'VI', category: '本家输出终端', effect: '六阶炼金师，休整期直加12/24层【伊比利亚】【迅捷】' },
    ],
    proTips: [
      '迅捷有回转价值，伤害、对空与生存仍由实战决定。精奥受限时先核对能否取得实际输出位。',
    ],
  },
  {
    id: 'sub-dexterous',
    name: '灵巧盟约 (Dexterous)',
    subtitle: '两人激活 · 提升自身及周围干员攻击速度',
    stackCore: '低本用云迹开技能叠层，中期华法琳对准仇白、水月或水灯心等受益位。',
    pactSummary: '灵巧干员及周围四格单位获得攻速。达到40层后，覆盖扩大到周围八格。',
    synergySubPacts: ['炎', '奥术', '阿戈尔', '谢拉格'],
    difficulty: '攻速与回转',
    imageUrl: '/assets/aistudio/image_babfd902.png',
    operators: [
      { name: '承曦格雷伊', tier: 'II', category: '辅助/过渡', effect: '<获得时>得精准狙击镜；装备手套与不融冰可用于机械师控场' },
      { name: '凛御银灰', tier: 'V', category: '后期叠层', effect: '<战斗中>身前一格【谢拉格】【灵巧】干员每场战斗叠层上限+75%/150%' },
      { name: '水月', tier: 'IV', category: '辅助/过渡', effect: '阿戈尔与灵巧输出，配另一名灵巧激活攻速' },
      { name: '华法琳', tier: 'IV', category: '前中期叠层', effect: '【技能拐核心】<战斗开始时>使身前干员每次开启技能时所有盟约层数+2（上限14）' },
      { name: '仇白', tier: 'IV', category: '后期叠层', effect: '【炎灵聚核心】配合华法琳或余高频触发技能狂叠【炎】与【灵巧】层数' },
      { name: '冻河', tier: 'V', category: '后期叠层', effect: '五阶乌萨斯+灵巧高台，精奥远蹭乌萨斯大盟约优质组件' },
      { name: '帕拉斯', tier: 'VI', category: '后期叠层', effect: '【休整+18/36层】<休整期结束时>使自身和身前干员的所有盟约层数+18/36！' },
    ],
    proTips: [
      '精准、奥术受限时，可看灵巧聚合炎、灵巧坚守维或水月灵巧阿戈尔。灵巧也受限就另找攻速或转阵。',
      '攻速要看技能机制。双镜雪猎如果频繁换弹，优先保证技能回转，可将高攻速支援移给其他干员。',
    ],
  },
  {
    id: 'sub-arcane',
    name: '奥术盟约 (Arcane)',
    subtitle: '激活人数 2/3/4 · 随层数提供高额法术伤害与无视法抗穿透',
    stackCore: '霍尔海雅(1技能)+黑键(2技能)+艾雅法拉(3技能)中期猛叠 · 逻各斯后期收割',
    pactSummary: '随盟约层数提供高额法术伤害加成与法术穿透（无视法抗），是【精奥远】、【奥术坚守维】与【莱塔尼亚】的核心法伤乘区。',
    synergySubPacts: ['精准', '远见', '莱塔尼亚', '维多利亚'],
    difficulty: '法伤乘区',
    imageUrl: '/assets/aistudio/image_babfd902.png',
    operators: [
      { name: '慕斯', tier: 'I', category: '前中期叠层', effect: '一阶近卫，维多利亚与奥术双标签，休整期自动叠层' },
      { name: '卡达', tier: 'I', category: '前中期叠层', effect: '一阶浮游术师，奥术坚守维1本开局过渡卡' },
      { name: 'Miss.Christine', tier: 'II', category: '前中期叠层', effect: '<休整期结束时>使已激活的【维多利亚】【奥术】层数+3/6（适合挂火锤）' },
      { name: '霍尔海雅', tier: 'IV', category: '后期叠层', effect: '【四本真神·换1技能】精奥远与奥术坚守维必拿，同时叠精准/奥术/莱塔尼亚' },
      { name: '黑键', tier: 'IV', category: '后期叠层', effect: '【四本核心·换2技能】莱塔尼亚与奥术每叠加1~2层提升攻速技力与攻击力' },
      { name: '艾雅法拉', tier: 'IV', category: '本家输出终端', effect: '【四本法术大C·换3技能】有莱塔尼亚与奥术时道中与Boss战输出极高' },
      { name: '维伊', tier: 'IV', category: '后期叠层', effect: '四阶乌萨斯+奥术核心，精奥远后期蹭乌萨斯大盟约必抓' },
      { name: '异客', tier: 'IV', category: '后期叠层', effect: '四阶萨尔贡+奥术核心，精奥远后期蹭萨尔贡大盟约必抓' },
      { name: '逻各斯', tier: 'VI', category: '本家输出终端', effect: '【六本法术天花板】特质将远见+奥术层数直接转化为恐怖战力！' },
    ],
    proTips: [
      '设计师在逻各斯身上写了“远见+奥术层数转战力”，配合杰西卡200+层远见与几百层奥术，逻各斯就是当之无愧的第一梯队输出终端！',
    ],
  },
  {
    id: 'sub-assault',
    name: '突袭盟约 (Assault)',
    subtitle: '激活人数 2/3/4 · 部署后短时间内获得爆发性攻击与伤害加成',
    stackCore: '历阵锐枪芬/奥尔佳高频部署叠层 + 耀骑士临光空降真伤（突袭卡变阵核心）',
    pactSummary: '部署后短时间内获得爆发性攻击力与伤害加成，精奥远全被Ban时可直接玩【突袭卡（突袭+卡西米尔）】！',
    synergySubPacts: ['卡西米尔', '乌萨斯', '不屈'],
    difficulty: '空降爆发',
    imageUrl: '/assets/aistudio/image_babfd902.png',
    operators: [
      { name: '星极', tier: 'II', category: '辅助/过渡', effect: '二阶近卫，前期近战法伤过渡' },
      { name: '历阵锐枪芬', tier: 'III', category: '前中期叠层', effect: '<战斗中>部署时使自身已激活的【卡西米尔】【突袭】层数+3/6' },
      { name: '奥尔佳', tier: 'III', category: '前中期叠层', effect: '<战斗中>部署时使已激活的【乌萨斯】【突袭】层数+4/8' },
      { name: '赫德雷', tier: 'IV', category: '前中期叠层', effect: '四阶重剑手，高额物理爆发与控制' },
      { name: '耀骑士临光', tier: 'VI', category: '本家输出终端', effect: '【突袭卡终端】被击倒召唤整备区最右侧卡西米尔/突袭上场并使双方盟约+6/12' },
    ],
    proTips: [
      '精奥远全被Ban时的爽快备选【突袭卡】：利用历阵锐枪芬+砾+远牙无限减再部署CD，配合耀骑士临光6卡西米尔65%真伤砍翻Boss！',
    ],
  },
  {
    id: 'sub-unyielding',
    name: '不屈盟约 (Unyielding)',
    subtitle: '激活人数 2/3/4 · 生命值越低或触发倒地/锁血时获得巨额攻防与护盾',
    stackCore: '折桠1本 + 砾2本 + 暴躁铁皮自动武装反复献祭砾（每场+24层不屈）',
    pactSummary: '干员生命值越低或触发倒地/锁血时获得巨额攻防加成与护盾，是【乌萨斯森蚺自动沙砾机】与【卡西米尔献祭流】的黄金搭档！',
    synergySubPacts: ['卡西米尔', '乌萨斯', '协防干员'],
    difficulty: '献祭战神',
    imageUrl: '/assets/aistudio/image_babfd902.png',
    operators: [
      { name: '折桠', tier: 'I', category: '前中期叠层', effect: '一阶萨尔贡+不屈干员，自动沙砾机1本必拿开局卡' },
      { name: '幽灵鲨', tier: 'I', category: '前中期叠层', effect: '一阶阿戈尔+不屈干员，锁血抗线过渡' },
      { name: '砾', tier: 'II', category: '前中期叠层', effect: '【沙砾机核心】<战斗中>部署时使【卡西米尔】【不屈】+2/4（每场至多12/24层）' },
      { name: '斥罪', tier: 'IV', category: '后期叠层', effect: '四阶叙拉古+不屈重装，护盾反伤单守一路' },
      { name: '森蚺', tier: 'IV', category: '后期叠层', effect: '四阶萨尔贡+不屈重装，高额面板配合大丑统治前排' },
      { name: '玛恩纳', tier: 'IV', category: '本家输出终端', effect: '四阶卡西米尔大C，贴不屈弹射器转职吃满不屈+卡西米尔双乘区' },
      { name: '史尔特尔', tier: 'VI', category: '本家输出终端', effect: '六阶锁血真神，黄昏清场与不屈完美契合' },
    ],
    proTips: [
      '在森蚺自动沙砾机中，给【暴躁铁皮(V)】装【自动武装】每次部署自动击杀身前【砾(II)】，可同时把卡西米尔与不屈叠上天！',
    ],
  },
];


// ---------------------------------------------------------------------------
// 6. BAN / PICK CONSTANTS (From Image 3: e540b6bc8f2cdd41866ef02d4a9d7c33_263d6fd8.png)
// ---------------------------------------------------------------------------
export const ALL_CORE_COVENANT_NAMES = [
  '炎',
  '萨尔贡',
  '阿戈尔',
  '叙拉古',
  '卡西米尔',
  '维多利亚',
  '谢拉格',
  '乌萨斯',
  '伊比利亚',
  '莱塔尼亚',
] as const;

export const ALL_SUB_COVENANT_NAMES = [
  // Row 1 (10 sub-covenants)
  '精准',
  '远见',
  '投资人',
  '突袭',
  '不屈',
  '调和',
  '协防干员',
  '独行',
  '绝技',
  '聚合',
  // Row 2 (6 sub-covenants)
  '奥术',
  '迅捷',
  '灵巧',
  '坚守',
  '助力',
  '奇迹',
] as const;

export const BAN_SENSITIVE_OPERATORS = [
  { name: '克莱门莎', role: '阿戈尔侵蚀终端' },
  { name: '安哲拉', role: '阿戈尔低本叠层' },
  { name: '风絮', role: '四本炎获取叠层' },
  { name: '承曦格雷伊', role: '低本狙击镜与机械师控场' },
  { name: '雪猎', role: '精迅谢拉格输出' },
  { name: '耶拉', role: '谢拉格不融冰来源' },
  { name: '初雪', role: '冻结叠谢拉格' },
  { name: '复奏', role: '贾维复奏循环' },
  { name: '黑键', role: '精奥莱输出与叠层' },
  { name: '纯烬艾雅法拉', role: '治疗与莱塔尼亚补强' },
  { name: '海沫', role: '伊比利亚生存底座' },
  { name: '温蒂', role: '伊比利亚站场' },
  { name: '青枳', role: '迅捷叠层' },
  { name: '黍', role: '高阶炎补强' },
  { name: '可露希尔', role: '忍冬经济支援' },
  { name: '风丸', role: '卡西不屈过渡' },
  { name: '圣聆初雪', role: '谢拉格高阶支援' },
  { name: '塔露拉', role: '乌萨斯奥术与炎终端' },
  { name: '怒潮凛冬', role: '乌萨斯输出与回转支援' },
  { name: '异客', role: '萨奥经济与过渡' },
  { name: '佩佩', role: '萨尔贡灵巧叠层' },
  { name: '鸿雪', role: '萨尔贡精准核心' },
  { name: '伺夜', role: '叙拉古刷新叠层' },
  { name: '贝洛内', role: '叙拉古终端' },
  { name: '罗比菈塔', role: '坚守与助力底座' },
  { name: '荒芜拉普兰德', role: '叙拉古高阶补强' },
  { name: '赤刃明霄陈', role: '火陈自选外援' },
  { name: '假日威龙陈', role: '狙击外援' },
  { name: '仇白', role: '炎灵巧叠层' },
  { name: '云迹', role: '低本灵巧与奇迹' },
  { name: '霍尔海雅', role: '精准/奥术叠层核心' },
  { name: '暴躁铁皮', role: '大丑核心主C' },
  { name: '缪尔赛思', role: '六本同构体转职' },
  { name: '涤火杰西卡', role: '维多利亚坚守核心' },
  { name: '余', role: '炎/坚守阻挡爆条' },
  { name: '烛煌', role: '炎/维多利亚重锤主C' },
  { name: '砾', role: '沙砾机/卡西米尔核心' },
  { name: '空弦', role: '精准/对射叠层' },
  { name: '渡桥', role: '远见/4t寻呼核心' },
  { name: '寒檀', role: '四阶远见经济' },
  { name: '塞雷娅', role: '休整期特异化复制' },
  { name: '华法琳', role: '开技能叠层核心' },
  { name: '灵知', role: '迅捷谢输出核心' },
  { name: '蓝毒', role: '伊比利亚主C' },
  { name: '旅骨', role: '伊比利亚售价叠层' },
  { name: '流明', role: '聚合治疗与存活叠层' },
  { name: '棘刺', role: '伊比利亚精准终端' },
  { name: '瑕光', role: '卡西不屈回转衔接' },
  { name: '玛恩纳', role: '卡西不屈突袭主C' },
  { name: '忍冬', role: '铃兰策略刷新循环核心' },
  { name: '白铁', role: '坚守助力维装备与输出' },
  { name: '水灯心', role: '维多利亚灵巧输出' },
] as const;

export const COVENANT_SHORT_DESCRIPTIONS: Record<string, string> = {
  // 10 Core Covenants
  炎: '灼燃爆条·烛煌余',
  萨尔贡: '技能叠层·异客佩佩',
  维多利亚: '穿装叠层·重锤杰西卡',
  阿戈尔: '深海猎人·红蒂克莱',
  叙拉古: '刷新叠层·伺夜荒拉',
  谢拉格: '不融冰控场·初雪叠层',
  卡西米尔: '再部署叠·倒地召唤',
  乌萨斯: '击杀叠层·休整转固',
  伊比利亚: '身价翻倍·旅骨流明',
  莱塔尼亚: '高台法伤·黑键法羊',
  // 16 Sub-Covenants
  迅捷: '技能结束返还技力',
  灵巧: '提升附近干员攻速',
  坚守: '防御生命+固减伤',
  远见: '80/150层远见买牌减费',
  奇迹: '整备区激活+刷新',
  投资人: '休整经济与利息',
  不屈: '低血倒地高额护盾',
  调和: '核心盟约人数+1',
  协防干员: '大丑/初雪/机械师',
  独行: '独立作战强化',
  绝技: '技能周期爆发',
  精准: '攻击提升+高暴击',
  助力: '治疗护盾与增益',
  突袭: '空降部署爆发伤',
  聚合: '范围内恢复生命与元素损伤',
  奥术: '法伤提升+无视法抗',
};

// ---------------------------------------------------------------------------
// 7. 18 TRANSFER / JOB-CHANGE SYNTHESIS RECIPES (新卫戍协议转职一览)
// ---------------------------------------------------------------------------
export interface TransferItemRecipe {
  id: string;
  category: '核心盟约转职' | '附加盟约转职';
  isNew?: boolean;
  baseEquipmentName: string;
  equipmentTier: 'I' | 'II' | 'III' | 'IV';
  targetCovenant: string;
  freeSourceOperators: string[];
  bestRecipients: string[];
  tacticalNote: string;
}

export const TRANSFER_ITEM_RECIPES: TransferItemRecipe[] = [
  // ==================== Part 1: 5 Core Covenants (Image 2) ====================
  {
    id: 'trans-ursus',
    category: '核心盟约转职',
    isNew: true,
    baseEquipmentName: '乌萨斯呼吸器',
    equipmentTier: 'III',
    targetCovenant: '乌萨斯',
    freeSourceOperators: ['怒潮凛冬'],
    bestRecipients: ['暴躁铁皮', '玛恩纳', '史尔特尔'],
    tacticalNote: '新增转职！配合变形同构体让大丑或玛恩纳直接吃满999层乌萨斯巨额面板。',
  },
  {
    id: 'trans-iberia',
    category: '核心盟约转职',
    isNew: true,
    baseEquipmentName: '伊比利亚骨刺刀',
    equipmentTier: 'III',
    targetCovenant: '伊比利亚',
    freeSourceOperators: ['温蒂', '旅骨'],
    bestRecipients: ['史尔特尔', '逻各斯', '烛煌'],
    tacticalNote: '新增转职！合成后使外援大C融入伊比利亚高身价叠层体系。',
  },
  {
    id: 'trans-leithanien',
    category: '核心盟约转职',
    isNew: true,
    baseEquipmentName: '莱塔尼亚小鼓',
    equipmentTier: 'IV',
    targetCovenant: '莱塔尼亚',
    freeSourceOperators: ['车尔尼'],
    bestRecipients: ['霍尔海雅', '空弦', '暴躁铁皮', '塞雷娅'],
    tacticalNote: '新增版本T0转职！抓车尔尼白送2件小鼓，优先合给【霍尔海雅】和【空弦】或【暴躁铁皮】凑齐6莱塔尼亚！',
  },
  {
    id: 'trans-yan',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '炎国短刀',
    equipmentTier: 'III',
    targetCovenant: '炎',
    freeSourceOperators: ['砾', '风絮'],
    bestRecipients: ['涤火杰西卡', '塞雷娅', '暴躁铁皮'],
    tacticalNote: '抓砾白送炎国短刀，在炎维或炎坚守体系中可贴给涤火杰西卡/塞雷娅凑高炎盟约。',
  },
  {
    id: 'trans-sargon',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '萨尔贡浓茶',
    equipmentTier: 'II',
    targetCovenant: '萨尔贡',
    freeSourceOperators: ['至简'],
    bestRecipients: ['霍尔海雅', '玛恩纳', '艾雅法拉'],
    tacticalNote: '二阶低门槛底材，在萨尔贡异客/佩佩/鸿雪体系中给外援补齐6萨尔贡。',
  },

  // ==================== Part 2: 5 Core Covenants (Image 3) ====================
  {
    id: 'trans-victoria',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '维式重锤',
    equipmentTier: 'I',
    targetCovenant: '维多利亚',
    freeSourceOperators: ['凯瑟琳', '维娜·维多利亚'],
    bestRecipients: ['烛煌', '塔露拉', '余', '塞雷娅'],
    tacticalNote: 'Pith炎维与奥术坚守维核心！1阶商店或抓凯瑟琳即得，合给主C吃满维多利亚与坚守加成！',
  },
  {
    id: 'trans-kjerag',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '谢拉格不融冰',
    equipmentTier: 'IV',
    targetCovenant: '谢拉格',
    freeSourceOperators: ['耶拉', '寒檀'],
    bestRecipients: ['空弦', '霍尔海雅', '逻各斯'],
    tacticalNote: '耶拉获得时给不融冰，可给格雷伊或空弦控场，也可用于谢拉格转职。',
  },
  {
    id: 'trans-aegir',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '阿戈尔重刃',
    equipmentTier: 'III',
    targetCovenant: '阿戈尔',
    freeSourceOperators: ['安哲拉', '歌蕾蒂娅'],
    bestRecipients: ['玛恩纳', '水月', '暴躁铁皮'],
    tacticalNote: '赋予目标阿戈尔盟约，使其融入深海猎人攻速与生命再生体系。',
  },
  {
    id: 'trans-siracusa',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '叙拉古正装',
    equipmentTier: 'III',
    targetCovenant: '叙拉古',
    freeSourceOperators: ['伺夜', '荒芜拉普兰德'],
    bestRecipients: ['水灯心', '逻各斯', '空弦'],
    tacticalNote: '赋予目标叙拉古盟约（单件正装也适合挂给水灯心触发装备叠层）。',
  },
  {
    id: 'trans-kazimierz',
    category: '核心盟约转职',
    isNew: false,
    baseEquipmentName: '卡西米尔竞技旗',
    equipmentTier: 'IV',
    targetCovenant: '卡西米尔',
    freeSourceOperators: ['焰尾', '风丸'],
    bestRecipients: ['暴躁铁皮', '史尔特尔', '森蚺'],
    tacticalNote: '在六卡西米尔远牙流或森蚺沙砾机中，让大丑/42姐直接享受6卡西米尔部署后30秒内65%攻击力真实伤害！',
  },

  // ==================== Part 3: 8 Sub-Covenants (Image 4) ====================
  {
    id: 'trans-convergence',
    category: '附加盟约转职',
    isNew: true,
    baseEquipmentName: '聚合急救箱',
    equipmentTier: 'II',
    targetCovenant: '聚合',
    freeSourceOperators: ['风絮'],
    bestRecipients: ['哈洛德', '塞雷娅', '余', '涤火杰西卡'],
    tacticalNote: '新增救命转职！Boss战若差1人开2/3聚合，用二阶急救箱合出聚合转职贴给前排或哈洛德！',
  },
  {
    id: 'trans-dexterous',
    category: '附加盟约转职',
    isNew: true,
    baseEquipmentName: '灵巧涡轮手套',
    equipmentTier: 'II',
    targetCovenant: '灵巧',
    freeSourceOperators: ['罗比菈塔', '承曦格雷伊'],
    bestRecipients: ['水灯心', '暴躁铁皮', '逻各斯', '寒檀'],
    tacticalNote: '新增T0副盟约转职！让水灯心、大丑或逻各斯直接获得高额灵巧技力回复与技能触发增伤！',
  },
  {
    id: 'trans-precision',
    category: '附加盟约转职',
    isNew: false,
    baseEquipmentName: '精准狙击镜',
    equipmentTier: 'III',
    targetCovenant: '精准',
    freeSourceOperators: ['承曦格雷伊'],
    bestRecipients: ['逻各斯', '艾雅法拉', '暴躁铁皮', '黑键'],
    tacticalNote: '精奥远分奴流第一神装！合出精准转职贴给【逻各斯】或【艾雅法拉】吃满几百层精准高额暴击！',
  },
  {
    id: 'trans-swift',
    category: '附加盟约转职',
    isNew: false,
    baseEquipmentName: '迅捷作战粮',
    equipmentTier: 'III',
    targetCovenant: '迅捷',
    freeSourceOperators: ['伊桑', '乌啾'],
    bestRecipients: ['寒檀', '鸿雪', '佩佩', '逻各斯'],
    tacticalNote: '赋予目标迅捷盟约；技能结束时有机会回技力，优先给能反复开技能的核心。',
  },
  {
    id: 'trans-bastion',
    category: '附加盟约转职',
    isNew: false,
    baseEquipmentName: '坚守盾牌',
    equipmentTier: 'I',
    targetCovenant: '坚守',
    freeSourceOperators: ['泡泡', '蛇屠箱'],
    bestRecipients: ['塞雷娅', '烛煌', '维娜·维多利亚'],
    tacticalNote: '1阶极易获取！在奥术坚守维或炎坚守体系中让后排大C也享受600+层坚守的巨额生命防御与固定减伤。',
  },
  {
    id: 'trans-assault',
    category: '附加盟约转职',
    isNew: false,
    baseEquipmentName: '突袭手雷',
    equipmentTier: 'III',
    targetCovenant: '突袭',
    freeSourceOperators: ['奥尔佳', '历阵锐枪芬'],
    bestRecipients: ['暴躁铁皮', '耀骑士临光', '玛恩纳'],
    tacticalNote: '赋予目标突袭盟约，契合大丑高频再部署与耀骑士空降爆发。',
  },
  {
    id: 'trans-unyielding',
    category: '附加盟约转职',
    isNew: false,
    baseEquipmentName: '不屈弹射器',
    equipmentTier: 'II',
    targetCovenant: '不屈',
    freeSourceOperators: ['砾', '折桠'],
    bestRecipients: ['砾', '暴躁铁皮', '玛恩纳'],
    tacticalNote: '森蚺自动沙砾机核心配件！既可单独给砾加快再部署，也可合成不屈转职给玛恩纳/大丑凑齐3不屈锁血护盾。',
  },
  {
    id: 'trans-arcane',
    category: '附加盟约转职',
    isNew: false,
    baseEquipmentName: '奥术法阵',
    equipmentTier: 'III',
    targetCovenant: '奥术',
    freeSourceOperators: ['慕斯', 'Miss.Christine'],
    bestRecipients: ['暴躁铁皮', '霍尔海雅', '空弦', '维什戴尔'],
    tacticalNote: '精奥远与精聚奥莱核心转职！让大丑、空弦或维什戴尔直接获得奥术高额法伤与法穿乘区。',
  },
];



