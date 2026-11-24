# 青逝痕 Tenkinoko 制作
# Decompiled with PyLingual (https://pylingual.io)
# Internal filename: 'arklog_beta\\wire.py'
# Bytecode version: 3.12.0rc2 (3531)
# Source timestamp: 1970-01-01 00:00:00 UTC (0)

# ***<module>: Failure: Different bytecode
"""PC-CN V3_1 AutoChess framing and battle messages.\n\nLayouts follow the GameAssembly build CF7956BF88A61986… and the matching\nIL2CPP declarations. ServerNetMsgSerializer uses ByteArray\'s big-endian\nlength and ID, followed by the unchanged body.\n"""
from dataclasses import dataclass, field
import struct
from typing import NamedTuple
_HEADER = struct.Struct('!II')
_MAX_BODY = 131072
_BOSS_HIT_RATIOS = {7: 0.2, 8: 0.5, 9: 0.8}
_DOWN_MIN_BODY = {300: 52, 302: 33, 306: 4, 310: 2, 344: 2, 348: 10, 366: 7}
_UP_MIN_BODY = {303: 2, 311: 10, 313: 6, 341: 7, 367: 11}
_PHASES = {1: 'loading', 2: 'special_prep', 3: 'prep', 4: 'self', 5: 'assist', 6: 'boss', 7: 'settle', 8: 'end', 9: 'pause', 100: 'battle_wait', 101: 'boss_wait', 102: 'prep', 103: 'special_prep', 104: 'boss'}
_STATES = (*range(10), *range(100, 105))
class SpawnPreview(NamedTuple):
    enemy_type: int
    enemy_id: str
    action_index: int
    count: int
    round_number: int
class SpawnGroup(NamedTuple):
    player: int
    enemy_id: str
    action_index: int
    effect_id: int
    instances: tuple[int, ...]
class EscapedEnemy(NamedTuple):
    owner: int
    instance: int
    is_token: bool
    enemy_id: str
    is_special: bool
class WireError(ValueError):
    """A recognized message body contradicts the supported wire layout."""
    def __init__(self, reason: str, *, offset: int | None=None):
        super().__init__(reason)
        self.offset = offset
        self.roster = None
        self.scene_round = None


def find_downstream_phase(data: bytes, minimum_round: int = 1) -> tuple[int, int, str] | None:
    """Locate the first decodable 300/302 phase frame inside buffered downlink bytes."""
    offset = 4
    while (offset := data.find(b'\x00\x00\x01', offset)) != -1:
        start = offset - 4
        offset += 1
        if start + _HEADER.size > len(data):
            return None
        length, message_id = _HEADER.unpack_from(data, start)
        end = start + _HEADER.size + length
        if message_id not in (300, 302) or not (_DOWN_MIN_BODY[message_id] <= length <= _MAX_BODY) or end > len(data):
            continue
        try:
            event = decode_message(Message(message_id, data[start + _HEADER.size:end], 'down'))
        except WireError:
            continue
        if event and event['kind'] == 'phase' and max(1, minimum_round) <= event['round'] <= 15:
            return (start, event['round'], event['phase'])
    return None
@dataclass(frozen=True, slots=True)
class Message:
    message_id: int
    body: bytes
    direction: str
@dataclass
class _Stream:
    pending: bytearray = field(default_factory=bytearray)
    aligned: bool = False
