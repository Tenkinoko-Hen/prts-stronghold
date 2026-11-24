# 青逝痕 Tenkinoko 制作
"""Clean-room operator, chess piece, equip, strategist, and mode catalog for PRTS telemetry."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any, Mapping

_CATALOG_PATH = Path(__file__).with_name("stronghold_catalog.json")


def _load_catalog() -> dict[str, Any]:
    try:
        return json.loads(_CATALOG_PATH.read_text(encoding="utf-8"))
    except OSError:
        return {}


_CATALOG = _load_catalog()

OPERATOR_NAMES_BY_CHAR_ID: dict[str, str] = {
    **(_CATALOG.get("operators") or {}),
    # Explicit aliases & Stronghold-specific entries guaranteed even if JSON is trimmed
    "char_4046_ebnhlz": "黑键",
    "char_4046_ebnholz": "黑键",
    "char_4047_pianst": "车尔尼",
    "char_4047_czerny": "车尔尼",
    "char_4166_varkis": "摆渡人",
    "char_1035_wisdel": "维什戴尔",
    "char_4133_logos": "逻各斯",
    "char_4116_blkkgt": "锏",
    "char_2025_shu": "黍",
}

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
    **(_CATALOG.get("strategists") or {}),
}

CHESS_BY_IDENTIFIER: dict[int, dict[str, Any]] = {
    int(k): v for k, v in (_CATALOG.get("chess_by_id") or {}).items() if str(k).isdigit()
}

CHESS_BY_CHESS_ID: dict[str, dict[str, Any]] = {
    str(v.get("chess_id")): {"identifier": k, **v}
    for k, v in CHESS_BY_IDENTIFIER.items()
    if v.get("chess_id")
}

TRAP_BY_IDENTIFIER: dict[int, dict[str, Any]] = {
    int(k): v for k, v in (_CATALOG.get("trap_by_id") or {}).items() if str(k).isdigit()
}

SHOP_EQUIPS: tuple[dict[str, Any], ...] = tuple(_CATALOG.get("shop_equips") or ())

MODES_BY_ID: dict[str, dict[str, Any]] = dict(_CATALOG.get("modes") or {})

POOL_COPIES_BY_TIER: dict[int, int] = {
    int(k): int(v)
    for k, v in (_CATALOG.get("pool_copies_by_tier") or {"1": 12, "2": 14, "3": 18, "4": 16, "5": 8, "6": 5}).items()
}

DEFAULT_SHOP_SLOTS: dict[int, dict[str, int]] = {
    1: {"char": 3, "item": 1, "upgrade_price": 5},
    2: {"char": 4, "item": 1, "upgrade_price": 8},
    3: {"char": 4, "item": 1, "upgrade_price": 11},
    4: {"char": 5, "item": 1, "upgrade_price": 12},
    5: {"char": 5, "item": 1, "upgrade_price": 13},
    6: {"char": 5, "item": 1, "upgrade_price": 99},
}

SUMMON_PREFIX_TO_HOST: tuple[tuple[str, str], ...] = (
    ("token_10025_kalts_", "char_003_kalts"),
    ("token_10002_kalts_", "char_003_kalts"),
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
    """Resolve Chinese display name for a character/token/trap ID without inventing names."""
    if fallback and fallback.strip():
        return fallback.strip()
    clean = (char_id or "").strip()
    if not clean:
        return ""
    direct = OPERATOR_NAMES_BY_CHAR_ID.get(clean)
    if direct:
        return direct
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
    m = re.match(r"^aceffect_band_(\d+)$", lower)
    if m:
        return f"策略家 #{m.group(1)}"
    for key, label in STRATEGIST_NAMES.items():
        if key.startswith("band_"):
            token = key.split("_", 1)[-1]
            if token and token in lower:
                return label
    return clean


def resolve_chess_tier(chess_id: str, identifier: int | None = None) -> int:
    if identifier is not None and identifier in CHESS_BY_IDENTIFIER:
        tier = int(CHESS_BY_IDENTIFIER[identifier].get("tier") or 0)
        if 1 <= tier <= 6:
            return tier
    if chess_id in CHESS_BY_CHESS_ID:
        tier = int(CHESS_BY_CHESS_ID[chess_id].get("tier") or 0)
        if 1 <= tier <= 6:
            return tier
    m = re.match(r"^chess_(?:char|item)_(\d+)_", chess_id or "")
    if m:
        tier = int(m.group(1))
        if 1 <= tier <= 6:
            return tier
    return 0


def resolve_chess_identifier(
    identifier: int,
    squad_slots: tuple[Mapping[str, Any], ...] | list[Mapping[str, Any]] = (),
) -> dict[str, Any] | None:
    """Resolve a numeric chess identifier (0..309) to {chess_id, char_id, name, tier, is_golden, copies}."""
    if not isinstance(identifier, int) or identifier < 0:
        return None
    entry = CHESS_BY_IDENTIFIER.get(identifier)
    if entry is not None:
        chess_id = str(entry.get("chess_id") or "")
        char_id = str(entry.get("char_id") or "")
        tier = int(entry.get("tier") or resolve_chess_tier(chess_id))
        is_golden = bool(entry.get("is_golden"))
        upgrade_num = int(entry.get("upgrade_num") or 3)
        # DIY slots share chess_id like chess_char_5_diy1_a / _b; match against the player's roster squad
        if not char_id and chess_id and squad_slots:
            base_chess = chess_id[:-2] + "_a" if chess_id.endswith("_b") else chess_id
            for slot in squad_slots:
                s_cid = str(slot.get("chess_id") or "")
                if s_cid == chess_id or s_cid == base_chess:
                    char_id = str(slot.get("char_id") or "")
                    break
        name = resolve_operator_name(char_id) if char_id else (str(entry.get("name") or "") or chess_id)
        return {
            "identifier": identifier,
            "chess_id": chess_id,
            "char_id": char_id,
            "name": name,
            "tier": tier,
            "is_golden": is_golden,
            "copies": upgrade_num if is_golden else 1,
        }
    return None


def resolve_trap_identifier(identifier: int) -> dict[str, Any] | None:
    """Resolve a numeric trap/equip chess identifier (310+) to equip info."""
    if not isinstance(identifier, int) or identifier < 0:
        return None
    entry = TRAP_BY_IDENTIFIER.get(identifier)
    if entry is None:
        return None
    return {
        "identifier": identifier,
        "chess_id": str(entry.get("chess_id") or ""),
        "trap_id": str(entry.get("trap_id") or ""),
        "name": str(entry.get("name") or entry.get("trap_id") or entry.get("chess_id") or ""),
        "tier": int(entry.get("tier") or 0),
        "is_golden": bool(entry.get("is_golden")),
        "item_type": str(entry.get("item_type") or "EQUIP"),
        "give_bond_id": str(entry.get("give_bond_id") or ""),
        "copies": 2 if entry.get("is_golden") else 1,
    }


def resolve_mode_info(mode_id: str) -> dict[str, Any]:
    clean = (mode_id or "").strip()
    if clean in MODES_BY_ID:
        return MODES_BY_ID[clean]
    is_single = clean.startswith("mode_single_") or clean.startswith("mode_training_")
    if clean == "mode_single_funny":
        return {"name": "极速模拟", "is_single": True, "max_round": 9, "boss_rounds": [9], "shop_slots": {}}
    return {
        "name": "",
        "is_single": is_single,
        "max_round": 15,
        "boss_rounds": [14, 15],
        "shop_slots": {},
    }


def get_shop_slots(mode_id: str, shop_level: int) -> dict[str, int]:
    level = max(1, min(6, int(shop_level or 1)))
    info = resolve_mode_info(mode_id)
    slots = (info.get("shop_slots") or {}).get(str(level))
    if isinstance(slots, dict):
        return {
            "char": int(slots.get("char") or 4),
            "item": int(slots.get("item") or 1),
            "upgrade_price": int(slots.get("upgrade_price") or 0),
        }
    return dict(DEFAULT_SHOP_SLOTS.get(level, DEFAULT_SHOP_SLOTS[4]))


def _extract_char_number(char_id: str) -> int | None:
    parts = (char_id or "").strip().split("_")
    if len(parts) >= 3 and parts[0] in ("char", "token") and parts[1].isdigit():
        return int(parts[1])
    return None


def resolve_char_by_numeric_id(identifier: int, squad_char_ids: tuple[str, ...] = ()) -> tuple[str, str]:
    """Unambiguously map numeric operator/chess identifier to (char_id, display_name)."""
    if identifier < 0:
        return ("", "")
    # 1. Exact V3_1 chess identifier lookup (0..309)
    chess_entry = CHESS_BY_IDENTIFIER.get(identifier)
    if chess_entry is not None and chess_entry.get("char_id"):
        cid = str(chess_entry["char_id"])
        if not squad_char_ids or cid in squad_char_ids:
            return (cid, resolve_operator_name(cid))
    if identifier <= 0:
        return ("", "")
    # 2. Match numeric segment inside squad char_ids (e.g., 1035 -> char_1035_wisdel)
    if squad_char_ids:
        matches = [cid for cid in dict.fromkeys(squad_char_ids) if _extract_char_number(cid) == identifier]
        if len(matches) == 1:
            cid = matches[0]
            return (cid, resolve_operator_name(cid))
    # 3. Fallback to global catalog numeric segment if unique
    catalog_matches = [cid for cid in OPERATOR_NAMES_BY_CHAR_ID if _extract_char_number(cid) == identifier]
    if len(catalog_matches) == 1:
        cid = catalog_matches[0]
        return (cid, OPERATOR_NAMES_BY_CHAR_ID[cid])
    return ("", "")
