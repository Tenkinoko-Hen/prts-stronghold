"""Clean-room operator, summon, trap, and strategist catalog for PRTS telemetry."""

from __future__ import annotations

# Standard Arknights character IDs -> Chinese display names (Stronghold V3_1 + core mainline roster)
OPERATOR_NAMES_BY_CHAR_ID: dict[str, str] = {
    # Stronghold Tier VI
    "char_1039_thorn2": "引星棘刺",
    "char_4140_lasher": "烛煌",
    "char_1012_skadi2": "浊心斯卡蒂",
    "char_4155_clemen": "克莱门莎",
    "char_1014_nearl2": "耀骑士临光",
    "char_1038_whitw2": "荒芜拉普兰德",
    "char_4151_dionys": "酒神",
    "char_4133_logos": "逻各斯",
    "char_4162_mantra": "真言",
    "char_4146_nymph": "妮芙",
    "char_4163_haruka": "遥",
    "char_4134_cetsyr": "魔王",
    "char_350_surtr": "史尔特尔",
    "char_4116_blkkgt": "锏",
    "char_2513_mechan": "Mechanist",
    "char_4152_talula": "塔露拉",
    "char_2015_dusk": "夕",
    "char_4153_lemuen": "蕾缪安",
    "char_249_mlyss": "缪尔赛思",
    "char_485_pallas": "帕拉斯",
    "char_2514_misery": "Misery",
    "char_1013_chen2": "假日威龙陈",
    "char_4138_narant": "娜仁图亚",
    "char_1035_wisdel": "维什戴尔",
    # Stronghold Tier V
    "char_1016_agoat2": "纯烬艾雅法拉",
    "char_1041_zima2": "怒潮凛冬",
    "char_4009_irene": "艾丽妮",
    "char_293_thorns": "棘刺",
    "char_2025_shu": "黍",
    "char_4058_pepe": "佩佩",
    "char_1043_slbell2": "圣聆初雪",
    "char_1042_svrash2": "凛御银灰",
    "char_474_glady": "歌蕾蒂娅",
    "char_4145_ulpia": "乌尔比安",
    "char_4098_vvana": "薇薇安娜",
    "char_358_lisa": "铃兰",
    "char_4156_bellon": "贝洛内",
    "char_1019_siege2": "维娜·维多利亚",
    "char_391_rosmon": "迷迭香",
    "char_4154_entel": "隐德来希",
    "char_202_demkni": "塞雷娅",
    "char_1044_astgen2": "溯光星源",
    "char_322_lmlee": "老鲤",
    "char_4157_monstr": "Mon3tr",
    "char_4158_closur": "可露希尔",
    "char_4055_bgsnow": "鸿雪",
    "char_420_flamtl": "焰尾",
    "char_504_rguard": "预备干员-先锋",
    "char_4159_frzriv": "冻河",
    "char_002_amiya": "阿米娅",
    "char_1037_amiya3": "阿米娅",
    "char_1001_amiya2": "阿米娅",
    "char_1040_chen3": "赤刃明霄陈",
    # Stronghold Tier IV
    "char_4046_ebnholz": "黑键",
    "char_180_amgoat": "艾雅法拉",
    "char_507_rcast": "预备干员-术师",
    "char_188_helage": "赫拉格",
    "char_2512_sharp2": "领主·Sharp",
    "char_4160_vey": "维伊",
    "char_400_weedy": "温蒂",
    "char_4042_lumen": "流明",
    "char_2026_yu": "余",
    "char_416_zumama": "森蚺",
    "char_206_gnosis": "灵知",
    "char_1023_ghost2": "归溟幽灵鲨",
    "char_437_mizuki": "水月",
    "char_430_fartth": "远牙",
    "char_4064_mlynar": "玛恩纳",
    "char_1034_jesca2": "涤火杰西卡",
    "char_4072_ironmn": "白铁",
    "char_4065_judge": "斥罪",
    "char_113_cqbw": "W",
    "char_4027_heyak": "霍尔海雅",
    "char_264_f12yin": "山",
    "char_513_apionr": "预备干员-近卫",
    "char_1031_slent2": "淬羽赫默",
    "char_4088_hodrer": "赫德雷",
    "char_179_cgbird": "夜莺",
    "char_2511_touch": "Touch",
    "char_4082_qiubai": "仇白",
    "char_472_pasngr": "异客",
    "char_291_aglina": "安洁莉娜",
    "char_2515_raidia": "Raidian",
    "char_171_bldsk": "华法琳",
    "char_4011_lessng": "寒檀",
    "char_4119_wanqin": "寒檀",
    # Stronghold Tier III
    "char_4047_czerny": "车尔尼",
    "char_426_billro": "卡涅利安",
    "char_2509_pith": "Pith",
    "char_4039_horn": "号角",
    "char_4066_highmo": "海沫",
    "char_4131_odda": "风絮",
    "char_422_aurora": "极光",
    "char_4013_kjera": "耶拉",
    "char_174_slbell": "初雪",
    "char_4106_coldst": "深巡",
    "char_263_skadi": "斯卡蒂",
    "char_2508_sharp": "Sharp",
    "char_423_blemsh": "瑕光",
    "char_506_rmedic": "预备干员-医疗",
    "char_505_rcast": "预备干员-重装",
    "char_4147_mitm": "忍冬",
    "char_512_aprot": "郁金香",
    "char_427_vigil": "伺夜",
    "char_4026_vulpis": "忍冬",
    "char_4139_caper": "水灯心",
    "char_332_archet": "空弦",
    "char_2510_stome": "Stormeye",
    "char_4109_baslin": "吉星",
    "char_355_ethan": "伊桑",
    "char_484_robrta": "罗比菈塔",
    "char_322_nothing": "乌有",
    "char_455_nothin": "乌有",
    "char_1036_fang2": "历阵锐枪芬",
    "char_4132_ascln": "阿斯卡纶",
    "char_4110_delphn": "凯瑟琳",
    "char_4016_kazema": "风丸",
    "char_4054_malist": "至简",
    # Stronghold Tier II
    "char_129_bluep": "蓝毒",
    "char_381_bubble": "泡泡",
    "char_4148_paprus": "莎草",
    "char_4083_chimes": "雪猎",
    "char_237_gravel": "砾",
    "char_346_aosta": "奥斯塔",
    "char_4130_luton": "哈洛德",
    "char_4114_harold": "哈洛德",
    "char_4136_phonor": "云迹",
    "char_150_snakek": "蛇屠箱",
    "char_258_podego": "波登可",
    "char_1027_greyy2": "承曦格雷伊",
    "char_4137_tinman": "锡人",
    "char_337_utage": "宴",
    "char_4104_coldsh": "渡桥",
    "char_261_sddrag": "苇草",
    "char_274_astesi": "星极",
    "char_195_glassb": "真理",
    "char_333_sidero": "铸铁",
    "char_135_halo": "星源",
    "char_431_ashlok": "灰毫",
    "char_379_sesa": "慑砂",
    "char_365_aprl": "安哲拉",
    "char_218_cuttle": "安哲拉",
    # Stronghold Tier I
    "char_127_estell": "艾丝黛尔",
    "char_143_ghost": "幽灵鲨",
    "char_496_wildmn": "野鬃",
    "char_185_frncat": "慕斯",
    "char_199_yak": "角峰",
    "char_367_swllow": "灰喉",
    "char_476_blkngt": "夜半",
    "char_469_indigo": "深靛",
    "char_328_cammou": "卡达",
    "char_492_quercu": "夏栎",
    "char_347_jaksel": "杰克",
    "char_193_frostl": "霜叶",
    "char_325_bison": "拜松",
    "char_491_humus": "休谟斯",
    "char_4041_chnut": "褐果",
    "char_194_leto": "烈夏",
    "char_219_meteo": "陨星",
    "char_140_whitew": "拉普兰德",
    "char_183_skgoat": "地灵",
    # Additional Core Mainline / Roguelike 6★ Operators (for single-player stage telemetry)
    "char_4087_ines": "伊内丝",
    "char_1028_texas2": "缄默德克萨斯",
    "char_1029_yato2": "麒麟R夜刀",
    "char_1032_excu2": "圣约送葬人",
    "char_1020_reed2": "焰影苇草",
    "char_172_svrash": "银灰",
    "char_003_kalts": "凯尔希",
    "char_103_angel": "能天使",
    "char_010_chen": "陈",
    "char_2023_ling": "令",
    "char_2024_chyue": "重岳",
    "char_2014_nian": "年",
    "char_2012_typhon": "提丰",
    "char_4012_typhon": "提丰",
    "char_4117_ray": "莱伊",
    "char_4132_ascaln": "阿斯卡纶",
    "char_403_amiya": "阿米娅",
    "char_222_bpipe": "风笛",
    "char_401_elysm": "极境",
    "char_261_myrtle": "桃金娘",
    "char_151_myrtle": "桃金娘",
    "char_147_shining": "闪灵",
    "char_136_hsguma": "星熊",
    "char_311_mudrok": "泥岩",
    "char_423_blemish": "瑕光",
    "char_300_phenxi": "菲亚梅塔",
    "char_4009_irene": "艾丽妮",
    "char_1021_kroos2": "寒芒克洛丝",
    "char_108_silent": "赫默",
    "char_128_plosis": "白面鸮",
}