class WireDecoder:
    """Read messages from the contiguous TCP byte streams of one connection."""
    def __init__(self):
        self._streams = {direction: _Stream() for direction in ['up', 'down']}
        self.scene_candidate_rejections = 0
    def reset(self, direction: str) -> None:
        self._streams[direction] = _Stream()
    def feed(self, direction: str, data: bytes) -> list[Message]:
        stream = self._streams[direction]
        pending = stream.pending
        pending.extend(data)
        anchor_ids = _UP_MIN_BODY if direction == "up" else _DOWN_MIN_BODY
        heartbeat = 1 if direction == "up" else 2
        messages = []
        offset = 0
        while len(pending) - offset >= _HEADER.size:
            length, message_id = _HEADER.unpack_from(pending, offset)
            start = offset + _HEADER.size
            end = start + length
            if length > _MAX_BODY or not 0 < message_id < 65536:
                stream.aligned = False
                offset += 1
                continue
            if not stream.aligned:
                is_heartbeat = message_id == heartbeat and length == 12
                minimum = anchor_ids.get(message_id)
                if not is_heartbeat and (minimum is None or length < minimum):
                    offset += 1
                    continue
                # 结算帧的首字节是实际回合。已经看见无效回合时，无需等齐声明长度。
                if (direction == "up" and message_id in (311, 313)
                        and start < len(pending) and not 1 <= pending[start] <= 15):
                    offset += 1
                    continue
                invalid_scene = direction == "down" and (
                    (message_id == 300 and start + 2 <= len(pending)
                     and int.from_bytes(pending[start:start + 2], "big") > length - 2)
                    or (message_id == 302 and (
                        (start + 3 <= len(pending) and (pending[start + 1] not in _STATES or pending[start + 2] > 15))
                        or (start + 13 <= len(pending) and int.from_bytes(pending[start + 11:start + 13], "big") > 4))))
                if invalid_scene:
                    self.scene_candidate_rejections += 1
                    offset += 1
                    continue
                if end > len(pending):
                    # 可能是真的分片；正文里的字节不能作为下一帧的边界。
                    break
                if not is_heartbeat:
                    candidate = Message(message_id, bytes(pending[start:end]), direction)
                    try:
                        if decode_message(candidate) is None:
                            offset += 1
                            continue
                    except WireError as exc:
                        # 0.2.19: 开局 R0/R1 的 300 帧若已完整解出 roster+banned_units，允许对齐并交由上层提取禁选。
                        partial_opening = (
                            direction == "down" and message_id == 300
                            and bool((exc.roster or {}).get('banned_units'))
                            and exc.scene_round in (0, 1)
                        )
                        if not partial_opening:
                            if direction == "down" and message_id in (300, 302):
                                self.scene_candidate_rejections += 1
                            offset += 1
                            continue
                stream.aligned = True
            if end > len(pending):
                break
            messages.append(Message(message_id, bytes(pending[start:end]), direction))
            offset = end
        del pending[:offset]
        return messages

class _Reader:
    def __init__(self, body: bytes):
        self.body = body
        self.offset = 0
    def take(self, size: int) -> bytes:
        start = self.offset
        end = start + size
        if end > len(self.body):
            raise WireError('message body ended before its declared fields', offset=start)
        else:
            self.offset = end
            return self.body[start:self.offset]
    def read(self, fmt: str) -> tuple:
        return struct.unpack('!' + fmt, self.take(struct.calcsize('!' + fmt)))
    def count(self) -> int:
        start = self.offset
        count, = self.read('H')
        if count > len(self.body) - self.offset:
            raise WireError('collection length exceeds remaining message body', offset=start)
        else:
            return count
    def string(self) -> str:
        return self.take(self.count()).decode('utf-8', errors='replace')
    def ints(self) -> tuple[int, ...]:
        return self.read(f'{self.count()}i')
    def boolean(self) -> bool:
        value, = self.read('B')
        return bool(value)
    def finish(self) -> None:
        if self.offset != len(self.body):
            raise WireError('unread bytes after the last message field', offset=self.offset)
