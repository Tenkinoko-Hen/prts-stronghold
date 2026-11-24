// 青逝痕 Tenkinoko 制作
export const AEGIR_SOURCES = {
  guide: { id: '11209250644', title: '做个阿戈尔攻略' },
  placement: { id: '11208776815', title: '卫戍协议歌蕾蒂娅策略阿戈尔摆法' },
  damage: { id: '11199840817', title: '到底怎么玩阿戈尔' },
  strategy: { id: '11197994020', title: '孩子们歌蒂阿戈尔真的很强' },
  pitfall: { id: '11195543224', title: '孩子们阿戈尔小众变态错题本来了' },
  nga079: { id: '079', title: '给新海嗣讲一下阿戈尔的基础技巧' },
} as const;

export type AegirStage = '道中' | 'Boss战';
type AegirPurpose = AegirStage | '吞噬摆位' | '纠偏' | '资料';

interface AegirReference {
  id: string;
  title: string;
  purpose: AegirPurpose;
  source: keyof typeof AEGIR_SOURCES;
  location: string;
  note: string;
  mapId?: string;
  terrain?: string;
  round?: number;
}

const guidePicture = (id: string, title: string, location: string, note: string): AegirReference =>
  ({ id, title, purpose: '资料', source: 'guide', location, note });

const cactus = (id: string, round: number, title: string, note: string): AegirReference =>
  ({ id, round, title, note, purpose: '道中', mapId: 'desert-1', source: 'guide', location: '第 25 楼及同局补图' });

const swallow = (id: string, title: string, location: string, note: string): AegirReference =>
  ({ id: `nga079-${id}`, title, location, note, purpose: '吞噬摆位', source: 'nga079', terrain: '相对站位' });

