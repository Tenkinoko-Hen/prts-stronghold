# 青逝痕 Tenkinoko 制作
"""Round statistics derived from decoded Garrison Protocol messages."""
from collections import Counter
from dataclasses import dataclass, field
from math import floor
import struct
from time import monotonic
from typing import Iterable, Mapping
from .operator_catalog import (
    POOL_COPIES_BY_TIER,
    SHOP_EQUIPS,
    get_shop_slots,
    resolve_char_by_numeric_id,
    resolve_chess_identifier,
    resolve_chess_tier,
    resolve_mode_info,
    resolve_operator_name,
    resolve_strategist_name,
    resolve_trap_identifier,
)
from .wave_power import EnemyInstance, _enemy, _power, player_for_escapes, resolve_enemy_id, wave_report
from .wire import EscapedEnemy, SpawnGroup, SpawnPreview
BOSS_ROUNDS = (14, 15)
HelpKill = tuple[int, bool, int] | tuple[int, bool, int, int] | tuple[int, bool, int, int, str]
StepAction = tuple[int, tuple[int, ...]]

# 官方 V3_1 act3autochess bondInfoDict 1..26 枚举号 → bondId 映射
BOND_IDENTIFIER_TO_ID: dict[int, str] = {
    1: "yanShip",
    2: "sargonShip",
    3: "victoriaShip",
    4: "kjeragShip",
    5: "egirShip",
    6: "siracusaShip",
    7: "kazimierzShip",
    8: "ursusShip",
    9: "iberiaShip",
    10: "lethaniaShip",
    11: "preciShip",
    12: "swiftShip",
    13: "skillfulShip",
    14: "steadShip",
    15: "deputShip",
    16: "visiShip",
    17: "miraShip",
    18: "investShip",
    19: "raidShip",
    20: "indomShip",
    21: "maniShip",
    22: "emptyShip",
    23: "soloShip",
    24: "suntShip",
    25: "docShip",
    26: "arcaneShip",
}


def decode_raw_bonds(raw_bonds) -> list[dict]:
    """解析 7 字节备战盟约帧：b0=激活态，b1..b2(>H)=实时层数，b5=官方1..26枚举号，b6=人数。"""
    decoded: list[dict] = []
    for item in raw_bonds or ():
        if not isinstance(item, str) or len(item) != 14:
            continue
        try:
            raw = bytes.fromhex(item)
        except ValueError:
            continue
        if len(raw) != 7:
            continue
        bond_id = BOND_IDENTIFIER_TO_ID.get(raw[5])
        if not bond_id:
            continue
        active = raw[0] != 0
        stacks = (raw[1] << 8) | raw[2]
        op_count = raw[6]
        if not active and stacks <= 0 and op_count <= 0:
            continue
        decoded.append({
            "bond_id": bond_id,
            "stacks": min(999, max(0, stacks)),
            "count": op_count,
            "active": active,
        })
    return decoded

def _enemy_outcome(enemy_id: str, count: int) -> dict:
    name, raw, factor = _enemy(enemy_id)
    return {'id': enemy_id, 'name': name, 'count': count,
            'unit_power': _power(raw, factor) if raw is not None else None}


def boss_player_damage(data: dict) -> tuple[dict[int, int], dict[int, int]]:
    """Resolve player totals and usable settlement rows from a saved round."""
    combat = data.get('boss_totals', {})
    settlement = data.get('boss_settlement', {})
    damaging_players = {row['player'] for row in data.get('boss_official', ()) if row['damage'] > 0}
    damaging_players.update((player for player, ratio in data.get('boss_ratios', {}).items() if ratio > 0))
    has_damage = bool(damaging_players) or any(combat.values()) or any(settlement.values())
    def usable(snapshot):
        if has_damage and (not any(snapshot.values())):
            return {}
        else:
            return {player: damage for player, damage in snapshot.items() if damage or player not in damaging_players}
    settled = usable(settlement)
    return ({**usable(combat), **settled}, settled)
def _single(value: float) -> float:
    return struct.unpack('=f', struct.pack('=f', value))[0]
def _avatar_percent(ratio: float) -> int:
    return floor(_single(_single(ratio) * 100))
@dataclass
class RoundStats:
    phase: str = 'other'
    leaks: Counter[int] | None = None
    local_leaks: dict[int, int] = field(default_factory=dict)
    spawn_preview: tuple[SpawnPreview, ...] = ()
    prep_extras: dict[int, tuple] = field(default_factory=dict)
    boss_plan: dict | None = None
    global_effects: tuple[tuple[str, int], ...] | None = None
    player_effects: dict[int, tuple[tuple[str, int], ...]] = field(default_factory=dict)
    spawn_groups: tuple[SpawnGroup, ...] = ()
    boss_spawns: tuple[SpawnGroup, ...] = ()
    escaped_details: tuple[EscapedEnemy, ...] | None = None
    local_escaped: dict[int, tuple[EscapedEnemy, ...]] = field(default_factory=dict)
    spawn_instances: set[tuple[int, int]] = field(default_factory=set)
    enemy_ids: dict[EnemyInstance, set[str]] = field(default_factory=dict)
    owners: dict[tuple[int, bool], int | None] = field(default_factory=dict)
    help_kills: dict[tuple[int, bool, int], HelpKill] = field(default_factory=dict)
    help_finish: tuple[HelpKill, ...] | None = None
    help_escaped: tuple[EscapedEnemy, ...] = ()
    help_finish_partial: bool = False
    skipped_hp_costs: dict[int, int] | None = None
    hp_costs: dict[int, int] = field(default_factory=dict)
    boss_totals: dict[int, int] = field(default_factory=dict)
    boss_settlement: dict[int, int] = field(default_factory=dict)
    boss_ended: bool = False
    boss_round_basis: str = ""
    boss_hp: int | None = None
    boss_ratios: dict[int, float] = field(default_factory=dict)
    boss_official: list[dict[str, int]] = field(default_factory=list)
    boss_rank_sequence: tuple[int, int] = ((-1), (-1))
    boss_uplink: Counter[tuple[int, int, int]] = field(default_factory=Counter)
    boss_uplink_seen: set[tuple[int, int | None, tuple[StepAction, ...]]] = field(default_factory=set)
    boss_started_at: float | None = None
    boss_last_at: float | None = None
    boss_timeline: list[tuple[float, float]] = field(default_factory=list)
    seat_loadouts: dict[int, dict] = field(default_factory=dict)

    def observe_enemy_id(self, owner: int, instance: int, is_token: bool, enemy_id: str) -> None:
        # Typed instance evidence survives sparse refreshes of outcome and spawn lists.
        if owner in range(1, 5) and enemy_id:
            self.enemy_ids.setdefault((owner, instance, is_token), set()).add(enemy_id)

    def enemy_id(self, owner: int | None, instance: int, is_token: bool) -> str:
        known = self.enemy_ids.get((owner, instance, is_token), ()) if owner is not None else ()
        return resolve_enemy_id(instance, is_token, known)

    def merge_help_finish(self, kills: tuple[HelpKill, ...], escaped: tuple[EscapedEnemy, ...], *, partial=False) -> None:
        # A later settlement only corrects the instances it actually lists (including ones
        # listed as escaped). Don't erase earlier evidence just because a replay is shorter.
        seen = {row[:2] for row in kills} | {(enemy.instance, enemy.is_token) for enemy in escaped}
        old_kills = tuple(row for row in self.help_finish or () if row[:2] not in seen)
        old_escaped = tuple(enemy for enemy in self.help_escaped if (enemy.instance, enemy.is_token) not in seen)
        unique = {row[:4]: row for row in old_kills}
        for row in kills:
            if row[:4] not in unique or (len(row) == 5 and row[4]):
                unique[row[:4]] = row
        self.help_finish = tuple(unique.values())
        self.help_escaped = tuple(dict.fromkeys((*old_escaped, *escaped)))
        self.help_finish_partial = partial or bool(old_kills or old_escaped)