_CHAR_CHESS = (4, ('list', (4,)), 5)
_EQUIP_OR_TRAP = (6,)
_POSITION_UNIT = (10,)
_BOND = (7,)
_SP_PREPARE_SLOT = ('str', 2)
_DEPLOYMENT = (1, ('list', _CHAR_CHESS), ('list', _EQUIP_OR_TRAP), ('list', _EQUIP_OR_TRAP), ('list', _POSITION_UNIT), ('list', _BOND))
_PREPARATION_BEFORE_ENEMIES = (7, ('list', (5,)), 1, *_DEPLOYMENT[1:], ('list', (('list', _SP_PREPARE_SLOT), 'str')), 1)
_PREPARATION_AFTER_ENEMIES = (('list', (3,)), 1, ('list', (5, 'str', ('list', (4,)))))
_SP_PREPARATION = (('list', _SP_PREPARE_SLOT), ('list', (2,)), 'str', 10)
_SQUAD_SLOT = ('str', 'str', 'str', 'str', 'str', 'str', 3, ('list', ('str',)), 1)
_CHAR_BATTLE_STATUS = (7,)
def _skip(reader: _Reader, fields: tuple) -> None:
    for field in fields:
        if isinstance(field, int):
            reader.take(field)
        else:
            if field == 'str':
                reader.take(reader.count())
            else:
                _, child = field
                count = reader.count()
                if len(child) == 1 and isinstance(child[0], int):
                    reader.take(count * child[0])
                else:
                    for _ in range(count):
                        _skip(reader, child)
def _runtime(reader: _Reader) -> tuple[dict[int, int], dict[int, dict]]:
    """AutoChessBattlePlayerRuntimeInfo list: Boss damage, and HP with the finish flag, per seat."""
    damage, status = ({}, {})
    count = reader.count()
    if count > 4:
        raise WireError('player runtime list exceeds four slots')
    else:
        for _ in range(count):
            uid, finished, connection, _, hp, state, _, _, _, boss = reader.read('BBBBhBBBBi')
            damage[uid] = boss
            status[uid] = {'hp': hp, 'finished': bool(finished), 'connection': connection, 'state': state}
        return (damage, status)
def _spawn_preview(reader: _Reader) -> SpawnPreview:
    enemy_type, = reader.read('B')
    enemy_id = reader.string()
    action_index, count, number = reader.read('bBB')
    return SpawnPreview(enemy_type, enemy_id, action_index, count, number)
def _spawn_group(reader: _Reader, player: int) -> SpawnGroup:
    enemy_id = reader.string()
    action_index, effect_id = reader.read('bi')
    return SpawnGroup(player, enemy_id, action_index, effect_id, reader.ints())
def _spawn_groups(reader: _Reader) -> tuple[SpawnGroup, ...]:
    groups = []
    for _ in range(reader.count()):
        player, = reader.read('B')
        groups.extend((_spawn_group(reader, player) for _ in range(reader.count())))
    return tuple(groups)
def _escaped_enemy(reader: _Reader) -> EscapedEnemy:
    owner, = reader.read('B')
    enemy_id = reader.string()
    inst_id, = reader.read('i')
    return EscapedEnemy(owner, inst_id, reader.boolean(), enemy_id, reader.boolean())
def _special_effects(reader: _Reader) -> tuple[tuple[str, int], ...]:
    return tuple(((reader.string(), reader.read('i')[0]) for _ in range(reader.count())))
