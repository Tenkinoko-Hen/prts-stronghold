import type { MetaCompGuide } from './strongholdData';
import { aegirImageUrl } from './aegirReferences';

export const AEGIR_PITH_ID = 'aegir-clemencia-erosion';
export const AEGIR_HUNTERS_ID = 'aegir-gladiia-second-squad';

export function isAegirGuide(id: string) {
  return id === AEGIR_PITH_ID || id === AEGIR_HUNTERS_ID;
}

const opening: MetaCompGuide['phases'][number] = {
  phaseName: '低本开深海',
  rounds: '1~5回合',
  shopTier: '一到三本',
  covenantTarget: '先开三阿戈尔；深巡部署时给自己及相邻四格加攻速',
  fieldOperators: [
    { name: '幽灵鲨', tier: 'I', role: '前排与部署叠层' },
    { name: '安哲拉', tier: 'II', role: '击倒叠层' },
    { name: '深巡', tier: 'III', role: '抗线、对空与邻格攻速' },
    { name: '斯卡蒂', tier: 'III', role: '过渡战力' },
  ],
  benchOperators: [],
  keyActions: ['先买能打的牌。缺奶先带奶；双路别把输出全塞在同一条路。'],
};

const steady: MetaCompGuide['phases'][number] = {
  phaseName: '四本稳场',
  rounds: '6~15回合',
  shopTier: '四本站稳；有战力和预算再上五',
  covenantTarget: '水月＋华法琳开灵巧；缺灵巧时看现有突袭与攻速装备',
  fieldOperators: [
    { name: '安哲拉', tier: 'II', role: '续叠阿戈尔' },
    { name: '深巡', tier: 'III', role: '接怪、对空', note: '优先接承压大的一路，攻速覆盖相邻输出。' },
    { name: '归溟幽灵鲨', tier: 'IV', role: '抗线' },
    { name: '水月', tier: 'IV', role: '低压侧终端', note: '留在吞噬链末端或旁侧，别被吃倒或换下。' },
    { name: '华法琳', tier: 'IV', role: '灵巧与治疗', note: '照顾水月和会掉血的前排。' },
  ],
  benchOperators: [],
  keyActions: ['单路沿来怪方向串起来，双路让深巡或幽灵鲨顶重压侧，水月守另一侧。', '克莱门莎没来就保住养好的输出，对空、次数和治疗按敌情补。'],
};

const endgame: MetaCompGuide['phases'][number] = {
  phaseName: '克莱门莎接管',
  rounds: '取得克莱门莎后手动切换',
  shopTier: '五本碰六或上六获取',
  covenantTarget: '保持阿戈尔；先保证主力打得到，再补灵巧、突袭或聚合',
  fieldOperators: [
    { name: '克莱门莎', tier: 'VI', role: '侵蚀主输出', note: '优先 2 技能；对局内核对放逐舱方向与 Boss 走线。' },
    { name: '魔王', tier: 'VI', role: '可选 2 技能支援', note: '按实际走线保护主力；和红蒂的鼓舞不叠。' },
    { name: '归溟幽灵鲨', tier: 'IV', role: '抗线或换补位' },
    { name: '安哲拉', tier: 'II', role: '击倒叠层与吞噬材料' },
    { name: '乌尔比安', tier: 'V', role: '邻格临时增攻' },
    { name: '水月', tier: 'IV', role: '续灵巧或补副输出' },
    { name: '华法琳', tier: 'IV', role: '灵巧与治疗' },
  ],
  benchOperators: [],
  keyActions: [
    '先把克莱门莎放在能打中 Boss 的输出端，确认朝向、攻击范围和首轮走线，再排吞噬链。',
    '有帕拉斯可做灵巧支援；缺帕拉斯就保护水月或让深巡邻接。乌尔比安增攻、深巡攻速均只覆盖自身和相邻四格。',
    '对假想敌·械先试 2 技能的推向：若推离队友火力区，挪位或换朝向；道中已能独立守住再考虑 3 技能打 Boss。',
  ],
};

