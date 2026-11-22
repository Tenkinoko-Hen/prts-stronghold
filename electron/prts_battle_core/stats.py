# Decompiled with PyLingual (https://pylingual.io)
# Internal filename: 'arklog_beta\\stats.py'
# Bytecode version: 3.12.0rc2 (3531)
# Source timestamp: 1970-01-01 00:00:00 UTC (0)

"""Round statistics derived from decoded Garrison Protocol messages."""
from collections import Counter
from dataclasses import dataclass, field
from math import floor
import struct
from typing import Iterable, Mapping
from .wave_power import EnemyInstance, _enemy, _power, player_for_escapes, resolve_enemy_id, wave_report
from .wire import EscapedEnemy, SpawnGroup, SpawnPreview
BOSS_ROUNDS = (14, 15)
HelpKill = tuple[int, bool, int] | tuple[int, bool, int, int] | tuple[int, bool, int, int, str]
StepAction = tuple[int, tuple[int, ...]]

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
            self.rounds.setdefault(round_number, RoundStats()).phase = phase

    def observe_round(self, round_number: int) -> None:
        """Record an observed round even if its sender's seat is still unknown."""
        self.rounds.setdefault(round_number, RoundStats())

    def merge_reconnect(self, observed: 'MatchStats') -> None:
        """同一局的新连接可能先收到结算，随后才收到能确认对局身份的场景。"""
        self.set_players(observed.players)
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
                                  (row.prep_extras, incoming.prep_extras), (row.player_effects, incoming.player_effects)):
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

    def set_player_status(self, round_number: int, status: Mapping[int, Mapping]) -> None:
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
                self.eliminated.setdefault(player, round_number)
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
        if round_number not in BOSS_ROUNDS:
            return None
        clean = {uid: damage for uid, damage in totals.items() if 1 <= uid <= 4 and damage >= 0}
        if not clean:
            return None
        data = self.rounds.setdefault(round_number, RoundStats())
        target = data.boss_settlement if at_settlement else data.boss_totals
        # End/refresh can reset the runtime fields without correcting any damage.
        if not any(clean.values()) and any(target.values()):
            return
        target.update(clean)
        data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
        if not at_settlement:
            for player in clean:
                data.boss_ratios.pop(player, None)
        self.set_players(dict.fromkeys(clean, ""))

    def set_boss_hp(self, round_number: int, hp: int | None) -> None:
        if hp is None:
            return
        # ***<module>.MatchStats.set_boss_hp: Failure: Different control flow
        if hp is None or hp > 0:
                self.rounds[round_number].boss_hp = hp
    def set_boss_ratio(self, round_number: int, uid: int, ratio: float, *, inferred: bool = False) -> None:
        if round_number in BOSS_ROUNDS:
            if 1 <= uid <= 4:
                self.rounds[round_number].boss_ratios[uid] = ratio
                data = self.rounds[round_number]
                data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
                self.set_players({uid: ''})
    def finish_boss_round(self, round_number: int) -> None:
        self.rounds[round_number].boss_ended = True
    def add_step(self, round_number: int, seq: int, actions: Iterable[StepAction], *, uplink: bool=False, uid: int | None=None, inferred: bool=False) -> None:
        data = self.rounds.get(round_number)
        if round_number not in BOSS_ROUNDS or data is None or (uplink and data.phase != 'boss'):
            return None
        else:
            if uplink:
                hits = tuple(((op, tuple(params)) for op, params in actions if op == 3 and len(params) == 4))
                key = (seq, uid, hits)
                if hits and key not in data.boss_uplink_seen:
                    data.boss_uplink_seen.add(key)
                    for _, (damage, attacker, source, player) in hits:
                        if 0 < damage < 300000:
                                data.boss_uplink[player, attacker, source] += damage
                                self.set_players({player: ''})
                return None
            else:
                for index, (op, params) in enumerate(actions):
                    sequence = (seq, index)
                    if op != 20 or not params or len(params) % 3 or (sequence <= data.boss_rank_sequence):
                        continue
                    else:
                        data.boss_official = [{'player': player, 'identifier': identifier, 'damage': damage} for player, identifier, damage in zip(params[::3], params[1::3], params[2::3])]
                        data.boss_rank_sequence = sequence
                        data.boss_round_basis = "inferred" if inferred and data.boss_round_basis != "confirmed" else "confirmed"
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
            for enemy in data.help_escaped:
                if help_owners.get((enemy.instance, enemy.is_token)) == enemy.owner and enemy.owner in range(1, 5):
                    uncovered_leaks[enemy.owner] += 1
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
            if data.leaks is not None:
                leaks = {p: data.leaks[p] for p in range(1, 5)}
                leaks_status = "reported"
            elif help_leaks_complete:
                leaks = {p: help_leaks[p] for p in range(1, 5)}
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
                "hp_costs": hp_costs,
                "boss_totals": dict(data.boss_totals),
                "boss_status": "unknown",
                "boss_official": [dict(row) for row in data.boss_official],
                "boss_uplink": dict(uplink),
                "boss_uplink_rows": [
                    {"player": player, "attacker": attacker, "source": source, "damage": damage}
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
            if data.spawn_groups or data.spawn_preview or data.boss_spawns or data.escaped_details is not None or data.local_escaped:
                if data.escaped_details is not None:
                    escaped = data.escaped_details
                    confirmed = set(players)
                else:
                    escaped = tuple((enemy for entries in data.local_escaped.values() for enemy in entries))
                    confirmed = set(data.local_escaped)
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
                result["all_players_leaked"] = all(
                    exact.get(p, minimums.get(p, 0)) > 0 for p in range(1, 5)
                )
            if round_number not in BOSS_ROUNDS:
                continue
            result["boss_settlement"] = dict(data.boss_settlement)
            result["boss_ended"] = data.boss_ended
            result["boss_round_basis"] = data.boss_round_basis
            result["boss_hp"] = data.boss_hp
            result["boss_ratios"] = dict(data.boss_ratios)
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
        return {
            "players": players,
            "rounds": rounds,
            "spawn_plan": plan,
            "enemy_types": list(self.enemy_types),
            "hp": dict(sorted(self.hp.items())),
            "eliminated": dict(sorted(self.eliminated.items())),
            "battle_config": dict(self.battle_config),
        }