def _preparation(reader: _Reader, shops=None) -> tuple:
    player, hp, number = reader.read('BhB')
    level, _, _, _, goods_type, _, special = reader.read('7B')
    goods = [dict(zip(('slot', 'price', 'chess_id', 'frozen'), reader.read('BBHB'))) for _ in range(reader.count())]
    sequence, = reader.read('B')
    pieces = {}
    for _ in range(reader.count()):
        inst, = reader.read('i')
        reader.ints()
        pieces[inst] = reader.read('HBBB')[0]
    equips = {}
    for _ in range(reader.count()):
        inst, chess_ident = reader.read('iH')
        equips[inst] = chess_ident
    traps = {}
    for _ in range(reader.count()):
        inst, chess_ident = reader.read('iH')
        traps[inst] = chess_ident
    positions = {}
    for _ in range(reader.count()):
        inst, position, _, _ = reader.read('iiBB')
        positions[inst] = position
    bonds = [reader.take(7) for _ in range(reader.count())]
    _skip(reader, _PREPARATION_BEFORE_ENEMIES[(-2):])
    enemies = []
    for _ in range(reader.count()):
        effect, = reader.read('i')
        enemy_id = reader.string()
        count, _, _ = reader.read('BiB')
        enemies.append((effect, enemy_id, count))
    _skip(reader, _PREPARATION_AFTER_ENEMIES)
    effects = _special_effects(reader)
    skill_id = reader.string()
    reader.take(13)
    if shops is not None:
        shops.append(dict(seat=player, round=number, shop_level=level, refresh_seq=sequence, shop=goods, pieces=pieces, equips=equips, traps=traps, positions=positions, effects=effects, goods_type=goods_type, special_refresh=special, skill_id=skill_id, miracle_inactive=[bond.hex() for bond in bonds if bond[5] == 17] == ['00000000001100']))
    return (player, hp, number, tuple(enemies), effects)
def _boss_round(reader: _Reader) -> dict:
    hidden = reader.boolean()
    boss_id = reader.string()
    reader.take(2)
    groups = {}
    for _ in range(reader.count()):
        group, = reader.read('B')
        groups[group] = tuple(reader.take(reader.count()))
    return {'id': boss_id, 'hidden': hidden, 'group_sizes': [{'group': group, 'players': len(players)} for group, players in sorted(groups.items())]}
def _scene_header(reader: _Reader) -> tuple[int, int]:
    _, state, round_number, _ = reader.read('bBBq')
    if round_number > 15:
        raise WireError('scene round out of range')
    if state not in _STATES:
        raise WireError('unknown scene state')
    return (state, round_number)


def _scene(reader: _Reader, header: tuple[int, int] | None = None) -> dict:
    state, round_number = header if header is not None else _scene_header(reader)
    runtime, player_status = _runtime(reader)
    spawn_preview = tuple((_spawn_preview(reader) for _ in range(reader.count())))
    _skip(reader, (('list', _SP_PREPARATION),))
    shops = []
    preparations = tuple((_preparation(reader, shops) for _ in range(reader.count())))
    boss_rounds = tuple((_boss_round(reader) for _ in range(reader.count())))
    spawn_groups = _spawn_groups(reader)
    escaped_enemies = None
    for _ in range(reader.count()):
        escaped_enemies = tuple((_escaped_enemy(reader) for _ in range(reader.count())))
        _skip(reader, (('list', (*_DEPLOYMENT, ('list', _CHAR_BATTLE_STATUS))),))
    boss_hp = None
    boss_spawns = []
    for _ in range(reader.count()):
        _, boss_hp, _ = reader.read('Bih')
        boss_spawns.extend((_spawn_group(reader, reader.read('B')[0]) for _ in range(reader.count())))
        _skip(reader, (('list', _DEPLOYMENT),))
    last_hp_cost = dict((reader.read('Bh') for _ in range(reader.count())))
    boss_record_rounds = []
    defeated_boss_rounds = []
    boss_records_raw = []
    for _ in range(reader.count()):
        reader.take(1)
        for _ in range(reader.count()):
            reader.take(reader.count())
            defeated = reader.boolean()
            is_hidden = reader.boolean()
            boss_records_raw.append((is_hidden, defeated))
            boss_round = 15 if is_hidden else 14
            boss_record_rounds.append(boss_round)
            if defeated:
                defeated_boss_rounds.append(boss_round)
    global_effects = _special_effects(reader)
    if escaped_enemies is None:
        escaped_enemies_tuples = None
        escaped_players = None
    else:
        escaped_enemies_tuples = tuple((enemy.owner, enemy.instance, enemy.is_token) for enemy in escaped_enemies)
        escaped_players = tuple(enemy.owner for enemy in escaped_enemies)
    return {
        'kind': 'phase',
        'round': round_number,
        'state': state,
        'phase': _PHASES.get(state, 'other'),
        'runtime': runtime,
        'player_status': player_status,
        'last_hp_cost': last_hp_cost,
        'boss_record_rounds': tuple(boss_record_rounds),
        'defeated_boss_rounds': tuple(defeated_boss_rounds),
        'boss_records_raw': tuple(boss_records_raw),
        'boss_hp': boss_hp,
        'spawn_preview': spawn_preview,
        'preparations': preparations,
        'global_effects': global_effects,
        'shops': shops,
        'boss_plan': next((plan for plan in boss_rounds if plan['hidden'] == (round_number == 15)), boss_rounds[0] if boss_rounds else None),
        'boss_plans': boss_rounds,
        'spawn_groups': spawn_groups,
        'boss_spawns': tuple(boss_spawns),
        'escaped_details': escaped_enemies,
        'escaped_enemies': escaped_enemies_tuples,
        'escaped_players': escaped_players,
    }


