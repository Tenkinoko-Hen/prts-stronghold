import type { MetaCompGuide } from './strongholdData';
import { AEGIR_EROSION } from './aegirErosion';
import { MECHANIST_KJERAG } from './mechanistKjerag';

export const SUPPLEMENT_COMMUNITY_COMPS: MetaCompGuide[] = [
  {
    "id": "yan-bison-shop-four",
    "title": "拜松 · 四本整店炎",
    "subtitle": "买整店养风絮，三坚守保道中",
    "difficulty": "进阶公式",
    "strategist": "拜松 · 打包速递",
    "strategistTip": "先看包店价格。店里有一两张核心或能凑对子，再买整店；留对子，卖掉用不上的牌。",
    "covenants": [
      "3炎",
      "3坚守",
      "灵巧",
      "聚合"
    ],
    "imageUrl": "/assets/community/source-058.jpg",
    "secondaryImageUrl": "/assets/community/source-057.jpg",
    "coreHighlight": "精准、奥术受限也可走。先用三坚守和两聚合保场，四本换入风絮、余、仇白、华法琳；五阶塞雷娅到手才复制风絮。",
    "equipmentTips": [
      "仇白默认1技能，由华法琳朝向她叠层；道中群怪挡不住可试2技能，Boss再按控制或输出缺口调回。余与三坚守抗线，装备先保前排。",
      "精锐风絮每回合获得干员叠炎/聚合有上限；拜松费用每轮下降、使用后重置，先看实际价格再留买牌资金，不套固定九金或五金。",
      "塞雷娅是五阶，通过升五或晋升奖励实际取得后再替换一名坚守，朝向风絮；不能四本按普通商品必买。",
      "火陈仅作已取得的Boss外援；没有就保仇白并降低输出预期。三投资人是经济支线，不能挤掉三坚守与实际战力。",
      "没火陈：先用仇白和现有输出装备，也可换入已取得的老鲤、重岳。遇加速地板或群怪，先验阻挡和攻击覆盖。",
      "来源：057、058、060、065。前六轮沿用060的拜松包店节奏；065补三坚守、两聚合与仇白技能取舍。"
    ],
    "phases": [
      {
        "phaseName": "对子与坚守过渡",
        "rounds": "1~5回合",
        "shopTier": "一到三本；对子与资金足再升",
        "covenantTarget": "先稳前排，按来牌补坚守与灵巧",
        "fieldOperators": [
          {
            "name": "野鬃",
            "tier": "I",
            "role": "过渡",
            "note": "留对子，不为指定牌刷空资金"
          },
          {
            "name": "蛇屠箱",
            "tier": "II",
            "role": "前排",
            "note": "二本可得，补坚守底座"
          },
          {
            "name": "云迹",
            "tier": "II",
            "role": "过渡",
            "note": "二本战力与灵巧候选"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "对空",
            "note": "二本取得后补伤害与狙击镜"
          }
        ],
        "benchOperators": [],
        "keyActions": [
          "R3升二、R4升三。若队友守不住，先买前排和有效输出，升本可晚一轮。",
          "拜松指令先解决场面，锁好牌时核对整店价格，留足购买钱。"
        ]
      },
      {
        "phaseName": "四本三炎成型",
        "rounds": "6~8回合",
        "shopTier": "以四本为目标；承压则延后",
        "covenantTarget": "3炎、3坚守、2灵巧、2聚合",
        "fieldOperators": [
          {
            "name": "风絮",
            "tier": "III",
            "role": "叠层",
            "note": "追精锐；买整店增加本轮获得次数"
          },
          {
            "name": "仇白",
            "tier": "IV",
            "role": "输出",
            "note": "1技能配华法琳叠层；群怪压线可试2技能"
          },
          {
            "name": "余",
            "tier": "IV",
            "role": "前排",
            "note": "炎与坚守；先保证能站住"
          },
          {
            "name": "华法琳",
            "tier": "IV",
            "role": "治疗/灵巧",
            "note": "朝向仇白，保治疗覆盖"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "坚守",
            "note": "与余、青枳凑三坚守"
          },
          {
            "name": "青枳",
            "tier": "III",
            "role": "坚守",
            "note": "把叠层朝向给核心"
          },
          {
            "name": "云迹",
            "tier": "II",
            "role": "灵巧",
            "note": "已有精锐战力可留"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "对空",
            "note": "飞机波保留有效输出"
          }
        ],
        "benchOperators": [],
        "keyActions": [
          "四本核心未到就保成熟过渡阵，不预先腾空格。",
          "只开三炎；层数高仍漏怪时补输出、回转与治疗，不继续空刷。"
        ]
      },
      {
        "phaseName": "按需升五与Boss收束",
        "rounds": "9~15回合",
        "shopTier": "060 主线留四本；另可按 057/058 升五找支援",
        "covenantTarget": "保3炎、3坚守、灵巧与聚合",
        "fieldOperators": [
          {
            "name": "风絮",
            "tier": "III",
            "role": "叠层",
            "note": "精锐后靠实际获得次数叠层"
          },
          {
            "name": "仇白",
            "tier": "IV",
            "role": "输出",
            "note": "1技能；没外援时继续主输出"
          },
          {
            "name": "余",
            "tier": "IV",
            "role": "前排",
            "note": "保护输出与治疗"
          },
          {
            "name": "华法琳",
            "tier": "IV",
            "role": "治疗/灵巧",
            "note": "朝向仇白"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "坚守",
            "note": "保三坚守"
          },
          {
            "name": "青枳",
            "tier": "III",
            "role": "坚守",
            "note": "塞雷娅到手可替换此位"
          },
          {
            "name": "云迹",
            "tier": "II",
            "role": "灵巧",
            "note": "按场面换已取得的输出"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "对空",
            "note": "Boss可换实际取得的外援"
          }
        ],
        "benchOperators": [
          {
            "name": "塞雷娅",
            "tier": "V",
            "note": "五阶到手再上场换一名坚守，朝向风絮"
          }
        ],
        "keyActions": [
          "本阶段八人为保底收束，塞雷娅与外援都替换原有位置，不加成第九人。",
          "三投资人、银灰、佩佩等另看经济与卡源；缺火陈不宣称同等Boss伤害。"
        ]
      }
    ],
    "roundPace": [
      {
        "round": 1,
        "tier": 1,
        "action": "买能守路的便宜牌，有现成对子就留。"
      },
      {
        "round": 2,
        "tier": 1,
        "action": "继续买战力和对子，留下一轮升二的钱。"
      },
      {
        "round": 3,
        "tier": 2,
        "action": "升二本。补阻挡和对空，准备下一轮上三。"
      },
      {
        "round": 4,
        "tier": 3,
        "action": "升三本，留风絮与有效坚守牌，准备下轮包店。"
      },
      {
        "round": 5,
        "tier": 3,
        "action": "用拜松指令买有用的整店。留核心、对子和升四的钱；已漏怪先补场。"
      },
      {
        "round": 6,
        "tier": 4,
        "action": "能守路就升四找仇白、余、华法琳。风絮未精锐先用已有战力。"
      },
      {
        "round": 7,
        "tier": 4,
        "action": "【推导】四本补核心，风絮优先精锐；华法琳朝仇白。"
      },
      {
        "round": 8,
        "tier": 4,
        "action": "【推导】核对三炎、三坚守、两聚合。群怪压线可换仇白2技能，再检查阻挡。"
      },
      {
        "round": 9,
        "tier": 4,
        "action": "【推导】成型后考虑上五；仍缺核心继续四本。"
      },
      {
        "round": 10,
        "tier": 4,
        "action": "【推导】五阶塞雷娅实际取得后换一名坚守，朝向风絮。"
      },
      {
        "round": 11,
        "tier": 4,
        "action": "【推导】飞机与隐匿压力下保对空和有效输出，不只看层数。"
      },
      {
        "round": 12,
        "tier": 4,
        "action": "【推导】经济有余再开投资人支线；主阵不能先拆。"
      },
      {
        "round": 13,
        "tier": 4,
        "action": "【推导】Boss前分好生存与输出装备，核对华法琳覆盖。"
      },
      {
        "round": 14,
        "tier": 4,
        "action": "【推导】有火陈外援才换人；没有保仇白，先保自身一路。"
      },
      {
        "round": 15,
        "tier": 4,
        "action": "【推导】固定八格与朝向，三坚守守场、输出打Boss；不要末轮盲目转六炎。"
      }
    ]
  },
  {
    "id": "suzuran-low-tier-acquisition",
    "title": "铃兰 · 低本狙击镜与不融冰",
    "subtitle": "二本抓底座，缺关键牌及时升三",
    "difficulty": "进阶公式",
    "strategist": "铃兰 · 御守之力",
    "strategistTip": "指令触发获得时特质：承曦格雷伊给狙击镜，耶拉给不融冰；根据当轮缺口选对象。",
    "covenants": [
      "3精准",
      "3坚守",
      "灵巧",
      "谢拉格"
    ],
    "imageUrl": "/assets/community/suzuran-acquisition.jpg",
    "coreHighlight": "雪猎、格雷伊、云迹搭底座，三本补空弦、耶拉与坚守。迅捷不是前提；不为精锐死卡二本，双路分离图慎选。",
    "equipmentTips": [
      "雪猎作为输出候选，狙击镜优先给实际主输出；没有精锐格雷伊时可先用普通镜，不预设高阶镜与治疗附加收益。",
      "耶拉的获得特质供不融冰；保留为指令对象时占整备区，战斗不自动触发获得效果。冰给高频攻击位，按实际冻结覆盖调整。",
      "三精准参考雪猎、承曦格雷伊、空弦；三坚守参考罗比菈塔、蛇屠箱、青枳；云迹配格雷伊开灵巧，哈洛德治疗，合计八人。",
      "四本霍尔海雅仅临时叠精准，后换回坚守位，不与八人主阵同时列为常驻。高本灵知/迅捷属于另一条有条件出口。",
      "奶放在灵巧覆盖内；双路分离或缺关键牌时降低预期。本帖有缺牌和隐藏Boss失败反馈，不把标题胜率当保证。",
      "来源：用户长图《卫戍协议胜率超高的二本铃兰玩法》正文及回复。与忍冬炎投资人路线独立；R1–15均为推导。"
    ],
    "phases": [
      {
        "phaseName": "二本取得底座",
        "rounds": "1~5回合",
        "shopTier": "二本找关键牌，缺牌不要硬追精锐",
        "covenantTarget": "精准与灵巧过渡，补前排和治疗",
        "fieldOperators": [
          {
            "name": "雪猎",
            "tier": "II",
            "role": "输出",
            "note": "二本获取，先保证当轮战力"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "镜子/对空",
            "note": "铃兰指令可触发获得狙击镜"
          },
          {
            "name": "云迹",
            "tier": "II",
            "role": "灵巧",
            "note": "与格雷伊配灵巧"
          },
          {
            "name": "蛇屠箱",
            "tier": "II",
            "role": "前排",
            "note": "坚守底座"
          },
          {
            "name": "哈洛德",
            "tier": "II",
            "role": "治疗",
            "note": "保护前排与输出"
          }
        ],
        "benchOperators": [],
        "keyActions": [
          "对子优先但不空刷；缺三本关键牌，资金允许就升三。",
          "这条线不绑定忍冬与炎，也不强制迅捷。"
        ]
      },
      {
        "phaseName": "三本精准坚守",
        "rounds": "6~10回合",
        "shopTier": "三本补空弦、耶拉、罗比菈塔与青枳",
        "covenantTarget": "3精准、3坚守、2灵巧",
        "fieldOperators": [
          {
            "name": "雪猎",
            "tier": "II",
            "role": "输出",
            "note": "持镜输出，按装备调整"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "对空/镜子",
            "note": "优先精锐，未精锐仍可用指令取镜"
          },
          {
            "name": "空弦",
            "tier": "III",
            "role": "精准",
            "note": "三本补第三精准与叠层"
          },
          {
            "name": "云迹",
            "tier": "II",
            "role": "灵巧",
            "note": "配格雷伊，核对治疗覆盖"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "坚守",
            "note": "三本盾辅，按阵线布置"
          },
          {
            "name": "蛇屠箱",
            "tier": "II",
            "role": "坚守",
            "note": "前排承压"
          },
          {
            "name": "青枳",
            "tier": "III",
            "role": "坚守",
            "note": "叠层朝向核心"
          },
          {
            "name": "哈洛德",
            "tier": "II",
            "role": "治疗",
            "note": "放在有效灵巧覆盖内"
          }
        ],
        "benchOperators": [
          {
            "name": "耶拉",
            "tier": "III",
            "note": "三本取得后留作指令对象，供不融冰"
          }
        ],
        "keyActions": [
          "八格示例是成型参考，没齐先留已有战力。",
          "约R6升三来自评论参考；缺牌、血线和经济优先于回合表。"
        ]
      },
      {
        "phaseName": "镜冰分配与终盘",
        "rounds": "11~15回合",
        "shopTier": "以三本收束；四本仅按需补强",
        "covenantTarget": "3精准、3坚守、2灵巧；不强制迅捷",
        "fieldOperators": [
          {
            "name": "雪猎",
            "tier": "II",
            "role": "输出",
            "note": "镜子按实际品质分配"
          },
          {
            "name": "承曦格雷伊",
            "tier": "II",
            "role": "对空/冻结",
            "note": "冰可给高频攻击位"
          },
          {
            "name": "空弦",
            "tier": "III",
            "role": "精准",
            "note": "叠层与对空"
          },
          {
            "name": "云迹",
            "tier": "II",
            "role": "灵巧",
            "note": "覆盖奶与核心输出"
          },
          {
            "name": "罗比菈塔",
            "tier": "III",
            "role": "坚守",
            "note": "保盾与前排"
          },
          {
            "name": "蛇屠箱",
            "tier": "II",
            "role": "坚守",
            "note": "防止阵线穿透"
          },
          {
            "name": "青枳",
            "tier": "III",
            "role": "坚守",
            "note": "叠层并保护后排"
          },
          {
            "name": "哈洛德",
            "tier": "II",
            "role": "治疗",
            "note": "Boss前核对覆盖与回转"
          }
        ],
        "benchOperators": [
          {
            "name": "耶拉",
            "tier": "III",
            "note": "根据缺冰情况触发获得特质"
          }
        ],
        "keyActions": [
          "四本霍尔海雅临时叠精准后回到三坚守，不硬凑第九人。",
          "双路、飞机和Boss输出分别检查；不能靠冰或层数保证全场无漏。"
        ]
      }
    ],
    "roundPace": [
      {
        "round": 1,
        "tier": 1,
        "action": "【推导】买对子与稳场牌，优先能挡与能打。"
      },
      {
        "round": 2,
        "tier": 2,
        "action": "【推导】上二本找雪猎、承曦格雷伊、云迹；补前排。"
      },
      {
        "round": 3,
        "tier": 2,
        "action": "【推导】格雷伊到手可用铃兰指令取镜，先给当轮主输出。"
      },
      {
        "round": 4,
        "tier": 2,
        "action": "【推导】留关键对子，奶和前排没齐就买战力，不空刷。"
      },
      {
        "round": 5,
        "tier": 2,
        "action": "【推导】二本关键牌迟迟不到，准备升三补阵，不死追精锐。"
      },
      {
        "round": 6,
        "tier": 3,
        "action": "【推导】经济允许升三找空弦、耶拉与坚守；已有压力先补场。"
      },
      {
        "round": 7,
        "tier": 3,
        "action": "【推导】先补第三精准与第三坚守，耶拉供冰按当轮需求。"
      },
      {
        "round": 8,
        "tier": 3,
        "action": "【推导】核对八格与治疗覆盖，指令在镜子、冰或其他获得效果间取舍。"
      },
      {
        "round": 9,
        "tier": 3,
        "action": "【推导】优先已有关键牌精锐；普通镜也可先用于输出。"
      },
      {
        "round": 10,
        "tier": 3,
        "action": "【推导】冰给高频攻击位，灵巧覆盖治疗，检查双路压力。"
      },
      {
        "round": 11,
        "tier": 3,
        "action": "【推导】稳定则三本收束；有资金和明确缺口才上四。"
      },
      {
        "round": 12,
        "tier": 3,
        "action": "【推导】仍在三本就继续原阵；若已按需升四并取得霍尔海雅，可临时叠精准后换回坚守位。"
      },
      {
        "round": 13,
        "tier": 3,
        "action": "【推导】Boss前调整镜冰分配，先保治疗与前排。"
      },
      {
        "round": 14,
        "tier": 3,
        "action": "【推导】检查输出、对空与回转；不临时拆主阵追高本终端。"
      },
      {
        "round": 15,
        "tier": 3,
        "action": "【推导】保三精准三坚守与有效灵巧；按实际敌人调整朝向与治疗。"
      }
    ]
  },
  AEGIR_EROSION,
  MECHANIST_KJERAG
];
