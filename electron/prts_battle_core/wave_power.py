# Decompiled with PyLingual (https://pylingual.io)
# Internal filename: 'arklog_beta\\wave_power.py'
# Bytecode version: 3.12.0rc2 (3531)
# Source timestamp: 1970-01-01 00:00:00 UTC (0)

"""Summarize escaped enemy power by player and planned spawn action."""
from collections import Counter, defaultdict
from ctypes import c_float
from functools import cache
import json
from pathlib import Path
from typing import NamedTuple
from .wire import EscapedEnemy, SpawnGroup, SpawnPreview
@cache
def _catalog():
    return json.loads(Path(__file__).with_name('enemy_power.json').read_text(encoding='utf-8'))
class EnemyTemplate(NamedTuple):
    name: str
    hp: int
    attack: int
    defense: int
    resistance: float
    factor: float
    level: int
def enemy_template(enemy_id: str) -> EnemyTemplate | None:
    entry = _catalog()['enemies'].get(enemy_id)
    return EnemyTemplate(*entry) if entry is not None else None
def _enemy(enemy_id):
    entry = enemy_template(enemy_id)
    if entry is None:
        return (enemy_id or '未识别', None, 1)
    else:
        name, hp, attack, defense, magic, factor, _ = entry
        raw = c_float(hp + attack * 5).value
        raw = c_float(raw + defense * 3).value
        raw = c_float(raw + magic * 3).value
        return (name or enemy_id, raw, factor)
def _power(raw, factor, count=1):
    return c_float(c_float(count * raw).value / factor).value
def player_for_escapes(groups: tuple[SpawnGroup, ...], instances: tuple[int, ...]) -> int | None:
    if not instances:
        return
    else:
        owners = {}
        for group in groups:
            for instance in group.instances:
                owners.setdefault(instance, set()).add(group.player)
        candidates = set.intersection(*(owners.get(instance, set()) for instance in instances))
        return next(iter(candidates)) if len(candidates) == 1 else None
def wave_report(groups: tuple[SpawnGroup, ...], previews: tuple[SpawnPreview, ...], escapes: tuple[EscapedEnemy, ...], confirmed_players: set[int], *, boss_groups: bool=False) -> dict:
    """Use instance identity for the join and retain unassigned escapes."""
    planned = Counter()
    instances = {}
    for group in groups:
        key = (group.player, group.action_index, group.enemy_id)
        planned[key] += len(group.instances)
        for instance in group.instances:
            inst_key = (group.player, instance)
            if instances.setdefault(inst_key, group) != group:
                instances[inst_key] = None
    if not groups:
        for preview in previews:
            planned[None, preview.action_index, preview.enemy_id] += preview.count
    escaped = defaultdict(list)
    tokens = _catalog()['tokens']
    for enemy in escapes:
        group = None if enemy.is_token else instances.get((enemy.owner, enemy.instance))
        enemy_id = enemy.enemy_id or (group.enemy_id if group else '')
        if enemy.is_token and (not enemy_id):
                enemy_id = tokens.get(str(enemy.instance >> 16), '')
        action = group.action_index if group else None
        escaped[enemy.owner, action, enemy_id].append(enemy.instance)
    rows = {}
    for player, action, enemy_id in sorted(planned.keys() | escaped.keys(), key=lambda key: (key[0] or 0, key[1] is None, key[1] if key[1] is not None else 0, key[2])):
        key = (player, action, enemy_id)
        name, raw, factor = _enemy(enemy_id)
        unit = _power(raw, factor) if raw is not None else None
        wave = rows.setdefault((player, action), {'player': player, 'action': action, 'planned': None, 'leaked': None, 'power': None, 'unpriced': 0, 'enemies': []})
        planned_count = planned.get(key)
        escaped_ids = escaped.get(key, [])
        leak_count = len(escaped_ids) if player in confirmed_players or escaped_ids else None
        if planned_count is not None:
            wave['planned'] = (wave['planned'] or 0) + planned_count
        if leak_count is not None:
            wave['leaked'] = (wave['leaked'] or 0) + leak_count
            if raw is not None or leak_count == 0:
                wave['power'] = (wave['power'] or 0) + _power(raw or 0, factor, leak_count)
            else:
                wave['unpriced'] += leak_count
        wave['enemies'].append({'id': enemy_id, 'name': name, 'planned': planned_count, 'leaked': leak_count, 'unit_power': unit, 'escaped_ids': escaped_ids})
    return {'rows': list(rows.values()), 'confirmed_players': sorted(confirmed_players), 'boss_groups': boss_groups}