def _roster(reader: _Reader) -> dict:
    mode_id = reader.string()
    stage_id = reader.string()
    boss_id = reader.string()
    hidden_boss_id = reader.string()
    stage_seed, = reader.read('i')
    self_uid, = reader.read('B')
    banned_bonds = tuple(reader.string() for _ in range(reader.count()))
    players = {}
    accounts = {}
    squads = {}
    banned_units = {}
    count = reader.count()
    if count > 4:
        raise WireError('player roster exceeds four slots')
    for _ in range(count):
        account = reader.take(reader.count())
        uid, = reader.read('b')
        if not 1 <= uid <= 4 or uid in players:
            raise WireError('invalid player roster seat', offset=reader.offset)
        slots = []
        for _ in range(reader.count()):
            chess_id = reader.string()
            char_id = reader.string()
            _skip(reader, ('str', 'str', 'str', 'str', 3))
            bonds = tuple(reader.string() for _ in range(reader.count()))
            slots.append(dict(chess_id=chess_id, char_id=char_id, bonds=bonds, is_banned=reader.boolean()))
        squads[uid] = slots
        _skip(reader, ('str',))
        players[uid] = reader.string()
        accounts[uid] = account
        _skip(reader, ('str', 'str', 'str', 'str', 'str', 5, 'str', 1, 'str'))
        banned_units[uid] = [
            dict(bond_id=reader.string(), chess_identifiers=[reader.read('h')[0] for _ in range(reader.count())])
            for _ in range(reader.count())
        ]
    return dict(
        players=players, accounts=accounts, self_uid=self_uid, stage_id=stage_id,
        stage_seed=stage_seed, mode_id=mode_id, boss_id=boss_id,
        hidden_boss_id=hidden_boss_id, banned_bonds=banned_bonds,
        squads=squads, banned_units=banned_units,
    )


def _full_state(reader: _Reader) -> dict:
    roster = _roster(reader)
    header = None
    try:
        header = _scene_header(reader)
        scene = _scene(reader, header)
        scene['enemy_types'] = tuple(reader.string() for _ in range(reader.count()))
        reader.finish()
    except WireError as exc:
        exc.roster = roster
        if header is not None:
            exc.scene_round = header[1]
        raise
    scene.update(roster)
    return scene
def _actions(reader: _Reader) -> tuple[tuple[int, tuple[int, ...]], ...]:
    actions = []
    for _ in range(reader.count()):
        op, = reader.read('B')
        actions.append((op, reader.ints()))
    return tuple(actions)
def _down_step(reader: _Reader) -> tuple:
    seq, _ = reader.read('ii')
    return (seq, _actions(reader))
