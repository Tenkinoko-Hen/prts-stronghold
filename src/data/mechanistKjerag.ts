// 青逝痕 Tenkinoko 制作
import type { MetaCompGuide } from './strongholdData';

export const MECHANIST_KJERAG: MetaCompGuide = {
  id: 'kjerag-mechanist-greyy',
  title: '机械师谢拉格 · 格雷伊控场',
  subtitle: '二本留格雷伊，手套加不融冰；站稳再升本补输出',
  difficulty: '进阶公式',
  strategist: 'Mechanist（机械师分队）',
  strategistTip: '前两轮先找装备。每回合首次合并进阶后，三选一免费拿装备；有合适对子可升二后再合。中期用免费刷新省钱，错开队友牌池。',
  covenants: ['3谢拉格', '2灵巧', '坚守（按需）', '聚合（按需）'],
  imageUrl: '/assets/community/source-064.jpg',
  secondaryImageUrl: '/assets/community/source-063.jpg',
  coreHighlight: '承曦格雷伊拿【灵巧涡轮手套】和【谢拉格不融冰】，让普通初雪的攻击范围覆盖冻结区。飞行波和Boss另留实际输出与治疗。',
  equipmentTips: [
    '承曦格雷伊拿【灵巧涡轮手套】＋【谢拉格不融冰】。耶拉给冰，格雷伊给镜；装备达到合并条件并进阶才触发送装备。',
    '前两轮优先能回收资金的装备；缺阻挡、续航或清怪时，先留能解决本轮问题的装备。没凑成装备对子，继续用免费刷新，不花空买牌钱。',
    '普通初雪要覆盖实际冻结点；漏冻先改朝向和站位。道中能守住才考虑增加叠层位，Boss前把未发挥作用的叠层位换成有伤害或生存的卡。',
    '五本有迷迭香可试作输出，也可按来牌转精灵奥谢。精准、奥术与迅捷都不是这套控场的前提；若格雷伊不在牌池，不能照搬。',
    '来源：063 的机械师运营、064 的谢拉格实战。064 样本未过隐藏；怕飞行波、分路和Boss输出不足，不按作者层数估算通关。'
  ],
  phases: [
    {
      phaseName: '装备开局，二本留格雷伊',
      rounds: '1~5回合',
      shopTier: 'R3二本作参考；没锁好对子或守不住可延后',
      covenantTarget: '低本战力；能开2灵巧就开',
      fieldOperators: [
        { name: '角峰', tier: 'I', role: '前排', note: '便宜阻挡，留给后续三谢' },
        { name: '霜叶', tier: 'I', role: '灵巧过渡' },
        { name: '褐果', tier: 'I', role: '临时续航' },
        { name: '承曦格雷伊', tier: 'II', role: '低本控场', note: '二本留牌；手套和冰到手再接控场' },
        { name: '云迹', tier: 'II', role: '叠灵巧', note: '能开技能再算叠层收益' }
      ],
      benchOperators: [],
      keyActions: ['先买能守路的牌，再留装备对子。格雷伊没来，用现成对空输出，别把钱刷空。']
    },
    {
      phaseName: '三谢冻结，站稳再四本',
      rounds: '6~9回合',
      shopTier: '三本找耶拉和初雪；R7四本只作参考',
      covenantTarget: '3谢拉格 + 2灵巧；治疗与对空优先',
      fieldOperators: [
        { name: '承曦格雷伊', tier: 'II', role: '控场', note: '装备：灵巧涡轮手套、不融冰' },
        { name: '云迹', tier: 'II', role: '叠灵巧' },
        { name: '耶拉', tier: 'III', role: '供冰', note: '拿到第二件冰可检查是否能合并进阶' },
        { name: '初雪', tier: 'III', role: '冻结叠层', note: '攻击范围要盖住格雷伊控住的怪' },
        { name: '角峰', tier: 'I', role: '前排' },
        { name: '哈洛德', tier: 'II', role: '治疗', note: '优先覆盖前排与主输出' }
      ],
      benchOperators: [],
      keyActions: ['先让手套与冰发挥作用，空位留给对空或阻挡。四本不用硬追灵知，不用为凑六谢拆现有阵容。']
    },
    {
      phaseName: '控场底座与Boss换位',
      rounds: '10~15回合',
      shopTier: '四本能守就补装备；有钱买牌时再升五',
      covenantTarget: '保有效控场；按敌人补输出、治疗和抗伤',
      fieldOperators: [
        { name: '承曦格雷伊', tier: 'II', role: '控场', note: '手套和不融冰放在能打到怪的路' },
        { name: '耶拉', tier: 'III', role: '不融冰来源' },
        { name: '初雪', tier: 'III', role: '冻结叠层', note: 'Boss若不吃控制，可换即战力' },
        { name: '角峰', tier: 'I', role: '阻挡', note: '扛不住就换已到手的坚守' },
        { name: '云迹', tier: 'II', role: '灵巧与回转' },
        { name: '哈洛德', tier: 'II', role: '治疗' }
      ],
      benchOperators: [],
      keyActions: ['有迷迭香等高阶输出再替换道中叠层位；没有就强化当前能打Boss的干员。', '起飞和分路会削弱单路控场。先检查另一条路、治疗覆盖和Boss首轮伤害。']
    }
  ],
  roundPace: [
    { round: 1, tier: 1, action: '【推导】拿角峰等便宜战力，免费刷装备；优先能补钱或保住本轮的。' },
    { round: 2, tier: 1, action: '店里有合适装备就买。留同类对子，能合并前别花掉升二的钱。' },
    { round: 3, tier: 2, action: '有装备对子和足够资金时升二再合；买承曦格雷伊或云迹，没对子照常补战力。' },
    { round: 4, tier: 2, action: '【推导】低本找承曦格雷伊，手套先给实际输出；缺对空先买能处理飞行的干员。' },
    { round: 5, tier: 2, action: '【推导】能守住就留一轮二本找关键对子；稳定后留升三和买耶拉的钱。' },
    { round: 6, tier: 3, action: '【推导】上三找耶拉与初雪。冰给承曦格雷伊，初雪覆盖冻结区；缺治疗先买奶。' },
    { round: 7, tier: 4, action: '能守再升四。控场稳定就留对子、买有效装备，不为找灵知花光钱。' },
    { round: 8, tier: 4, action: '【推导】核对三谢、两灵巧与冰冻覆盖；分路或飞机波加独立对空。' },
    { round: 9, tier: 4, action: '【推导】用免费刷新补装备与精锐对子；场面不稳先补治疗或第三坚守。' },
    { round: 10, tier: 4, action: '【推导】有钱上五且买得起战力再升；留四本也能继续守，不提前卖主力。' },
    { round: 11, tier: 4, action: '【推导】五本见迷迭香可补输出；仍在四本就强化已成型的主力。' },
    { round: 12, tier: 4, action: '【推导】先看本波漏的是飞机、分路还是伤害不足；按缺口换位。' },
    { round: 13, tier: 4, action: '【推导】精灵奥组件齐才考虑接终端，没到就沿用当前阵容，不临时硬转。' },
    { round: 14, tier: 4, action: '【推导】准备Boss：保证主C射程与治疗，让没收益的纯叠层位让给输出。' },
    { round: 15, tier: 4, action: '【推导】按Boss是否吃控制安排承曦格雷伊，补独立输出与抗伤。' }
  ]
};
