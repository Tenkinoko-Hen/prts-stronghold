import type { MetaCompGuide } from './strongholdData';

export const AEGIR_EROSION: MetaCompGuide = {
  id: 'aegir-clemencia-erosion',
  title: '阿戈尔 · 克莱门莎侵蚀',
  subtitle: '低本开深海，守得住再升本找六阶终端',
  difficulty: '高难上限',
  strategist: '歌蕾蒂娅 / Pith（优等生）',
  strategistTip: 'Pith 用调和补人数；歌蕾蒂娅要到四本才能调度阿戈尔干员。前期先靠已有牌稳场。',
  covenants: ['阿戈尔', '灵巧 / 突袭（二选一）'],
  imageUrl: '/assets/aistudio/a083e6e53aaaf78184635027237880b4_dbd8a929.png',
  secondaryImageUrl: '/assets/community/source-062.jpg',
  coreHighlight: '安哲拉配部署叠阿戈尔；灵巧或突袭补攻速。六阶克莱门莎到手后才把输出装集中给她。',
  equipmentTips: [
    '道中先保前排和清怪。灵巧、突袭选能开且有层数的一条，不必两套一起追。',
    '065 的精奥双限走法：歌蕾蒂娅策略过渡，四本水月配华法琳，六阶克莱门莎到手再接Boss。道中先留有效战力，不为凑六阿戈尔提前撤人。',
    '克莱门莎到手再交输出装与回转资源；没来就留养好的输出，不卖场上主力空等。',
    '歌蕾蒂娅普通时同行三人、精锐后无此人数条件；休整期给四种猎人中的一张。050 的七深海是关底增攻变体。',
    '飞行和次数怪先补对空与攻击频率；单排缺人兜底时，别为了赶六本跳过战力。',
    '来源：050、062 及盟约图鉴。原帖没有逐回合表，下列回合是运营参考。'
  ],
  phases: [
    {
      phaseName: '低本开深海', rounds: '1~5回合', shopTier: '一到三本',
      covenantTarget: '先激活阿戈尔；深巡部署时给周围四格加攻速',
      fieldOperators: [
        {name:'幽灵鲨',tier:'I',role:'前排与部署叠层'},
        {name:'安哲拉',tier:'II',role:'击倒叠层'},
        {name:'深巡',tier:'III',role:'周围四格攻速'}
      ], benchOperators: [],
      keyActions: ['开出阿戈尔后再算部署层数；缺输出或治疗先补场面。']
    },
    {
      phaseName: '四本稳场与升本', rounds: '6~15回合', shopTier: '四本站稳；有余钱上五碰六',
      covenantTarget: '保阿戈尔；灵巧或突袭补攻速',
      fieldOperators: [
        {name:'安哲拉',tier:'II',role:'续叠阿戈尔'},
        {name:'深巡',tier:'III',role:'部署攻速'},
        {name:'归溟幽灵鲨',tier:'IV',role:'前排'},
        {name:'水月',tier:'IV',role:'灵巧线输出'},
        {name:'华法琳',tier:'IV',role:'灵巧与治疗',note:'对准水月；走突袭时按需换位'}
      ], benchOperators: [],
      keyActions: ['用水月与华法琳开两灵巧；走突袭可换掉灵巧挂件。守住再升五，保留已有输出直到终端到手。']
    },
    {
      phaseName: '克莱门莎接管', rounds: '取得克莱门莎后手动切换', shopTier: '五本奖励碰六或上六获取',
      covenantTarget: '阿戈尔 + 已叠起的攻速线',
      fieldOperators: [
        {name:'克莱门莎',tier:'VI',role:'侵蚀主输出'},
        {name:'归溟幽灵鲨',tier:'IV',role:'抗线'},
        {name:'安哲拉',tier:'II',role:'击倒叠层'},
        {name:'歌蕾蒂娅',tier:'V',role:'到手后补深海生存'},
        {name:'水月',tier:'IV',role:'灵巧线可留'},
        {name:'华法琳',tier:'IV',role:'灵巧与治疗'}
      ], benchOperators: [],
      keyActions: ['实看攻速、侵蚀输出和前排血线。浊心斯卡蒂到手可配部署叠层，别为凑七深海拆治疗。']
    }
  ],
  roundPace: [
    [1,'拿幽灵鲨或便宜战力守路，留能凑的对子。'], [2,'找安哲拉，先让前排站住。'],
    [2,'算阿戈尔激活人数；未开盟约先保买牌钱。'], [3,'经济够升三，找深巡或斯卡蒂。'],
    [3,'深巡部署时让输出位吃到周围四格攻速，先守住再升。'], [4,'升四会断战力就延后；能守再换归溟幽灵鲨。'],
    [4,'有水月和灵巧就走灵巧；已有突袭攻速则沿用。'], [4,'看前排与清怪，优先补会漏的那一路。'],
    [4,'保留有效对子；升五后还买得起牌再升。'], [4,'五阶已到手才换位；缺阻挡不要先撤前排。'],
    [4,'已升五可留对子碰六，仍在四本就补战力。'], [4,'拿到克莱门莎再切终端阶段；未中沿用原输出。'],
    [4,'已有克莱门莎就集中输出装，核对攻速来源。'], [4,'看 Boss 首轮伤害，补治疗或前排再考虑更多猎人。'],
    [4,'用已成型的攻速线收束；没拿到六阶不拆原阵。']
  ].map(([tier, action], i) => ({round: i + 1, tier: Number(tier), action: `【推导】${action}`}))
};