def _help_finish(reader: _Reader) -> dict:
    round_number, = reader.read('B')
    if not 1 <= round_number <= 15:
        raise WireError('help result round out of range')
    rejoin = reader.boolean()
    escaped_enemies = tuple(_escaped_enemy(reader) for _ in range(reader.count()))
    kills = []
    for _ in range(reader.count()):
        player, = reader.read('B')
        enemy = _escaped_enemy(reader)
        reader.take(5)
        kills.append((enemy.instance, enemy.is_token, player, enemy.owner, enemy.enemy_id))
    return {'kind': 'help_finish', 'round': round_number, 'kills': tuple(kills),
            'escaped_enemies': escaped_enemies, 'from_rejoin': rejoin}
def decode_message(message: Message) -> dict | None:
    """Decode battle messages needed by the statistics model."""
    message_id = message.message_id
    reader = _Reader(message.body)
    if message.direction == 'down':
        if message_id == 300:
            result = _full_state(reader)
        else:
            if message_id == 302:
                result = _scene(reader)
            else:
                if message_id == 306:
                    shops = []
                    result = {'kind': 'preparation', 'preparation': _preparation(reader, shops), 'shops': shops}
                else:
                    if message_id == 354 and message.body[4:7] == b'\x00\x00\x01':
                        reader.take(7)
                        shops = []
                        result = {'kind': 'shop_purchase_result', 'preparation': _preparation(reader, shops), 'shops': shops}
                    else:
                        if message_id == 310:
                            runtime, player_status = _runtime(reader)
                            result = {'kind': 'runtime', 'runtime': runtime, 'player_status': player_status}
                        else:
                            if message_id == 366:
                                uid, code = reader.read('Bh')
                                if uid not in range(1, 5) or code not in _BOSS_HIT_RATIOS:
                                    return
                                else:
                                    _skip(reader, (('list', ('str',)), ('list', (4,))))
                                    result = {'kind': 'boss_ratio', 'uid': uid, 'ratio': _BOSS_HIT_RATIOS[code]}
                            else:
                                if message_id == 344:
                                    result = {'kind': 'step', 'steps': tuple((_down_step(reader) for _ in range(reader.count())))}
                                else:
                                    if message_id == 348:
                                        result = {'kind': 'step', 'steps': (_down_step(reader),)}
                                    else:
                                        return None
    else:
        if message.direction == 'up':
            if message_id == 315:
                result = {'kind': 'shop_refresh'}
            else:
                if message_id == 376:
                    reader.take(len(message.body))
                    result = {'kind': 'shop_skill'}
                else:
                    if message_id in (317, 323):
                        reader.take(len(message.body))
                        result = {'kind': 'shop_purchase' if message_id == 317 else 'shop_equip'}
                    else:
                        if message_id == 303:
                            previews = tuple((_spawn_preview(reader) for _ in range(reader.count())))
                            result = {'kind': 'spawn_plan', 'previews': previews, 'message_id': message_id}
                        else:
                            if message_id == 311:
                                round_number, = reader.read('B')
                                rejoin = reader.boolean()
                                escaped = reader.ints()
                                tokens = reader.ints()
                                _skip(reader, (('list', (9,)), ('list', _CHAR_BATTLE_STATUS)))
                                result = {'kind': 'self_finish', 'round': round_number, 'escaped_count': len(escaped) + len(tokens), 'from_rejoin': rejoin, 'escaped_ids': escaped, 'escaped_token_ids': tokens}
                            else:
                                if message_id == 313:
                                    result = _help_finish(reader)
                                else:
                                    if message_id == 341:
                                        seq, uid = reader.read('iB')
                                        result = {'kind': 'step', 'steps': ((seq, _actions(reader)),), 'uid': uid, 'uplink': True}
                                    else:
                                        if message_id == 367:
                                            inst_id, = reader.read('i')
                                            token = reader.boolean()
                                            player, _, _ = reader.read('BiB')
                                            result = {'kind': 'help_kill', 'enemy_inst_id': inst_id, 'is_token': token, 'credited_uid': player}
                                        else:
                                            return None
        else:
            raise WireError('unknown message direction')
    reader.finish()
    return result
