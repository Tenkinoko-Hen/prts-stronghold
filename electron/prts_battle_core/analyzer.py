"""Local analyzer from the user-provided ArkLogs Beta 0.2.6 source.

The Windows capture adapter, UI, shop upload, and report persistence are separate.
"""
from collections import Counter
from dataclasses import dataclass, field
from itertools import count
from .stats import BOSS_ROUNDS, MatchStats
from .tcp import TcpStream
from .wire import WireDecoder, WireError, decode_message

# 给乱序段留出补齐时间，之后仍须有对端的累计 ACK 才跳过缺口。
_GAP_GRACE = 0.5

@dataclass
class Connection:
    generation: int
    streams: dict = field(default_factory=lambda: {'up': TcpStream(), 'down': TcpStream()})
    decoder: WireDecoder = field(default_factory=WireDecoder)
    initial_syn: int | None = None
    closed: bool = False
    model: MatchStats = field(default_factory=MatchStats)
    player: int | None = None
    match_key: tuple | None = None
    serial: int | None = None
    boss_round: int | None = None
    local_finishes: dict = field(default_factory=dict)
    last_phase: tuple[int, str] | None = None
    pending_plan: tuple | None = None
    tcp_gap_details: dict[str, dict] = field(default_factory=dict)
    shop_states: dict = field(default_factory=dict)
    shop_pending: tuple | None = None