# Common summon token prefix -> host operator char_id fallback
SUMMON_PREFIX_TO_HOST: tuple[tuple[str, str], ...] = (
    ("token_10025_kalts_", "char_003_kalts"),
    ("token_10042_wisdel_", "char_1035_wisdel"),
    ("token_10035_ling_", "char_2023_ling"),
    ("token_10038_mlyss_", "char_249_mlyss"),
    ("token_10029_ironmn_", "char_4072_ironmn"),
    ("token_10000_silent_", "char_108_silent"),
    ("token_10020_rosmon_", "char_391_rosmon"),
    ("token_10012_skadi2_", "char_1012_skadi2"),
    ("token_10005_weedy_", "char_400_weedy"),
    ("token_10018_robrta_", "char_484_robrta"),
    ("token_10034_jesca2_", "char_1034_jesca2"),
    ("token_10041_nymph_", "char_4146_nymph"),
)

STRATEGIST_NAMES: dict[str, str] = {
    "band_kalts": "凯尔希",
    "band_logos": "逻各斯",
    "band_agoat": "艾雅法拉",
    "band_mechan": "Mechanist",
    "band_duyaoy": "杜遥夜",
    "band_jesca": "杰西卡",
    "band_zumama": "森蚺",
    "band_lisa": "铃兰",
    "band_bison": "拜松",
    "band_silent": "赫默",
    "band_closure": "可露希尔",
    "band_lin": "林",
    "band_swire": "诗怀雅",
}