class MatchStats:
    """Keep result snapshots and partial observations separate for one match."""
    def __init__(self):
        self.players = {}
        self.rounds = {}
        self.current_round = 0
        self.spawn_plan = {}
        self.hp = {}
        self.eliminated = {}
        self.enemy_types = ()
        self.battle_config = {}
        self.banned_bonds: tuple[str, ...] = ()
        self.defeated_boss_rounds: set[int] = set()
        self.observed_boss_rounds: set[int] = set()
        self.squads: dict[int, list[dict]] = {}
        self.banned_units: dict[int, list[dict]] = {}
        self.seat_loadouts: dict[int, dict] = {}

    def expected_boss_rounds(self) -> tuple[int, ...]:
        mode_id = str(self.battle_config.get("mode_id") or "")
        base = tuple(resolve_mode_info(mode_id).get("boss_rounds") or BOSS_ROUNDS) if mode_id else BOSS_ROUNDS
        combined = sorted(set(base) | self.observed_boss_rounds)
        return tuple(combined)

    def is_boss_round(self, round_number: int) -> bool:
        if not 1 <= round_number <= 15:
            return False
        if round_number in self.observed_boss_rounds or round_number in self.expected_boss_rounds():
            return True
        row = self.rounds.get(round_number)
        return bool(row and (row.phase == "boss" or row.boss_ended or row.boss_plan or row.boss_spawns))

    def resolve_boss_record_round(self, is_hidden: bool) -> int:
        mode_id = str(self.battle_config.get("mode_id") or "")
        base = tuple(resolve_mode_info(mode_id).get("boss_rounds") or BOSS_ROUNDS) if mode_id else BOSS_ROUNDS
        if not base:
            return 15 if is_hidden else 14
        if not is_hidden:
            return base[0]
        return base[1] if len(base) >= 2 else min(15, base[0] + 1)

    def _note_boss_progress(self, data: RoundStats) -> None:
        now = monotonic()
        if data.boss_started_at is None:
            data.boss_started_at = now
        data.boss_last_at = now
        elapsed = max(0.0, round(now - data.boss_started_at, 2))
        total_official = sum(int(r.get("damage") or 0) for r in data.boss_official)
        total_uplink = sum(data.boss_uplink.values())
        total_runtime = sum(data.boss_totals.values())
        total_settle = sum(data.boss_settlement.values())
        current_total = float(max(total_settle, total_runtime, total_official, total_uplink))
        if current_total <= 0:
            return
        if not data.boss_timeline:
            data.boss_timeline.append((elapsed, current_total))
        elif elapsed - data.boss_timeline[-1][0] >= 0.75:
            if len(data.boss_timeline) < 90:
                data.boss_timeline.append((elapsed, current_total))
            else:
                data.boss_timeline[-1] = (elapsed, current_total)
        elif current_total > data.boss_timeline[-1][1]:
            data.boss_timeline[-1] = (elapsed, current_total)

    def set_roster_squads(self, squads: Mapping | None, banned_units: Mapping | None = None) -> None:
        if squads:
            for seat, slots in squads.items():
                if seat in range(1, 5) and slots:
                    self.squads[seat] = [
                        {
                            "chess_id": str(slot.get("chess_id") or ""),
                            "char_id": str(slot.get("char_id") or ""),
                            "bonds": tuple(slot.get("bonds") or ()),
                            "is_banned": bool(slot.get("is_banned")),
                        }
                        for slot in slots
                        if slot.get("char_id") or slot.get("chess_id")
                    ]
        if banned_units:
            for seat, items in banned_units.items():
                if seat in range(1, 5) and items:
                    self.banned_units[seat] = [dict(item) for item in items]

    def set_shops(self, shops: Iterable[Mapping]) -> None:
        for shop in shops or ():
            seat = shop.get("seat")
            round_no = shop.get("round")
            if seat not in range(1, 5):
                continue
            pieces = dict(shop.get("pieces") or {})
            raw_piece_equips = shop.get("piece_equips") or {}
            piece_equips: dict[int, list[int]] = {}
            for raw_inst, raw_eq_ids in raw_piece_equips.items():
                if isinstance(raw_inst, int) and not isinstance(raw_inst, bool) and raw_eq_ids:
                    cleaned = [int(x) for x in raw_eq_ids if isinstance(x, int) and not isinstance(x, bool)]
                    if cleaned:
                        piece_equips[int(raw_inst)] = cleaned
            raw_bonds = [str(b) for b in (shop.get("raw_bonds") or ()) if isinstance(b, str) and b]
            positions = dict(shop.get("positions") or {})
            equips = dict(shop.get("equips") or {})
            traps = dict(shop.get("traps") or {})
            goods = list(shop.get("shop") or ())
            skill_id = str(shop.get("skill_id") or "")
            deployed_piece_count = sum(
                1
                for inst_id in pieces
                if isinstance(positions.get(inst_id), (int, float))
                and not isinstance(positions.get(inst_id), bool)
                and positions[inst_id] >= 0
            )
            summary = {
                "round": int(round_no) if isinstance(round_no, int) and 1 <= round_no <= 15 else self.current_round,
                "shop_level": int(shop.get("shop_level") or 0),
                "skill_id": skill_id,
                "strategist": resolve_strategist_name(skill_id),
                "piece_count": len(pieces),
                "deployed_count": deployed_piece_count,
                "pieces": pieces,
                "piece_equips": piece_equips,
                "positions": positions,
                "equips": equips,
                "traps": traps,
                "shop": goods,
                "raw_bonds": raw_bonds,
                "chess_ids": sorted({int(cid) for cid in pieces.values() if isinstance(cid, int) and cid > 0}),
            }
            prev = self.seat_loadouts.get(seat)
            if prev is None or summary["round"] >= prev.get("round", 0):
                self.seat_loadouts[seat] = summary
            if isinstance(round_no, int) and 1 <= round_no <= 15:
                self.rounds.setdefault(round_no, RoundStats()).seat_loadouts[seat] = summary

    def resolve_boss_attacker(self, player: int, attacker: int, source: int | None = None, *, official: bool = False) -> tuple[str, str]:
        if player not in range(1, 5) or attacker < 0 or (source is not None and source not in (0, 1)):
            return ("", "")
        slots = self.squads.get(player) or ()
        squad_chars = tuple(s["char_id"] for s in slots if s.get("char_id"))
        pieces = (self.seat_loadouts.get(player) or {}).get("pieces") or {}
        mapped_ident = pieces.get(attacker)
        # 1. Exact V3_1 chess identifier lookup:
        #    - For official rank rows (op=20), `attacker` IS the chess identifier (0..309).
        #    - For uplink hit rows (341 op=3), `attacker` is a board instance ID that must map via `pieces`.
        if mapped_ident is not None:
            info = resolve_chess_identifier(mapped_ident, slots)
            if info and info.get("char_id"):
                return (info["char_id"], info["name"])
        elif official:
            info = resolve_chess_identifier(attacker, slots)
            if info and info.get("char_id"):
                return (info["char_id"], info["name"])
        # 2. Numeric char_id / squad fallback (only when matched against player's known squad or mapped piece)
        candidate_num = mapped_ident if mapped_ident is not None else attacker
        if candidate_num > 0 and (mapped_ident is not None or squad_chars):
            char_id, name = resolve_char_by_numeric_id(candidate_num, squad_chars)
            if char_id:
                return (char_id, name)
        # 3. Trailing numeric segment match in chess_id if unique within player's squad
        if candidate_num > 0 and slots:
            chess_matches = [
                s["char_id"]
                for s in slots
                if s.get("char_id")
                and s.get("chess_id")
                and any(part.isdigit() and int(part) == candidate_num for part in s["chess_id"].split("_"))
            ]
            if len(set(chess_matches)) == 1:
                cid = chess_matches[0]
                return (cid, resolve_operator_name(cid))
        return ("", "")
    def add_spawn_plan(self, previews: Iterable[SpawnPreview], source: str, seen_round: int=0) -> None:
        """Keep every previewed batch under its own round, with the earliest round it was seen in.\n\n        seen_round 0 means loading, before the first round.\n        """
        for preview in previews:
            if not 1 <= preview.round_number <= 15:
                continue
            else:
                key = (preview.round_number, preview.action_index, preview.enemy_id)
                entry = self.spawn_plan.setdefault(key, {'sources': [], 'seen_round': seen_round})
                entry.update(count=preview.count, enemy_type=preview.enemy_type, seen_round=min(entry['seen_round'], seen_round))
                if source not in entry['sources']:
                    entry['sources'].append(source)
    def set_players(self, players: Mapping[int, str]) -> None:
        for player, name in players.items():
            if 1 <= player <= 4 and (name or player not in self.players):
                        self.players[player] = name
    def set_phase(self, round_number: int, phase: str) -> None:
        if round_number > 0:
            self.current_round = round_number
            data = self.rounds.setdefault(round_number, RoundStats())
            data.phase = phase
            if phase == 'boss':
                self.observed_boss_rounds.add(round_number)
                data.boss_round_basis = 'confirmed'
                if data.boss_started_at is None:
                    data.boss_started_at = monotonic()

    def observe_round(self, round_number: int) -> None:
        """Record an observed round even if its sender's seat is still unknown."""
        self.rounds.setdefault(round_number, RoundStats())

    def merge_reconnect(self, observed: 'MatchStats') -> None:
        """同一局的新连接可能先收到结算，随后才收到能确认对局身份的场景。"""
        self.set_players(observed.players)
        if observed.banned_bonds and not self.banned_bonds:
            self.banned_bonds = observed.banned_bonds
        self.defeated_boss_rounds.update(observed.defeated_boss_rounds)
        self.observed_boss_rounds.update(observed.observed_boss_rounds)
        for p, v in observed.hp.items():
            self.hp.setdefault(p, v)
        for p, r in observed.eliminated.items():
            if p not in self.eliminated or r < self.eliminated[p]:
                self.eliminated[p] = r
        for seat, slots in observed.squads.items():
            self.squads.setdefault(seat, slots)
        for seat, items in observed.banned_units.items():
            self.banned_units.setdefault(seat, items)
        for seat, loadout in observed.seat_loadouts.items():
            current = self.seat_loadouts.get(seat)
            if current is None or loadout.get("round", 0) >= current.get("round", 0):
                self.seat_loadouts[seat] = loadout
        for number, incoming in observed.rounds.items():
            row = self.rounds.setdefault(number, incoming)
            if row is incoming:
                continue
            if row.leaks is None and incoming.leaks is not None:
                row.leaks, row.escaped_details = incoming.leaks, incoming.escaped_details
            row.spawn_instances.update(incoming.spawn_instances)
            for key, ids in incoming.enemy_ids.items():
                row.enemy_ids.setdefault(key, set()).update(ids)
            if incoming.help_finish is not None:
                row.merge_help_finish(incoming.help_finish, incoming.help_escaped, partial=incoming.help_finish_partial)
            if incoming.skipped_hp_costs is not None:
                if row.skipped_hp_costs is None:
                    row.skipped_hp_costs = {}
                for player, cost in incoming.skipped_hp_costs.items():
                    row.skipped_hp_costs[player] = max(row.skipped_hp_costs.get(player, 0), cost)
            for stored, extra in ((row.local_leaks, incoming.local_leaks), (row.local_escaped, incoming.local_escaped),
                                  (row.owners, incoming.owners), (row.help_kills, incoming.help_kills),
                                  (row.boss_ratios, incoming.boss_ratios),
                                  (row.prep_extras, incoming.prep_extras), (row.player_effects, incoming.player_effects),
                (row.seat_loadouts, incoming.seat_loadouts)):
                for key, value in extra.items():
                    stored.setdefault(key, value)
            for player, cost in incoming.hp_costs.items():
                row.hp_costs[player] = max(row.hp_costs.get(player, 0), cost)
            for stored, extra in ((row.boss_totals, incoming.boss_totals), (row.boss_settlement, incoming.boss_settlement)):
                for uid, damage in extra.items():
                    if uid not in stored or (damage > 0 and stored[uid] == 0):
                        stored[uid] = damage
            row.boss_ended = row.boss_ended or incoming.boss_ended
            if incoming.boss_round_basis == "confirmed" or not row.boss_round_basis:
                row.boss_round_basis = incoming.boss_round_basis
            if row.boss_hp is None:
                row.boss_hp = incoming.boss_hp
            if not row.boss_official:
                row.boss_official, row.boss_rank_sequence = incoming.boss_official, incoming.boss_rank_sequence
            if row.phase == 'other' or (row.phase in ('prep', 'special_prep')
                                        and incoming.phase in ('self', 'assist', 'boss', 'settle', 'end')) or (
                    row.phase == 'boss' and incoming.boss_ended and incoming.phase in ('settle', 'end')):
                row.phase = incoming.phase
        for key, preview in observed.spawn_plan.items():
            stored = self.spawn_plan.setdefault(key, preview)
            if stored is not preview:
                stored['seen_round'] = min(stored['seen_round'], preview['seen_round'])
                stored['sources'].extend(source for source in preview['sources'] if source not in stored['sources'])

    def set_spawns(self, round_number: int, previews: tuple[SpawnPreview, ...], groups: tuple[SpawnGroup, ...], boss_spawns: tuple[SpawnGroup, ...]) -> None:
        data = self.rounds[round_number]
        if previews:
            data.spawn_preview = previews
        if groups:
            players = {group.player for group in groups}
            data.spawn_groups = tuple((group for group in data.spawn_groups if group.player not in players)) + groups
            for group in groups:
                if group.player in range(1, 5):
                    for instance in group.instances:
                        data.spawn_instances.add((group.player, instance))
                        data.observe_enemy_id(group.player, instance, False, group.enemy_id)
        if boss_spawns:
            data.boss_spawns = boss_spawns

    def set_prep_extras(self, round_number: int, preparation: tuple, player_status: Mapping | None=None) -> None:
        player, hp, number, enemies, effects = preparation
        data = self.rounds.get(round_number)
        if data is None or number != round_number or player not in range(1, 5):
            return None
        else:
            status = (player_status or {}).get(player, {})
            if status.get('hp', hp) <= 0 or status.get('finished'):
                data.prep_extras.pop(player, None)
                data.player_effects.pop(player, None)
            else:
                data.prep_extras[player] = enemies
                data.player_effects[player] = effects
    def set_global_effects(self, round_number: int, effects: tuple[tuple[str, int], ...]) -> None:
        self.rounds[round_number].global_effects = effects
    def set_boss_plan(self, round_number: int, plan: dict) -> None:
        self.rounds[round_number].boss_plan = plan
    def identify_own_player(self, round_number: int, instances: tuple[int, ...]) -> int | None:
        data = self.rounds.get(round_number)
        return player_for_escapes(data.spawn_instances, instances) if data else None
    def identify_player_from_help(self, round_number: int, escaped_ids: tuple[int, ...],
                                  token_ids: tuple[int, ...]) -> int | None:
        """Use a complete, unambiguous same-round join, never just the number of leaks."""
        data = self.rounds.get(round_number)
        local = {(instance, token) for ids, token in ((escaped_ids, False), (token_ids, True))
                 for instance in ids}
        if not data or data.help_finish is None or not local:
            return None
        by_owner: dict[int, set[tuple[int, bool]]] = {}
        evidence = [(enemy.instance, enemy.is_token, enemy.owner) for enemy in data.help_escaped]
        evidence += [(row[0], row[1], row[3] if len(row) >= 4 else None) for row in data.help_finish]
        for instance, token, owner in evidence:
            key = (instance, token)
            if owner in range(1, 5):
                by_owner.setdefault(owner, set()).add(key)
            elif key in local:
                return None
        matches = [(owner, instances) for owner, instances in by_owner.items() if local & instances]
        if len(matches) == 1:
            owner, instances = matches[0]
            if instances == local and all(data.owners.get(key, owner) == owner for key in local):
                return owner
        return None

    def own_leak_enemies(self, round_number: int, player: int | None, local) -> list[dict]:
        """Name local escape instances. Token types do not require a known seat."""
        data = self.rounds[round_number]
        if local is None:
            wanted = {(enemy.instance, enemy.is_token) for enemy in data.local_escaped.get(player, ())}
        else:
            wanted = {(instance, token) for field, token in (('escaped_ids', False), ('escaped_token_ids', True))
                      for instance in local[field]}
        counts = Counter()
        for instance, is_token in wanted:
            enemy_id = data.enemy_id(player, instance, is_token)
            if enemy_id:
                counts[enemy_id] += 1
        return [_enemy_outcome(enemy_id, count) for enemy_id, count in sorted(counts.items())]

    def set_leaks(self, round_number: int, escaped_players: Iterable[int] | Mapping[int, int], *, escaped_enemies: Iterable[tuple[int, int, bool]]=(), escaped_details: tuple[EscapedEnemy, ...] | None=None) -> None:
        """Record the server\'s list of monsters entering the cooperative stage."""
        data = self.rounds.setdefault(round_number, RoundStats())
        for enemy in escaped_details or ():
            data.observe_enemy_id(enemy.owner, enemy.instance, enemy.is_token, enemy.enemy_id)
        if data.leaks is None:
            data.leaks = Counter(escaped_players)
            data.escaped_details = escaped_details
            self.set_players(dict.fromkeys(data.leaks, ''))
            for owner, instance, is_token in escaped_enemies:
                key = (instance, is_token)
                if data.owners.setdefault(key, owner) != owner:
                    data.owners[key] = None
    def set_self_leaks(self, round_number: int, player: int, count: int, *, from_rejoin: bool=False, escaped_ids: tuple[int, ...] | None=None, token_ids: tuple[int, ...]=()) -> None:
        if not from_rejoin:
            if 1 <= player <= 4:
                data = self.rounds.setdefault(round_number, RoundStats())
                data.local_leaks[player] = count
                if escaped_ids is not None:
                    data.local_escaped[player] = tuple((EscapedEnemy(player, instance, is_token, '', False) for ids, is_token in ((escaped_ids, False), (token_ids, True)) for instance in ids))
                self.set_players({player: ''})
    def add_help_kill(self, enemy_inst_id: int, is_token: bool, credited_uid: int, *, round_number: int | None=None) -> None:
        data = self.rounds.get(self.current_round if round_number is None else round_number)
        if data is not None and (round_number is not None or data.phase == 'assist'):
                key = (enemy_inst_id, is_token, credited_uid)
                data.help_kills.setdefault(key, key)
                self.set_players({credited_uid: ''})
    def set_help_finish(self, round_number: int, kills: Iterable[HelpKill], *, from_rejoin: bool=False,
                        escaped_enemies: tuple[EscapedEnemy, ...]=()) -> None:
        current = self.rounds.get(round_number)
        previous = self.rounds.get(round_number - 1)
        if current and current.phase in ('prep', 'special_prep'):
                if previous and previous.phase == 'assist':
                        round_number -= 1
        data = self.rounds.setdefault(round_number, RoundStats())
        rows = tuple(kills)
        for enemy in escaped_enemies:
            data.observe_enemy_id(enemy.owner, enemy.instance, enemy.is_token, enemy.enemy_id)
        for instance, is_token, _killer, *detail in rows:
            if len(detail) == 2:
                owner, enemy_id = detail
                data.observe_enemy_id(owner, instance, is_token, enemy_id)
        if from_rejoin:
            for row in rows:
                key = (row[0], row[1], row[2])
                if len(row) >= 4 or key not in data.help_kills:
                    data.help_kills[key] = row
        else:
            data.merge_help_finish(rows, escaped_enemies)
        # The settlement can identify both sides even when the player roster was missed.
        self.set_players(dict.fromkeys((seat for row in rows for seat in row[2:4]), ''))
        self.set_players(dict.fromkeys((enemy.owner for enemy in escaped_enemies), ''))
    def set_hp_costs(self, round_number: int, hp_costs: Mapping[int, int]) -> None:
        """HP each player lost in a round, from the server's last-battle results."""
        if not 1 <= round_number <= 15:
            return None
        costs = {player: cost for player, cost in hp_costs.items() if 1 <= player <= 4 and cost >= 0}
        data = self.rounds.setdefault(round_number, RoundStats())
        for player, cost in costs.items():
            data.hp_costs[player] = max(data.hp_costs.get(player, 0), cost)
            if data.skipped_hp_costs is not None:
                data.skipped_hp_costs[player] = max(data.skipped_hp_costs.get(player, 0), cost)

    def set_player_status(self, round_number: int, status: Mapping[int, Mapping], *, phase: str = "") -> None:
        """未结算的零血不覆盖观测值；后续正血量撤销淘汰标记。"""
        for player, entry in status.items():
            if not 1 <= player <= 4:
                continue
            hp = entry['hp']
            if hp <= 0 and entry.get('finished') is False:
                continue
            self.hp[player] = hp
            if hp > 0:
                self.eliminated.pop(player, None)
            elif round_number > 0:
                elim_round = max(1, round_number - 1) if phase in ('prep', 'special_prep') and round_number > 1 else round_number
                self.eliminated.setdefault(player, elim_round)
    def set_help_skipped(self, round_number: int, hp_costs: Mapping[int, int]) -> None:
        # irreducible cflow, using cdg fallback
        data = self.rounds[round_number]
        if data.leaks is None and (not data.help_kills) and (data.help_finish is None):
            if data.skipped_hp_costs is None:
                data.skipped_hp_costs = {}
            for player, cost in hp_costs.items():
                if 1 <= player <= 4 and cost >= 0:
                    data.skipped_hp_costs[player] = max(data.skipped_hp_costs.get(player, 0), cost)
            self.set_players(dict.fromkeys(data.skipped_hp_costs, ''))
    def set_boss_totals(self, round_number: int, totals: Mapping[int, int], *, at_settlement: bool = False, inferred: bool = False) -> None:
        """Keep combat totals and the same-round settlement packet separately."""
        if not self.is_boss_round(round_number):
            return None
        clean = {uid: damage for uid, damage in totals.items() if 1 <= uid <= 4 and damage >= 0}
        if not clean:
            return None
        self.observed_boss_rounds.add(round_number)
        data = self.rounds.setdefault(round_number, RoundStats())
        target = data.boss_settlement if at_settlement else data.boss_totals
        # End/refresh can reset the runtime fields without correcting any damage.
        if not any(clean.values()) and any(target.values()):
            return
        target.update(clean)
        data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
        if not at_settlement:
            for player, damage in clean.items():
                if damage > 0:
                    data.boss_ratios.pop(player, None)
        self._note_boss_progress(data)
        self.set_players(dict.fromkeys(clean, ""))

    def set_boss_hp(self, round_number: int, hp: int | None) -> None:
        if hp is None:
            return
        if hp > 0:
            self.observed_boss_rounds.add(round_number)
            self.rounds.setdefault(round_number, RoundStats()).boss_hp = hp

    def set_boss_ratio(self, round_number: int, uid: int, ratio: float, *, inferred: bool = False) -> None:
        if self.is_boss_round(round_number):
            if 1 <= uid <= 4:
                self.observed_boss_rounds.add(round_number)
                data = self.rounds.setdefault(round_number, RoundStats())
                data.boss_ratios[uid] = ratio
                data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
                self.set_players({uid: ''})

    def finish_boss_round(self, round_number: int) -> None:
        self.observed_boss_rounds.add(round_number)
        self.rounds.setdefault(round_number, RoundStats()).boss_ended = True

    def add_step(self, round_number: int, seq: int, actions: Iterable[StepAction], *, uplink: bool=False, uid: int | None=None, inferred: bool=False) -> None:
        data = self.rounds.get(round_number)
        if not self.is_boss_round(round_number) or data is None or (uplink and not inferred and data.phase != 'boss'):
            return None
        else:
            if uplink:
                hits = tuple(((op, tuple(params)) for op, params in actions if op == 3 and len(params) == 4))
                key = (seq, uid, hits)
                if hits and key not in data.boss_uplink_seen:
                    data.boss_uplink_seen.add(key)
                    recorded = False
                    for _, (damage, attacker, source, player) in hits:
                        if 0 < damage < 300000 and 1 <= player <= 4:
                            data.boss_uplink[player, attacker, source] += damage
                            self.set_players({player: ''})
                            recorded = True
                    if recorded:
                        self.observed_boss_rounds.add(round_number)
                        data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
                        self._note_boss_progress(data)
                return None
            else:
                for index, (op, params) in enumerate(actions):
                    sequence = (seq, index)
                    if op != 20 or not params or len(params) % 3 or (sequence <= data.boss_rank_sequence):
                        continue
                    else:
                        self.observed_boss_rounds.add(round_number)
                        data.boss_official = [{'player': player, 'identifier': identifier, 'damage': damage} for player, identifier, damage in zip(params[::3], params[1::3], params[2::3])]
                        data.boss_rank_sequence = sequence
                        data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
                        self._note_boss_progress(data)
                        self.set_players(dict.fromkeys(params[::3], ''))
    def snapshot(self) -> dict:
        players = dict(sorted(self.players.items()))
        rounds = {}
        for round_number, data in sorted(self.rounds.items()):
            hp_costs = dict(data.skipped_hp_costs or {})
            for player, cost in data.hp_costs.items():
                hp_costs[player] = max(hp_costs.get(player, 0), cost)
            help_recorded = data.help_finish is not None
            help_complete = help_recorded and not data.help_finish_partial
            help_skipped = data.skipped_hp_costs is not None and not help_recorded and not data.help_kills
            complete_or_skipped = help_complete or help_skipped
            help_owners = {}
            for enemy in data.help_escaped:
                key = (enemy.instance, enemy.is_token)
                owner = enemy.owner if enemy.owner in range(1, 5) else None
                if key in help_owners and help_owners[key] != owner:
                    help_owners[key] = None
                else:
                    help_owners.setdefault(key, owner)
            for row in data.help_finish or ():
                key = (row[0], row[1])
                owner = row[3] if len(row) >= 4 and row[3] in range(1, 5) else None
                if key in help_owners and help_owners[key] != owner:
                    help_owners[key] = None
                else:
                    help_owners.setdefault(key, owner)
            help_leaks = Counter(owner for owner in help_owners.values() if owner in range(1, 5))
            help_owners_complete = help_complete and all(owner in range(1, 5) for owner in help_owners.values())
            help_matches_local = all(help_leaks[player] == count for player, count in data.local_leaks.items())
            help_leaks_complete = help_owners_complete and help_matches_local
            leak_minimums = {} if data.leaks is not None or help_leaks_complete else {
                player: count for player, count in help_leaks.items()
                if count > 0 and player not in data.local_leaks
            }
            uncovered_leaks = Counter()
            uncovered_enemies = Counter()
            for enemy in data.help_escaped:
                if help_owners.get((enemy.instance, enemy.is_token)) == enemy.owner and enemy.owner in range(1, 5):
                    uncovered_leaks[enemy.owner] += 1
                    enemy_id = data.enemy_id(enemy.owner, enemy.instance, enemy.is_token) or enemy.enemy_id
                    if enemy_id:
                        uncovered_enemies[enemy.owner, enemy_id] += 1
            kills = data.help_finish if data.help_finish is not None else data.help_kills.values()
            assist = Counter((row[2] for row in kills))
            assisted_others = Counter()
            assist_pairs = Counter()
            assist_enemies = Counter()
            unknown_owner = Counter()
            for instance, token, player, *detail in kills:
                owner = detail[0] if detail else data.owners.get((instance, token))
                if owner not in range(1, 5) or player not in range(1, 5):
                    unknown_owner[player] += 1
                else:
                    assist_pairs[player, owner] += 1
                    enemy_id = data.enemy_id(owner, instance, token)
                    if enemy_id:
                        assist_enemies[player, owner, enemy_id] += 1
                    if owner != player:
                        assisted_others[player] += 1
            uplink = Counter()
            for (player, _attacker, _source), damage in data.boss_uplink.items():
                if player in players:
                    uplink[player] += damage
            mode_id = str(self.battle_config.get("mode_id") or "")
            is_single_mode = bool(mode_id and resolve_mode_info(mode_id).get("is_single"))
            active_seats = [1] if is_single_mode else [
                p for p in range(1, 5)
                if p not in self.eliminated or round_number <= self.eliminated[p]
            ]
            if not active_seats:
                active_seats = [1] if is_single_mode else list(range(1, 5))
            if data.leaks is not None:
                leaks = {
                    p: data.leaks[p]
                    for p in range(1, 5)
                    if p in active_seats or data.leaks[p] > 0
                }
                leaks_status = "reported"
            elif help_leaks_complete:
                leaks = {
                    p: help_leaks[p]
                    for p in range(1, 5)
                    if p in active_seats or help_leaks[p] > 0
                }
                leaks_status = "reported"
            else:
                leaks = dict(data.local_leaks)
                for player, count in help_leaks.items():
                    if player not in leaks:
                        leaks[player] = count
                leaks_status = "observed" if data.local_leaks or help_recorded else "unknown"
            rounds[round_number] = {
                "phase": data.phase,
                "leaks": leaks,
                "leaks_status": leaks_status,
                "leak_minimums": leak_minimums,
                "uncovered_leaks": dict(uncovered_leaks),
                "uncovered_status": "reported" if help_leaks_complete else ("observed" if help_recorded else "unknown"),
                "assists": {p: assist[p] for p in players if complete_or_skipped or p in assist},
                "assists_status": "reported" if help_complete else ("skipped" if help_skipped else ("observed" if help_recorded or kills else "unknown")),
                "assists_others": {p: assisted_others[p] for p in players if assisted_others[p] or (complete_or_skipped and not unknown_owner[p])},
                "assists_others_status": "reported" if help_complete and not unknown_owner else ("skipped" if help_skipped else ("observed" if assisted_others else "unknown")),
                "unattributed_assists": sum(unknown_owner.values()),
                "assist_pairs": [{"killer": killer, "owner": owner, "count": count} for (killer, owner), count in sorted(assist_pairs.items())],
                "assist_enemies": [{"killer": killer, "owner": owner, **_enemy_outcome(enemy_id, count)}
                                   for (killer, owner, enemy_id), count in sorted(assist_enemies.items())],
                "uncovered_enemies": [{"owner": owner, **_enemy_outcome(enemy_id, count)}
                                      for (owner, enemy_id), count in sorted(uncovered_enemies.items())],
                "hp_costs": hp_costs,
                "boss_totals": dict(data.boss_totals),
                "boss_status": "unknown",
                "boss_official": [
                    {
                        **dict(row),
                        **(
                            {"char_id": cid, "operator_name": op_name}
                            if (cid_pair := self.resolve_boss_attacker(row["player"], row["identifier"], official=True))[0]
                            and (cid := cid_pair[0]) and (op_name := cid_pair[1])
                            else {}
                        ),
                    }
                    for row in data.boss_official
                ],
                "boss_uplink": dict(uplink),
                "boss_uplink_rows": [
                    {
                        "player": player,
                        "attacker": attacker,
                        "source": source,
                        "damage": damage,
                        **(
                            {"char_id": cid, "operator_name": op_name}
                            if (cid_pair := self.resolve_boss_attacker(player, attacker, source))[0]
                            and (cid := cid_pair[0]) and (op_name := cid_pair[1])
                            else {}
                        ),
                    }
                    for (player, attacker, source), damage in data.boss_uplink.items()
                ],
            }
            result = rounds[round_number]
            if data.boss_plan:
                result["boss_plan"] = data.boss_plan
            if data.global_effects is not None:
                result["global_effects"] = [list(effect) for effect in data.global_effects]
            if data.player_effects:
                result["player_effects"] = [
                    {"player": player, "effects": [list(effect) for effect in effects]}
                    for player, effects in sorted(data.player_effects.items())
                ]
            if data.prep_extras:
                result["prep_extras"] = [
                    {"player": player, "effect": effect, "enemy_id": enemy_id, "count": count}
                    for player, enemies in sorted(data.prep_extras.items())
                    for effect, enemy_id, count in enemies
                    if count
                ]
            if (data.spawn_groups or data.spawn_preview or data.boss_spawns
                    or data.escaped_details is not None or data.local_escaped or data.help_escaped):
                if data.escaped_details is not None:
                    escaped = data.escaped_details
                    confirmed = set(players)
                elif data.local_escaped:
                    escaped = tuple((enemy for entries in data.local_escaped.values() for enemy in entries))
                    confirmed = set(data.local_escaped)
                else:
                    escaped = data.help_escaped
                    confirmed = set()
                result["wave_power"] = wave_report(
                    data.spawn_groups or data.boss_spawns,
                    data.spawn_preview,
                    escaped,
                    confirmed,
                    enemy_ids=data.enemy_ids,
                    boss_groups=bool(data.boss_spawns and not data.spawn_groups),
                )
            if help_skipped:
                costs = data.skipped_hp_costs
                exact = result["leaks"]
                minimums = dict(result["leak_minimums"])
                for p, cost in costs.items():
                    if cost > 0 and p not in exact:
                        minimums[p] = max(minimums.get(p, 0), 1)
                result["skipped_hp_costs"] = dict(costs)
                result["leak_minimums"] = minimums
                result["all_players_leaked"] = (not is_single_mode) and bool(active_seats) and all(
                    exact.get(p, minimums.get(p, 0)) > 0 for p in active_seats
                )
            if not self.is_boss_round(round_number):
                continue
            result["boss_settlement"] = dict(data.boss_settlement)
            result["boss_ended"] = data.boss_ended
            result["boss_round_basis"] = data.boss_round_basis
            result["boss_hp"] = data.boss_hp
            result["boss_ratios"] = dict(data.boss_ratios)
            if data.boss_started_at is not None and data.boss_last_at is not None:
                result["boss_duration"] = round(max(1.0, data.boss_last_at - data.boss_started_at), 2)
            if data.boss_timeline:
                result["boss_timeline"] = [[t, d] for t, d in data.boss_timeline]
            damage, usable_settlement = boss_player_damage(result)
            result["boss_damage"] = damage
            ratios = dict(data.boss_ratios)
            if data.boss_hp:
                for player, value in damage.items():
                    ratios.setdefault(player, _single(value) / _single(data.boss_hp))
                for player, value in usable_settlement.items():
                    ratios[player] = _single(value) / _single(data.boss_hp)
            result["boss_percent"] = {player: _avatar_percent(ratio) for player, ratio in ratios.items()}
            result["boss_status"] = "settlement" if usable_settlement else ("reported" if result["boss_damage"] else "unknown")
        plan = []
        for (round_number, action, enemy_id), entry in sorted(self.spawn_plan.items()):
            name, raw, factor = _enemy(enemy_id)
            plan.append(
                {
                    "round": round_number,
                    "action": action,
                    "enemy_id": enemy_id,
                    "name": name,
                    "unit_power": _power(raw, factor) if raw is not None else None,
                    **entry,
                    "sources": list(entry["sources"]),
                }
            )
        battle_config = dict(self.battle_config)
        mode_id = str(battle_config.get("mode_id") or "")
        mode_info = resolve_mode_info(mode_id) if mode_id else {}
        if mode_info.get("name"):
            battle_config["mode_name"] = mode_info["name"]
        if mode_info.get("max_round"):
            battle_config["max_round"] = int(mode_info["max_round"])
        if self.banned_bonds:
            battle_config["banned_bonds"] = list(self.banned_bonds)
        lineups = {}
        for seat in sorted(set(self.squads) | set(self.seat_loadouts)):
            loadout = self.seat_loadouts.get(seat) or {}
            slots = self.squads.get(seat) or ()
            pieces = loadout.get("pieces") or {}
            piece_equips = loadout.get("piece_equips") or {}
            positions = loadout.get("positions") or {}
            raw_equips = loadout.get("equips") or {}
            raw_traps = loadout.get("traps") or {}
            raw_shop = loadout.get("shop") or ()

            deployed = []
            bench = []
            for inst_id, chess_ident in pieces.items():
                resolved = resolve_chess_identifier(chess_ident, slots)
                if resolved is None:
                    cid, cname = self.resolve_boss_attacker(seat, inst_id)
                    if not cid and isinstance(chess_ident, int) and chess_ident > 0:
                        cid, cname = resolve_char_by_numeric_id(chess_ident, tuple(s["char_id"] for s in slots if s.get("char_id")))
                    resolved = {
                        "identifier": chess_ident,
                        "chess_id": "",
                        "char_id": cid or f"piece_{chess_ident}",
                        "name": cname or f"干员 #{chess_ident}",
                        "tier": 0,
                        "is_golden": False,
                        "copies": 1,
                    }
                item = {
                    "inst_id": int(inst_id),
                    "chess_id": resolved["chess_id"],
                    "char_id": resolved["char_id"],
                    "name": resolved["name"],
                    "tier": resolved["tier"],
                    "is_golden": resolved["is_golden"],
                    "equip_ids": [int(x) for x in piece_equips.get(inst_id, ())],
                }
                pos_val = positions.get(inst_id)
                if isinstance(pos_val, (int, float)) and not isinstance(pos_val, bool) and pos_val >= 0:
                    deployed.append(item)
                else:
                    bench.append(item)

            seat_equips = []
            for inst_id, equip_ident in (*raw_equips.items(), *raw_traps.items()):
                tinfo = resolve_trap_identifier(equip_ident)
                if tinfo:
                    seat_equips.append({
                        "inst_id": int(inst_id),
                        "identifier": tinfo["identifier"],
                        "chess_id": tinfo["chess_id"],
                        "trap_id": tinfo["trap_id"],
                        "name": tinfo["name"],
                        "tier": tinfo["tier"],
                        "is_golden": tinfo["is_golden"],
                        "item_type": tinfo["item_type"],
                        **({"give_bond_id": tinfo["give_bond_id"]} if tinfo.get("give_bond_id") else {}),
                    })

            shop_goods = []
            for g in raw_shop:
                cid = g.get("chess_id")
                if not isinstance(cid, int):
                    continue
                cinfo = resolve_chess_identifier(cid, slots)
                if cinfo:
                    shop_goods.append({
                        "kind": "operator",
                        "slot": int(g.get("slot") or 0),
                        "price": int(g.get("price") or 0),
                        "frozen": bool(g.get("frozen")),
                        "char_id": cinfo["char_id"],
                        "name": cinfo["name"],
                        "tier": cinfo["tier"],
                    })
                    continue
                tinfo = resolve_trap_identifier(cid)
                if tinfo:
                    shop_goods.append({
                        "kind": "equip",
                        "slot": int(g.get("slot") or 0),
                        "price": int(g.get("price") or 0),
                        "frozen": bool(g.get("frozen")),
                        "trap_id": tinfo["trap_id"],
                        "chess_id": tinfo["chess_id"],
                        "name": tinfo["name"],
                        "tier": tinfo["tier"],
                    })

            active_bonds = decode_raw_bonds(loadout.get("raw_bonds"))
            lineups[seat] = {
                "round": loadout.get("round") or None,
                "shop_level": loadout.get("shop_level") or None,
                "skill_id": loadout.get("skill_id") or "",
                "strategist": loadout.get("strategist") or "",
                "piece_count": len(deployed) + len(bench),
                "deployed_count": len(deployed),
                "deployed": deployed,
                "bench": bench,
                "equips": seat_equips,
                "shop_goods": shop_goods,
                "squad": [
                    {
                        "chess_id": slot["chess_id"],
                        "char_id": slot["char_id"],
                        "name": resolve_operator_name(slot["char_id"]),
                        "bonds": list(slot["bonds"]),
                        "is_banned": slot["is_banned"],
                    }
                    for slot in slots
                ],
                **({"active_bonds": active_bonds} if active_bonds else {}),
            }

        boss_rounds = sorted(self.expected_boss_rounds())
        deck_pool = self._build_deck_pool(lineups, mode_id)
        return {
            "players": players,
            "rounds": rounds,
            "spawn_plan": plan,
            "enemy_types": list(self.enemy_types),
            "hp": dict(sorted(self.hp.items())),
            "eliminated": dict(sorted(self.eliminated.items())),
            "battle_config": battle_config,
            "boss_rounds": boss_rounds,
            "defeated_boss_rounds": sorted(self.defeated_boss_rounds),
            "lineups": lineups,
            **({"deck_pool": deck_pool} if deck_pool is not None else {}),
        }

    def _build_deck_pool(self, lineups: Mapping[int, Mapping], mode_id: str) -> dict | None:
        if not self.squads and not self.seat_loadouts:
            return None
        mode_info = resolve_mode_info(mode_id) if mode_id else {}
        is_single = bool(mode_info.get("is_single"))
        banned_bonds = set(self.banned_bonds)

        # 1. Build unified unbanned operator pool from roster squads
        op_pool: dict[str, dict] = {}
        for seat, slots in self.squads.items():
            for slot in slots:
                char_id = str(slot.get("char_id") or "")
                chess_id = str(slot.get("chess_id") or "")
                if not char_id or slot.get("is_banned"):
                    continue
                tier = resolve_chess_tier(chess_id)
                if tier <= 0:
                    continue
                entry = op_pool.get(char_id)
                if entry is None:
                    op_pool[char_id] = {
                        "char_id": char_id,
                        "name": resolve_operator_name(char_id),
                        "tier": tier,
                        "bonds": list(slot.get("bonds") or ()),
                        "total_copies": POOL_COPIES_BY_TIER.get(tier, 8),
                        "taken_by": {},
                        "in_shop_seats": [],
                    }
                else:
                    if not entry["bonds"] and slot.get("bonds"):
                        entry["bonds"] = list(slot["bonds"])

        # 2. Subtract held pieces of ALIVE players (eliminated players return cards to shared pool)
        for seat, loadout in self.seat_loadouts.items():
            if seat in self.eliminated:
                continue
            slots = self.squads.get(seat) or ()
            pieces = loadout.get("pieces") or {}
            for _inst, chess_ident in pieces.items():
                resolved = resolve_chess_identifier(chess_ident, slots)
                if not resolved or not resolved.get("char_id"):
                    continue
                cid = resolved["char_id"]
                tier = resolved["tier"] or 1
                copies = int(resolved.get("copies") or 1)
                entry = op_pool.setdefault(
                    cid,
                    {
                        "char_id": cid,
                        "name": resolved["name"],
                        "tier": tier,
                        "bonds": [],
                        "total_copies": POOL_COPIES_BY_TIER.get(tier, 8),
                        "taken_by": {},
                        "in_shop_seats": [],
                    },
                )
                entry["taken_by"][seat] = entry["taken_by"].get(seat, 0) + copies
            for g in (lineups.get(seat) or {}).get("shop_goods") or ():
                if g.get("kind") == "operator" and g.get("char_id") in op_pool:
                    if seat not in op_pool[g["char_id"]]["in_shop_seats"]:
                        op_pool[g["char_id"]]["in_shop_seats"].append(seat)

        operators_out = []
        tier_stats = {t: {"tier": t, "operator_kinds": 0, "total_copies": 0, "taken_copies": 0, "remaining_copies": 0, "equip_kinds": 0} for t in range(1, 7)}
        for entry in sorted(op_pool.values(), key=lambda x: (x["tier"], x["char_id"])):
            taken_total = sum(entry["taken_by"].values())
            remaining = max(0, entry["total_copies"] - taken_total)
            operators_out.append({
                "char_id": entry["char_id"],
                "name": entry["name"],
                "tier": entry["tier"],
                "bonds": entry["bonds"],
                "total_copies": entry["total_copies"],
                "taken_by": {str(k): v for k, v in sorted(entry["taken_by"].items())},
                "taken_total": taken_total,
                "remaining": remaining,
                "in_shop_seats": entry["in_shop_seats"],
            })
            ts = tier_stats.get(entry["tier"])
            if ts is not None:
                ts["operator_kinds"] += 1
                ts["total_copies"] += entry["total_copies"]
                ts["taken_copies"] += min(entry["total_copies"], taken_total)
                ts["remaining_copies"] += remaining

        # 3. Build shop equipment pool and count held equips among ALIVE players
        equip_taken: dict[str, dict[int, int]] = {}
        equip_in_shop: dict[str, list[int]] = {}
        for seat, loadout in self.seat_loadouts.items():
            if seat in self.eliminated:
                continue
            for _inst, ident in (*(loadout.get("equips") or {}).items(), *(loadout.get("traps") or {}).items()):
                tinfo = resolve_trap_identifier(ident)
                if not tinfo or not tinfo.get("trap_id"):
                    continue
                tid = tinfo["trap_id"]
                equip_taken.setdefault(tid, {})
                equip_taken[tid][seat] = equip_taken[tid].get(seat, 0) + int(tinfo.get("copies") or 1)
            for g in (lineups.get(seat) or {}).get("shop_goods") or ():
                if g.get("kind") == "equip" and g.get("trap_id"):
                    lst = equip_in_shop.setdefault(g["trap_id"], [])
                    if seat not in lst:
                        lst.append(seat)

        equips_out = []
        for eq in SHOP_EQUIPS:
            tid = eq["trap_id"]
            give_bond = eq.get("give_bond_id") or ""
            bond_banned = bool(give_bond and give_bond in banned_bonds)
            if bond_banned:
                continue
            taken_by = equip_taken.get(tid) or {}
            tier = int(eq.get("tier") or 1)
            equips_out.append({
                "trap_id": tid,
                "chess_id": eq["chess_id"],
                "name": eq["name"],
                "tier": tier,
                "item_type": eq.get("item_type") or "EQUIP",
                "give_bond_id": give_bond,
                "taken_by": {str(k): v for k, v in sorted(taken_by.items())},
                "taken_total": sum(taken_by.values()),
                "in_shop_seats": equip_in_shop.get(tid, []),
            })
            ts = tier_stats.get(tier)
            if ts is not None:
                ts["equip_kinds"] += 1

        shop_slots = {str(lv): get_shop_slots(mode_id, lv) for lv in range(1, 7)}
        return {
            "mode_id": mode_id,
            "is_single": is_single,
            "shop_slots": shop_slots,
            "tier_summary": [tier_stats[t] for t in range(1, 7)],
            "operators": operators_out,
            "equips": equips_out,
        }