export const AEGIR_REFERENCES: readonly AegirReference[] = [
  swallow('double-lead', '双路守线 · 两个鱼头同吃', '主帖「双吃摆法」', '幽灵鲨和深巡都朝向归溟幽灵鲨，后面的吞噬链给两路前排提供阻挡。先确定两路需要谁接怪，再按可部署格旋转。'),
  swallow('straight', '入门 · 一条线朝同一侧', '主帖图 1.1', '箭头是干员面向；吞噬目标在身前一格。先定接怪端，再沿朝向排后续队友。'),
  swallow('horizontal', '横向互对 · 两人闭环', '主帖图 1.2', '作者的横向示例由左侧发起。右侧若是需要持续输出或治疗的干员，先检查它会不会被吞噬击倒。'),
  swallow('vertical', '纵向互对 · 两人闭环', '主帖图 1.3', '作者的纵向示例由上方发起；用来核对纵向朝向，别把上下摆位当成横排直接照抄。'),
  swallow('loop-branch', '一侧接入 · 吃闭环', '主帖图 1.4', '先看图中 b、c 的互朝，再看 a 指向 b。接怪的干员放环外；环里优先放能承受吞噬的单位。'),
  swallow('multi-branch', '多侧接入 · 环外留主力', '主帖图 1.5', '图中 a、b、c 分别指向 d/e 环。用三个箭头核对相邻格；实际阻挡和生存看本局编成。'),
  swallow('double-support', '双吃变式 · 加一名支援', '主帖「双吃摆法」补图', '红蒂可换魔王。这张摆法原帖建议深巡开场血量超过 5000；也要核对本局承伤与两路技能覆盖。'),
  swallow('clockwise', '四格回环 · 顺时针', '主帖图 3.1', '按箭头逐格对照；作者示例以幽灵鲨为发起端、深巡作末端。要留场的干员先放环外。'),
  swallow('counterclockwise', '四格回环 · 反向摆法', '主帖图 3.2', '回环反过来摆后，被依次吞噬的顺序也会变。不要换一张图只翻转其中一个干员。'),
  swallow('two-entries', '四格回环 · 两侧外接', '主帖图 3.3', '安哲拉与乌尔比安在环外，各自朝向相邻的环内单位。两路需分工时先检查输出覆盖。'),
  swallow('anti-air', '飞行波 · 把对空留在环外', '主帖「回环链路」补图', '这张图用安哲拉、深巡处理飞行压力，克莱门莎不要算作对空位；技能和站位看下一波敌人。'),
  swallow('mizuki-risk', '开战纠偏 · 水月进环会承伤', '评论第 32–33 楼', '图中的水月也在环内。被吞顺位越后，累计物理伤害可能越高；用实际血量、防御和助力检查，别按吞噬者人数估算。'),
  cactus('m17', 5, 'R5 · 双路过渡', '以左侧蓝门、右侧红门和中央仙人掌为参照。先守住两路；治疗跟着掉血的前排摆，别等四本才补。'),
  cactus('m26', 6, 'R6 · 幽灵鲨接怪', '橙色范围是选中幽灵鲨时显示的朝向与射程。图中朝红门方向接怪；另一侧也要留人，左边被面板挡住的格子请按本局核对。'),
  cactus('m27', 6, 'R6 · 深巡对空和攻速', '选中深巡看朝右的攻击范围。攻速加成覆盖自身和相邻四格，与攻击范围不同；下一格的终端要挨着深巡才能吃到。'),
  cactus('m20', 7, 'R7 · 四本防线', '参考仙人掌左侧的两条来怪线。重压侧留能阻挡的主力，另一侧用独立输出清漏怪，别把全队挤在一条线上。'),
  cactus('m19', 10, 'R10 · 输出换位后守双路', '中间两列分开布前排和输出，比较上方接怪位与下方补位。六阶牌没到时，保留已有防线。'),
  cactus('m18', 11, 'R11 · 战前分路布置', '这是 R11 休整期画面。区分棋盘内上场位和下方整备区；歌蕾蒂娅二队开替换前检查右侧可部署的替补。'),
  { id: 'm21', round: 14, title: 'R14 · 克莱门莎战前朝右', purpose: 'Boss战', source: 'guide', location: '第 25 楼', mapId: 'desert-1', note: '蓝门在左、Boss 在右。图中克莱门莎位于编队左端朝右；先按本局射程覆盖 Boss 走线，再排她身前的吞噬与支援。' },
  { id: 'm22', title: '十字高台 · Boss 实战', purpose: 'Boss战', source: 'guide', location: '第 25 楼', mapId: 'desert-1', note: '与 R14 布置前后对照。观察右侧 Boss 进到火力范围的位置，以及漩涡跟队友范围有无重合；特效遮挡的格子不照搬。' },
  { id: 's03', title: '箱阵 · 补终端后实战', purpose: 'Boss战', source: 'damage', location: '评论配图', mapId: 'desert-3', note: '左上双箱、上方单箱和左下蓝门可对照荒漠 III。拿到终端后看 Boss 是否进了主力射程；这张图不能证明只靠高层数就有伤害。' },
  { id: 's11', title: '箱阵 · 矩兽战前局部', purpose: 'Boss战', source: 'placement', location: '评论配图', terrain: '荒漠箱阵局部', note: '右边是矩兽，克莱门莎在靠右下排，右边还有一名队员。若用红蒂或灵巧位换魔王附近的支援，重查覆盖；局部图不能确定整图坐标。' },
  { id: 's12', title: '箱阵 · 吞噬与支援示意', purpose: 'Boss战', source: 'placement', location: '评论配图', mapId: 'desert-3', note: '用蓝门、上方双箱和单箱比对荒漠 III。红色手绘箭头是作者的编队说明；按可部署格和吞噬朝向调整，Boss 行进请看单独的路线图。' },
  { id: 'm24', title: '隐秘战 · 克莱门莎配装与局部', purpose: 'Boss战', source: 'guide', location: '第 25 楼', terrain: '荒漠战场局部', note: '装备侧栏遮住部分棋盘。可参考天马之翼及动能装，站位只看可见的队伍与 Boss 相对位置。' },
  { id: 's09', title: '假想敌·械 · 被推离火力区', purpose: '纠偏', source: 'pitfall', location: '主帖配图', terrain: '荒漠 · 蓝门在右', note: '这是 2 技能把敌人推到队友射程外的反例。先观察放逐舱的方向和 Boss 推后停在哪，再调整朝向或改用其他技能；不要按原图照摆。' },
  { id: 's01', title: '失败战报 · 层数不等于伤害', purpose: '纠偏', source: 'damage', location: '主帖配图', note: '战报用来排查为何没打出输出。先查主力是否就位、有没有覆盖敌人和活到输出窗口，不能从失败画面反推开场站位。' },
  { id: 's02', title: '队伍对比 · 查主力与层数', purpose: '纠偏', source: 'damage', location: '主帖及评论配图', note: '拿这张编队面板查主力是否上场、治疗是否跟上。层数和上场牌须一起看，面板不能还原具体摆位。' },
  guidePicture('m01', '盟约记录 · 作者战绩', '主帖', '对比常用主盟约与附加盟约，属于个案，不作胜率或层数目标。'),
  guidePicture('m02', '歌蕾蒂娅 · 猎人战法', '主帖', '查四本调度与六名不同阿戈尔的替换条件。按整备区最右侧的可部署牌核对补位。'),
  guidePicture('m03', '克莱门莎 · 侵蚀冷却', '第 2 楼', '看六阶本家终端的作战能力；仍要让技能实际命中。'),
  guidePicture('m04', '深巡 · 相邻四格攻速', '第 2 楼', '看部署时的攻速覆盖。需要吃攻速的主力紧贴深巡，斜对角不算。'),
  guidePicture('m05', '乌尔比安 · 相邻四格增攻', '第 2 楼', '看部署时的攻击力加成。把要增攻的主力放在相邻格，持续时间按关卡内效果。'),
  guidePicture('m06', '阿戈尔 · 作者技能编成', '第 3 楼', '赛前对照本家技能选择；克莱门莎以 2 技能为通用参考，3 技能看 Boss 战条件。'),
  guidePicture('m07', '五阶自选 · 火陈 / 维什戴尔', '第 4 楼', '补关底、对空或次数的外援举例。读取自选编队阶数，不能当成标准卡池阶数。'),
  guidePicture('m08', '二队策略 · 条件复核', '第 6 楼', '与主帖策略图内容相同的另一张截屏，用于核对速四打法的前提。'),
  guidePicture('m09', '歌蕾蒂娅 · 干员本体特质', '第 6 楼', '查休整期发牌及同行三人条件；精锐后无需同行。别和同名策略的四本调度混淆。'),
  guidePicture('m10', '帕拉斯 · 灵巧后期补件', '主帖评论', '已有灵巧层数再考虑帕拉斯。休整叠层与开战的站位覆盖分开看。'),
  guidePicture('m11', '史尔特尔 · 突袭备选', '主帖评论', '已有突袭组件时参考，达到阈值后补全队攻速。检查再部署会不会改变火力方向。'),
  guidePicture('m12', '阿戈尔重刃 · 攻击换攻速', '主帖评论', '同时看加攻与降攻速。吞噬取基础攻击力；不要把装备攻击加成也算进吞噬收益。'),
  guidePicture('m13', '魔王 · 调和支援', '主帖评论', '查魔王休整叠层特质。攻略参考 2 技能，让技能覆盖克莱门莎。'),
  guidePicture('m14', '萨尔贡浓茶 · 自然回技力', '主帖评论', '给靠自然回技力且缺回转的单位，不用为了照图凑装。'),
  guidePicture('m15', '可靠怀表 · 回转取舍', '主帖评论', '降低开启技能所需技力，代价是技能期间降攻速。先判断缺的是回转还是出手频率。'),
  guidePicture('m16', '矩兽 · 敌方图鉴', '主帖评论', '辨认敌人；走线和接敌点在「Boss 路线」按地形查看。'),
  guidePicture('m23', '过渡编队 · 六本面板', '第 25 楼', '对照当局阿戈尔与附加盟约、场上阵容和对子的取舍。面板里的牌序不是棋盘坐标。'),
  guidePicture('m25', '终局编队 · 隐秘战面板', '第 25 楼', '对照关底的阵容与盟约层数，搭配隐秘战局部图看前后变化。'),
  { id: 's04', title: '通关配装 · 双进阶狙击镜', purpose: '资料', source: 'strategy', location: '正文及评论', note: '核对歌蕾蒂娅一局的克莱门莎双金镜配法。缺镜时沿用能打的装备；魔王按楼主更正用 2 技能。' },
  { id: 's05', title: 'Pith · 优等生策略', purpose: '资料', source: 'strategy', location: '评论配图', note: '核对首回合赠送的调和干员；调和激活后提高核心盟约激活人数。不要把它当作歌蕾蒂娅调度。' },
  { id: 's06', title: 'Pith · 战绩参考', purpose: '资料', source: 'strategy', location: '评论配图', note: '看作者曾打出的结果；战绩不能还原是哪一回合、哪套摆位稳定打出。' },
  { id: 's07', title: 'Pith · 盟约记录', purpose: '资料', source: 'strategy', location: '评论配图', note: '对照作者曾激活的阿戈尔与聚合。它们的最高层数来自记录，不一定在同一局达成。' },
  { id: 's08', title: 'Pith · 聚合实战编队', purpose: '资料', source: 'strategy', location: '评论配图', note: '元素压力大可参考红蒂、华法琳与聚合位；有治疗缺口优先补缺口。图中是阵容与层数，未给站位。' },
  { id: 's10', title: '假想敌·械 · 敌方资料', purpose: '资料', source: 'pitfall', location: '帖内资料图', note: '与错题图对照辨认敌人。技能推力、敌人的状态与落点需在本局核对，这张图未提供部署方式。' },
];

export function aegirImageUrl(id: string) {
  return `/assets/aegir-guide/${id}.jpg`;
}

export function aegirMapReferences(mapId: string, stage: AegirStage) {
  return AEGIR_REFERENCES.filter(item => item.mapId === mapId && item.purpose === stage);
}