def is_stage_device(unit_id: str) -> bool:
    """Stage traps / environmental devices are tracked separately from squad operators."""
    clean = (unit_id or "").strip().lower()
    return clean.startswith("trap_") or clean.startswith("device_")


def is_summon_token(unit_id: str) -> bool:
    clean = (unit_id or "").strip().lower()
    return clean.startswith("token_")


def resolve_summon_host(unit_id: str) -> str:
    clean = (unit_id or "").strip()
    for prefix, host_id in SUMMON_PREFIX_TO_HOST:
        if clean.startswith(prefix):
            return host_id
    return ""


def resolve_operator_name(char_id: str, fallback: str = "") -> str:
    """Resolve Chinese display name for a character/token ID without inventing names."""
    if fallback and fallback.strip():
        return fallback.strip()
    clean = (char_id or "").strip()
    if not clean:
        return ""
    direct = OPERATOR_NAMES_BY_CHAR_ID.get(clean)
    if direct:
        return direct
    # Strip skin/variant suffixes if any (e.g. char_1035_wisdel#1)
    base = clean.split("#", 1)[0]
    if base in OPERATOR_NAMES_BY_CHAR_ID:
        return OPERATOR_NAMES_BY_CHAR_ID[base]
    host = resolve_summon_host(base)
    if host and host in OPERATOR_NAMES_BY_CHAR_ID:
        return f"{OPERATOR_NAMES_BY_CHAR_ID[host]}·召唤物"
    return clean


def resolve_strategist_name(skill_id: str) -> str:
    clean = (skill_id or "").strip()
    if not clean:
        return ""
    if clean in STRATEGIST_NAMES:
        return STRATEGIST_NAMES[clean]
    lower = clean.lower()
    for key, label in STRATEGIST_NAMES.items():
        token = key.split("_", 1)[-1]
        if token and token in lower:
            return label
    return clean


def _extract_char_number(char_id: str) -> int | None:
    parts = (char_id or "").strip().split("_")
    if len(parts) >= 3 and parts[0] in ("char", "token") and parts[1].isdigit():
        return int(parts[1])
    return None


def resolve_char_by_numeric_id(identifier: int, squad_char_ids: tuple[str, ...] = ()) -> tuple[str, str]:
    """Unambiguously map numeric operator/chess identifier to (char_id, display_name)."""
    if identifier <= 0:
        return ("", "")
    if squad_char_ids:
        matches = [cid for cid in dict.fromkeys(squad_char_ids) if _extract_char_number(cid) == identifier]
        if len(matches) == 1:
            cid = matches[0]
            return (cid, resolve_operator_name(cid))
    catalog_matches = [cid for cid in OPERATOR_NAMES_BY_CHAR_ID if _extract_char_number(cid) == identifier]
    if len(catalog_matches) == 1:
        cid = catalog_matches[0]
        return (cid, OPERATOR_NAMES_BY_CHAR_ID[cid])
    return ("", "")