class Analyzer:
    def __init__(self, shop_recorder=None):
        self.shop_recorder = shop_recorder
        self.wire_ordinal = 0
        self.connections = {}
        self.connection_generations = count(1)
        self.current: tuple[tuple, Connection] | None = None
        self.matches: dict[tuple, tuple[MatchStats, int | None, int]] = {}
        self.match_serial = 0
        self.packet_count = 0
        self.message_count = 0
        self.parse_errors = 0
        self.parse_error_details = {}
        self.reassembly_errors = 0
        self.unknown = Counter()
        self.report_events = Counter()
        self.scene_candidate_rejections = 0

    @property
    def waiting_streams(self) -> int:
        return sum(bool(stream.pending) for conn in self.connections.values()
                   if not self._superseded(conn) for stream in conn.streams.values())

    def _superseded(self, conn: Connection) -> bool:
        match = self.matches.get(conn.match_key) if conn.match_key is not None else None
        return match is not None and match[2] > conn.generation

    def accept(self, segment, direction):
        self.packet_count += 1
        client, server = (segment.src, segment.dst) if direction == 'up' else (segment.dst, segment.src)
        key = (client, server)
        conn = self.connections.get(key)
        has_data = segment.payload or segment.syn or segment.fin or segment.rst
        if conn is None and not has_data:
            return
        fresh_syn = direction == 'up' and segment.syn and not segment.ack
        if conn is None or (fresh_syn and conn.initial_syn != segment.seq):
            if conn is not None:
                conn.closed = True
            conn = Connection(next(self.connection_generations))
            self.connections[key] = conn
        if self._superseded(conn):
            return
        if fresh_syn:
            conn.initial_syn = segment.seq
        ack_sequence = getattr(segment, 'ack_sequence', None)
        if ack_sequence is not None and not (segment.syn or segment.rst):
            conn.streams['down' if direction == 'up' else 'up'].acknowledge(ack_sequence)
        if not has_data:
            return
        stream = conn.streams[direction]
        previous_seq = stream.next_seq
        try:
            data = stream.feed(segment.seq, segment.payload, syn=segment.syn)
        except ValueError:
            conn.shop_pending = None
            conn.shop_states.clear()
            self.reassembly_errors += 1
            gap = conn.tcp_gap_details.get(direction)
            if gap and gap['status'] == 'waiting':
                gap['status'] = 'reset'
            conn.streams[direction] = TcpStream()
            conn.decoder.reset(direction)
            conn.last_phase = None
            return
        self._note_gap(conn, direction, previous_seq, segment.time)
        self._consume(conn, key, direction, data)
        if segment.rst or (direction == 'down' and segment.fin):
            conn.closed = True

    def _note_gap(self, conn, direction, previous_seq, observed_at):
        stream = conn.streams[direction]
        missing = stream.missing_bytes
        gap = conn.tcp_gap_details.get(direction)
        waiting = gap is not None and gap['status'] == 'waiting'
        if not missing:
            if waiting:
                gap['status'] = 'filled'
        elif waiting and previous_seq == stream.next_seq:
            gap['missing_bytes'] = missing
        else:
            number, phase = conn.last_phase or (None, None)
            conn.tcp_gap_details[direction] = {
                'direction': direction, 'status': 'waiting', 'missing_bytes': missing,
                'time': observed_at, 'round': number, 'phase': phase,
            }

    def resume_acknowledged_gaps(self, now: float) -> None:
        for key, conn in self.connections.items():
            if self._superseded(conn):
                continue
            for direction in conn.streams:
                gap = conn.tcp_gap_details.get(direction)
                if not gap or gap['status'] != 'waiting' or now - gap['time'] < _GAP_GRACE:
                    continue
                stream = conn.streams[direction]
                previous_seq = stream.next_seq
                data = stream.resume_acknowledged()
                if not data:
                    continue
                gap['status'] = 'resumed'
                # 缺口两侧的半帧不能拼接，也不再沿用可能已过期的阶段。
                conn.decoder.reset(direction)
                if direction == 'down':
                    conn.last_phase = None
                    conn.boss_round = None
                    conn.model.current_round = 0
                conn.pending_plan = None
                conn.shop_pending = None
                conn.shop_states.clear()
                self._note_gap(conn, direction, previous_seq, now)
                self._consume(conn, key, direction, data, recovered=True)

    def _consume(self, conn, key, direction, data, *, recovered=False):
        if not data:
            return
        rejected = conn.decoder.scene_candidate_rejections
        messages = conn.decoder.feed(direction, data)
        self.scene_candidate_rejections += conn.decoder.scene_candidate_rejections - rejected
        for msg in messages:
            self.wire_ordinal += 1
            try:
                event = decode_message(msg)
            except WireError as exc:
                self.parse_errors += 1
                error_key = f'{direction} {msg.message_id}'
                previous = self.parse_error_details.pop(error_key, None)
                self.parse_error_details[error_key] = {'count': previous['count'] + 1 if previous else 1, 'direction': direction, 'message_id': msg.message_id, 'body_length': len(msg.body), 'offset': exc.offset, 'reason': str(exc)}
                if msg.message_id in [300, 302]:
                    conn.last_phase = None
                if msg.message_id in [300, 302, 306, 354]:
                    conn.shop_pending = None
                    conn.shop_states.clear()
                continue
            if event is None:
                if msg.message_id > 2:
                    self.unknown[f'{direction} {msg.message_id}'] += 1
                continue
            self.message_count += 1
            if msg.message_id in (300, 302, 303, 311, 313):
                self.report_events[msg.message_id] += 1
            first_full = msg.message_id == 300 and conn.match_key is None
            if event['kind'] == 'phase' and not self._identify_match(conn, event):
                continue
            self._apply(conn, event)
            if conn.serial is None and (conn.model.rounds or conn.model.spawn_plan or conn.model.battle_config):
                self.match_serial += 1
                conn.serial = self.match_serial
            if event['kind'] == 'phase' and conn.match_key is not None:
                self.matches[conn.match_key] = (conn.model, conn.serial, conn.generation)
            if self.shop_recorder:
                self.shop_recorder.accept(conn, event, self.wire_ordinal)
            active = self.current[1] if self.current else None
            confirmed_scene = event['kind'] == 'phase' and (event['round'] or event.get('mode_id'))
            # 建连顺序不是对局顺序。首次取得身份的完整场景优先于仅有上行结算的临时战报。
            replaces_partial = (first_full and conn.match_key is not None
                                and active is not None and active.match_key is None
                                and not active.model.current_round and active.last_phase is None)
            if (not conn.closed and (active is None
                    or replaces_partial
                    or (conn.serial is not None and active.serial is None)
                    or (conn.generation > active.generation and (
                        (conn.match_key is not None and conn.match_key == active.match_key)
                        or (conn.serial is not None and active.closed)
                        or (not recovered and confirmed_scene
                            and (conn.match_key is not None or active.match_key is None)))))):
                self.current = (key, conn)

    def _identify_match(self, conn: Connection, event: dict) -> bool:
        uid = event.get('self_uid')
        if 'stage_seed' not in event or not event.get('players'):
            if uid in range(1, 5):
                conn.player = uid
            return True
        game = (event.get('stage_id'), event['stage_seed'], tuple(sorted(event['players'].items())))
        same_game = conn.match_key is not None and conn.match_key[:3] == game
        reset_partial = (conn.match_key is None and event['phase'] == 'loading'
                         and event['round'] == 0 and bool(conn.model.rounds))
        if uid not in range(1, 5):
            uid = conn.player if same_game or (conn.match_key is None and not reset_partial) else None
        fingerprint = (*game, uid)
        if fingerprint not in self.matches:
            # 同一地图种子和队伍只有一个候选时，缺失席位不应制造第二局。
            compatible = [key for key in self.matches if key[:3] == game and (uid is None or key[3] is None)]
            if len(compatible) == 1:
                fingerprint = compatible[0]
        previous = self.matches.get(fingerprint)
        if previous and previous[2] > conn.generation:
            return False
        conn.player = uid if uid is not None else fingerprint[3]
        if fingerprint == conn.match_key:
            return True
        conn.shop_pending = None
        conn.shop_states.clear()
        if previous and conn.match_key is None and not reset_partial:
            # 全量场景确认同一局后，补回新连接先收到的独立回合与预告。
            previous[0].merge_reconnect(conn.model)
        if previous or conn.match_key is not None or reset_partial:
            conn.model, conn.serial = previous[:2] if previous else (MatchStats(), None)
            conn.boss_round = None
        if conn.match_key is not None or reset_partial:
            conn.local_finishes.clear()
            conn.pending_plan = None
        conn.match_key = fingerprint
        conn.last_phase = None
        return True

    def _apply(self, conn, event):
        kind = event['kind']
        if kind == 'spawn_plan':
            source = f"上行 {event['message_id']}"
            if conn.match_key is None:
                # 预告自带目标回合；不能用未来预告推断游戏已进入该回合。
                conn.model.add_spawn_plan(event['previews'], source)
            else:
                # 已有对局身份时，先等场景确认，避免把下一局预告串进当前局。
                conn.pending_plan = (event['previews'], source)
            return
        else:
            if kind == 'preparation':
                preparation = event['preparation']
                seat, hp, number = preparation[:3]
                if 1 <= seat <= 4 and 1 <= number <= 15:
                    if conn.last_phase and conn.last_phase[0] > number:
                        return
                    if conn.last_phase and conn.last_phase[0] == number and conn.last_phase[1] not in ('prep', 'special_prep'):
                        return
                    if seat in conn.model.eliminated:
                        return  # 准备快照没有复活标记；以服务端 runtime 的确认结果为准。
                    conn.model.observe_round(number)
                    conn.model.set_players({seat: ''})
                    conn.model.set_prep_extras(number, preparation)
                    if hp > 0:
                        conn.model.set_player_status(number, {seat: {'hp': hp}})
                return None
            else:
                if kind == 'phase':
                    number = event['round']
                    if event.get('players'):
                        conn.model.set_players(event['players'])
                    if event.get('mode_id'):
                        conn.model.battle_config = {key: event[key] for key in ['mode_id', 'boss_id', 'hidden_boss_id']}
                    if event.get('enemy_types'):
                        conn.model.enemy_types = event['enemy_types']
                    if conn.pending_plan:
                        if event['phase'] != 'end':
                            conn.model.add_spawn_plan(*conn.pending_plan)
                        conn.pending_plan = None
                    previews = event['spawn_preview']
                    conn.model.add_spawn_plan(previews, '下行', number)
                    if not number and event['phase'] == 'loading':
                        conn.model.current_round = 0
                        conn.last_phase = None
                        conn.boss_round = None
                    if number:
                        phase = event['phase']
                        hp_costs = event.get('last_hp_cost')
                        if hp_costs:
                            cost_round = number - 1 if phase in ('prep', 'special_prep') else number
                            conn.model.set_hp_costs(cost_round, hp_costs)
                            if conn.last_phase == (number - 1, 'self') and phase in ('prep', 'special_prep'):
                                conn.model.set_help_skipped(number - 1, hp_costs)
                            else:
                                if conn.last_phase == (number, 'self') and phase == 'settle':
                                        conn.model.set_help_skipped(number, hp_costs)
                        conn.last_phase = (number, phase)
                        conn.model.set_phase(number, phase)
                        if any((1 <= preview.round_number <= 15 for preview in previews)):
                            previews = tuple((preview for preview in previews if preview.round_number == number))
                        conn.model.set_spawns(number, previews, event['spawn_groups'], event['boss_spawns'])
                        if phase in ['prep', 'special_prep', 'self', 'boss']:
                            conn.model.set_global_effects(number, event['global_effects'])
                        if phase in ['prep', 'special_prep']:
                            for preparation in event['preparations']:
                                conn.model.set_prep_extras(number, preparation, event['player_status'])
                        if number in BOSS_ROUNDS and event['boss_plan']:
                                conn.model.set_boss_plan(number, event['boss_plan'])
                        if event.get('escaped_players') is not None:
                            conn.model.set_leaks(number, event['escaped_players'], escaped_enemies=event['escaped_enemies'], escaped_details=event['escaped_details'])
                        previous_boss = conn.boss_round
                        if previous_boss is not None and (number != previous_boss or phase in ('settle', 'end')):
                                conn.model.finish_boss_round(previous_boss)
                                conn.boss_round = None
                        if phase == 'boss' and number in BOSS_ROUNDS:
                                conn.boss_round = number
                                conn.model.set_boss_hp(number, event.get('boss_hp'))
                        if phase == 'settle':
                            if number == previous_boss or number in event.get('boss_record_rounds', ()):
                                conn.model.set_boss_hp(number, event.get('boss_hp'))
                                conn.model.set_boss_totals(number, event['runtime'], at_settlement=True)
                                conn.model.finish_boss_round(number)
                model = conn.model
                if kind in ('phase', 'runtime') and event.get('player_status'):
                        model.set_player_status(model.current_round, event['player_status'])
                if kind in ('phase', 'runtime') and event.get('runtime'):
                        model.set_players(dict.fromkeys(event['runtime'], ''))
                        if conn.boss_round is not None:
                            model.set_boss_totals(conn.boss_round, event['runtime'])
                if kind == 'boss_ratio':
                    boss_round = conn.boss_round
                    if boss_round is None:
                        if conn.last_phase and conn.last_phase[1] == 'settle':
                                boss_round = conn.last_phase[0]
                    if boss_round is not None:
                        model.set_boss_ratio(boss_round, event['uid'], event['ratio'])
                if kind == 'step':
                    if event.get('uplink') and event.get('uid') in range(1, 5):
                            conn.player = event['uid']
                    for seq, actions in event['steps']:
                        model.add_step(seq, actions, uplink=event.get('uplink', False), uid=event.get('uid'))
                if kind == 'help_kill':
                    model.add_help_kill(event['enemy_inst_id'], event['is_token'], event['credited_uid'])
                if kind == 'help_finish':
                    model.set_help_finish(event['round'], event['kills'], from_rejoin=event['from_rejoin'])
                if kind == 'self_finish' and not event['from_rejoin'] and 1 <= event['round'] <= 15:
                        number = event['round']
                        model.observe_round(number)
                        conn.local_finishes[number] = event
                        if conn.player is None:
                            conn.player = model.identify_own_player(number, event['escaped_ids'])
                if conn.player in range(1, 5):
                    if conn.local_finishes:
                        for number, finish in conn.local_finishes.items():
                            model.set_self_leaks(number, conn.player, finish['escaped_count'], escaped_ids=finish['escaped_ids'], token_ids=finish['escaped_token_ids'])
                        conn.local_finishes.clear()
    def snapshot(self) -> dict:
        key, conn = self.current if self.current else (None, None)
        summary = {
            "match": conn.serial if conn else None,
            "packets": self.packet_count,
            "messages": self.message_count,
            "parse_errors": self.parse_errors,
            "parse_error_details": list(reversed(self.parse_error_details.values())),
            "tcp_errors": self.reassembly_errors,
            "tcp_gaps": sum(bool(s.pending) for s in conn.streams.values()) if conn else 0,
            "tcp_gap_details": [dict(gap) for gap in conn.tcp_gap_details.values()] if conn else [],
            "tcp_midstream": bool(conn and not all(s.saw_syn for s in conn.streams.values())),
            "server": list(key[1]) if key else None,
            "self": conn.player if conn else None,
            "round": conn.model.current_round if conn else 0,
            "unknown_messages": dict(self.unknown.most_common(40)),
        }
        match = conn.model.snapshot() if conn else {"players": {}, "rounds": {}}
        if conn and conn.player is None:
            for number, finish in conn.local_finishes.items():
                if number in match['rounds']:
                    match['rounds'][number]['unassigned_self_leaks'] = finish['escaped_count']
        return {"capture": summary, **match}