const gears = [
  '克莱门莎常用 2 技能。道中已稳、Boss 在射程内时可试 3 技能；注意弹药，别把关底技能照搬到道中。',
  '装备先给当轮主力。克莱门莎到手后再转输出装；攻速线没叠起来时，优先补能立刻生效的战力。',
  '原帖有双进阶精准狙击镜的实例；也有天马之翼、动能装的配装。它们是备选，开局不锁装备。',
  '魔王用 2 技能；缺技力可找萨尔贡浓茶。可靠怀表压技能门槛但会降技能期间攻速，按回转缺口考虑。',
  '元素压力大才补浊心斯卡蒂与聚合；华法琳按需要补奶或增攻。两名吟游者的鼓舞取较高值。',
  '纠偏：层数高也可能打不出伤害。先查克莱门莎有没有上场、被换下、朝错方向，或把敌人推出了友方射程。',
];

const fromPace = (rows: [number, string][]) =>
  rows.map(([tier, action], i) => ({ round: i + 1, tier, action }));

export const AEGIR_EROSION: MetaCompGuide = {
  id: AEGIR_PITH_ID,
  title: '阿戈尔 · Pith 稳场',
  subtitle: '调和开盟约；先守住，再找克莱门莎',
  difficulty: '高难上限',
  strategist: 'Pith（优等生）',
  strategistTip: 'R1 拿调和干员。凑出调和后补核心盟约激活人数，先买能守住的输出和治疗。没有二队调度，也不会替换整备区干员。',
  covenants: ['阿戈尔', '调和', '灵巧优先'],
  imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
  secondaryImageUrl: aegirImageUrl('s05'),
  coreHighlight: 'Pith 用调和减轻开盟约压力，低本先保战力。安哲拉负责叠层，水月站低压路，克莱门莎到手再交输出装。',
  equipmentTips: [
    '先补前排和清怪，为当前输出找攻速与续航。突袭要实际达到 50 层，才有全队攻速。',
    ...gears,
  ],
  phases: [opening, steady, endgame],
  roundPace: fromPace([
    [1, '【推导】上 Pith 发的调和干员，补幽灵鲨或现成前排。'],
    [2, '【推导】场面能守再升二，拿安哲拉；留便宜对子。'],
    [2, '【推导】确认调和有没有激活，再算三阿戈尔；缺奶先补奶。'],
    [3, '【推导】有余钱升三找深巡、斯卡蒂。会漏怪就先补阻挡。'],
    [3, '【推导】让主力挨着深巡吃攻速，前排与奶先站稳。'],
    [4, '【推导】升四后还能补牌再升；归溟幽灵鲨来了再换前排。'],
    [4, '【推导】水月配华法琳开灵巧；双路留两个能接怪的点。'],
    [4, '【推导】水月避开吞噬致死，华法琳补血；缺对空保留深巡。'],
    [4, '【推导】道中守稳就留对子、准备五本。血线紧则补场。'],
    [5, '【推导】战力够上五，留对子碰六；乌尔比安有空位再上。'],
    [5, '【推导】继续碰克莱门莎；经济和血线都够时再考虑上六。'],
    [5, '【推导】克莱门莎到手才转装；没来沿用原主力。'],
    [5, '【推导】看敌人类型补对空、治疗或聚合；不为叠层拆现有输出。'],
    [5, '【推导】进入 Boss 布置前，核对朝向、邻格加成和吞噬链。'],
    [5, '【推导】先看 Boss 是否经过主力射程。推离火力区就换朝向或技能。'],
  ]),
};

export const AEGIR_HUNTERS: MetaCompGuide = {
  id: AEGIR_HUNTERS_ID,
  title: '阿戈尔 · 歌蕾蒂娅二队',
  subtitle: 'R6 争取四本；用调度补对子，承压先稳场',
  difficulty: '高难上限',
  strategist: '歌蕾蒂娅（猎人战法）',
  strategistTip: '四本后可花 1 资源调度一名不高于当前本数的阿戈尔。场上有 6 名不同阿戈尔时，改为前 3 名阿戈尔首次被击倒时，从整备区右端找到可部署到该格的阿戈尔替换。',
  covenants: ['阿戈尔', '灵巧优先', '突袭可选'],
  imageUrl: aegirImageUrl('m02'),
  secondaryImageUrl: aegirImageUrl('m06'),
  coreHighlight: '前期少刷新，四本用歌蕾蒂娅策略补卡。双路用深巡或幽灵鲨顶重压路，水月在另一侧叠灵巧。',
  equipmentTips: [
    '五阶自选外援可参考赤刃明霄陈或维什戴尔，按本局缺对空、清杂还是关底输出选；别为等外援拆掉现有战力。',
    '歌蕾蒂娅干员本体是五阶：普通需同行三人，精锐后免人数条件，休整时补低阶阿戈尔。选了同名策略也要实际抓到本体。',
    ...gears,
  ],
  phases: [
    { ...opening, keyActions: [...opening.keyActions, '原帖节奏 R2 二本、R4 三本、R6 四本；前期少刷新，升本会漏就延后。'] },
    {
      ...steady,
      phaseName: '四本调度与补牌',
      shopTier: '四本调度；稳住再上五碰六或直升六',
      fieldOperators: [
        ...steady.fieldOperators,
        { name: '幽灵鲨', tier: 'I', role: '支援前排与部署叠层' },
        { name: '斯卡蒂', tier: 'III', role: '补第六名本家' },
      ],
      benchOperators: [
        { name: '幽灵鲨', tier: 'I', note: '可替上地面前排；核对整备区右侧可用牌。' },
        { name: '深巡', tier: 'III', note: '可补地面与对空；可部署的位置优先。' },
      ],
      keyActions: [
        ...steady.keyActions,
        '场上满 6 名不同阿戈尔才进入替换；只在被击倒时触发。整备区最右侧可部署者优先，勿把水月或克莱门莎当替换材料。',
      ],
    },
    {
      ...endgame,
      keyActions: [...endgame.keyActions, '这组关底示例保留 5 名本家，退出二队替换以保输出和治疗。确实需要替补时才凑第 6 名，提前排好右侧可部署牌。'],
    },
  ],
  roundPace: fromPace([
    [1, '【推导】买幽灵鲨或当轮战力，先凑能上场的牌。'],
    [2, '原帖二本。优先买能提升战力的牌，留安哲拉。'],
    [2, '【推导】留钱升本；要掉血先买治疗、前排或现成对子。'],
    [3, '原帖三本。拿深巡、斯卡蒂；钱紧少刷新。'],
    [3, '【推导】检查双路抗线和对空；缺奶先补奶。'],
    [4, '原帖四本开调度。用调度补阿戈尔和对子，守不住就延后升本。'],
    [4, '先稳四本阵。深巡或幽灵鲨顶一侧，水月配华法琳守另一侧。'],
    [5, '原帖顺风可上五；还在漏就留四本，先让两路都站住。'],
    [5, '【推导】留对子碰六；歌蕾蒂娅本体到手再排同行，别撤掉现有主力。'],
    [6, '原帖顺风可上六，找克莱门莎与高阶支援。预算不足就五本碰六。'],
    [6, '【推导】核对整备区最右侧的替补位；没抽到终端就继续用原输出。'],
    [6, '【推导】克莱门莎到手再转输出装，没来用五阶外援或现成主力。'],
    [6, '【推导】按下一波补奶、对空和攻速；元素压力大才加聚合。'],
    [6, '【推导】看 Boss 走线排克莱门莎，检查吞噬链及魔王、灵巧覆盖。'],
    [6, '【推导】开打确认主力没被换下，2 技能也没有把 Boss 推出火力区。'],
  ]),
};
