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
    client_finished: bool = False
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
        self.boss_events = Counter()
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
            if direction == 'down':
                self._invalidate_phase(conn)
            return
        self._note_gap(conn, direction, previous_seq, segment.time)
        self._consume(conn, key, direction, data)
        if direction == 'up' and segment.fin:
            conn.client_finished = True
        if segment.rst or (direction == 'down' and segment.fin):
            conn.closed = True
        if conn.closed or conn.client_finished:
            self._promote_after_close()

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
                    self._invalidate_phase(conn)
                conn.pending_plan = None
                conn.shop_pending = None
                conn.shop_states.clear()
                self._note_gap(conn, direction, previous_seq, now)
                self._consume(conn, key, direction, data, recovered=True)

    @staticmethod
    def _invalidate_phase(conn: Connection) -> None:
        conn.last_phase = None
        conn.boss_round = None
        conn.model.current_round = 0

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
                    self._invalidate_phase(conn)
                if msg.message_id in [300, 302, 306, 354]:
                    conn.shop_pending = None
                    conn.shop_states.clear()
                continue
            if event is None:
                if msg.message_id > 2:
                    self.unknown[f'{direction} {msg.message_id}'] += 1
                continue
            self._record_event(conn, key, msg.message_id, event, recovered=recovered)

    @staticmethod
    def _loading(event: dict) -> bool:
        return event['kind'] == 'phase' and event['round'] == 0 and event['phase'] == 'loading'

    @staticmethod
    def _reset_match(conn: Connection) -> None:
        conn.model = MatchStats()
        conn.match_key = conn.serial = conn.player = conn.boss_round = None
        conn.last_phase = conn.pending_plan = conn.shop_pending = None
        conn.local_finishes.clear()
        conn.shop_states.clear()

    def _record_event(self, conn: Connection, key: tuple, message_id: int, event: dict, *, recovered=False) -> None:
        self.message_count += 1
        if message_id in (300, 302, 303, 311, 313):
            self.report_events[message_id] += 1
        if event['kind'] == 'phase' and event['round'] in BOSS_ROUNDS:
            if event['phase'] == 'boss':
                self.boss_events['phase'] += 1
            elif event['phase'] in ('settle', 'end'):
                self.boss_events['terminal'] += 1
        first_full = message_id == 300 and conn.match_key is None
        loading = self._loading(event)
        active = self.current[1] if self.current else None
        opening_finish = event['kind'] == 'self_finish' and event['round'] == 1 and not event['from_rejoin']
        opening_scene = (event['kind'] == 'phase' and event['round'] == 1 and 'stage_seed' not in event
                         and event['phase'] in ('prep', 'special_prep', 'self'))
        opening = (not recovered and (opening_finish or opening_scene) and active is not None
                   and any(number > 1 for number in active.model.rounds))
        if opening and active is conn and not conn.closed:
            staged_opening = bool(conn.pending_plan and any(preview.round_number == 1 for preview in conn.pending_plan[0]))
            ended = conn.last_phase is not None and conn.last_phase[1] == 'end'
            if opening_scene or staged_opening or ended:
                staged_plans = [(*conn.pending_plan, 0)] if conn.pending_plan else []
                # Earlier stages deliberately held forecasts until a round boundary.
                # Retain this local evidence across a reset but reattribute only R1 rows.
                conn.pending_plan = None
                self._reset_match(conn)
                for previews, source, seen_round in staged_plans:
                    conn.model.add_spawn_plan((preview for preview in previews if preview.round_number == 1),
                                              source, seen_round)
        if event['kind'] == 'phase' and not self._identify_match(conn, event):
            return
        self._apply(conn, event)
        if conn.serial is None and (conn.model.rounds or conn.model.spawn_plan or conn.model.battle_config):
            self.match_serial += 1
            conn.serial = self.match_serial
        if event['kind'] == 'phase' and conn.match_key is not None:
            self.matches[conn.match_key] = (conn.model, conn.serial, conn.generation)
        if self.shop_recorder:
            self.shop_recorder.accept(conn, event, self.wire_ordinal)
        confirmed_scene = event['kind'] == 'phase' and (loading or event['round'] or event.get('mode_id'))
        has_report = conn.serial is not None
        # 建连顺序不是对局顺序。首次取得身份的完整场景优先于仅有零散数据的临时战报。
        replaces_partial = (first_full and conn.match_key is not None and active is not None
                            and not active.closed and active.serial is not None
                            and active.match_key is None and active.last_phase is None)
        # With no usable downlink, an opening settlement on a newer connection can
        # identify the next match even while the previous TCP socket still exists.
        replaces_on_opening = opening and (opening_scene or (active.last_phase is None and conn.match_key is None))
        if not conn.closed and (has_report or loading) and (
                active is None or replaces_partial or (conn.generation > active.generation and (
                    active.closed or active.client_finished or replaces_on_opening or (has_report and active.serial is None)
                    or (active.last_phase is not None and active.last_phase[1] == 'end')
                    or (conn.match_key is not None and conn.match_key == active.match_key)
                    or (not recovered and confirmed_scene
                        and (conn.match_key is not None or active.match_key is None))))):
            self.current = (key, conn)

    def retire_connections(self, keys) -> None:
        """Use the game-owned TCP table even if the capture missed the teardown packets."""
        for key in keys:
            conn = self.connections.pop(key, None)
            if conn is not None:
                conn.closed = True
        self._promote_after_close()

    def _promote_after_close(self) -> None:
        if not self.current or not (self.current[1].closed or self.current[1].client_finished):
            return
        generation = self.current[1].generation
        # The replacement connection may already have emitted its first result before the table refreshed.
        self.current = max(((key, conn) for key, conn in self.connections.items()
                            if conn.generation > generation and not (conn.closed or conn.client_finished) and conn.serial is not None
                            and not self._superseded(conn)),
                           key=lambda item: item[1].generation, default=self.current)

    def _identify_match(self, conn: Connection, event: dict) -> bool:
        uid = event.get('self_uid')
        if 'stage_seed' not in event or not event.get('players'):
            if self._loading(event) and conn.model.rounds:
                # Explicit loading without a roster: start a provisional match, not a round rollback.
                # A subsequent full scene can still recover a known match via self.matches.
                self._reset_match(conn)
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
        if previous is None and conn.match_key is None and not reset_partial:
            # A full scene can reveal that provisional packets on this socket belonged
            # to an older run. Keep only evidence compatible with the confirmed round.
            number = event['round']
            provisional = conn.model
            if provisional.rounds or provisional.spawn_plan or provisional.battle_config:
                model = MatchStats()
                model.rounds = {round_number: row for round_number, row in provisional.rounds.items()
                                if round_number <= number}
                model.spawn_plan = {key: row for key, row in provisional.spawn_plan.items()
                                    if key[0] >= number}
                conn.model = model
                conn.serial = None
                conn.local_finishes = {round_number: finish for round_number, finish in conn.local_finishes.items()
                                       if round_number <= number}
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

    @staticmethod
    def _boss_context(conn: Connection, *, allow_terminal: bool = False) -> int | None:
        if conn.last_phase is None:
            return None
        number, phase = conn.last_phase
        if number not in BOSS_ROUNDS or number != conn.model.current_round:
            return None
        if phase == 'boss' and conn.boss_round == number:
            return number
        if allow_terminal and phase in ('settle', 'end') and conn.model.rounds[number].boss_ended:
            return number
        return None

    @classmethod
    def _boss_data_context(cls, conn: Connection) -> tuple[int | None, bool]:
        confirmed = cls._boss_context(conn, allow_terminal=True)
        if confirmed is not None:
            return confirmed, False
        if conn.last_phase is None:
            return None, False
        number, _phase = conn.last_phase
        if number == 13:
            return 14, True
        if number == 14:
            return number, True
        return None, False

    def _apply(self, conn, event):
        kind = event['kind']
        if kind == 'spawn_plan':
            source = f"上行 {event['message_id']}"
            previous_rounds = [number for number in conn.model.rounds if number > 1]
            rollover = bool(previous_rounds) and any(preview.round_number == 1 for preview in event['previews'])
            round_hint = conn.last_phase[0] if conn.last_phase is not None else 0
            if not rollover and round_hint:
                round_one_has_leaks = bool(conn.model.rounds.get(1) and conn.model.rounds[1].leaks is not None)
                rollover = (round_hint > 1 and any(preview.round_number == 1 for preview in event['previews'])
                            and round_one_has_leaks)
            if rollover:
                self._reset_match(conn)
                conn.current_candidate_round = 0
                previous_rounds = []
                round_hint = 0
            if conn.match_key is None and not previous_rounds:
                # A round-one forecast received during initial loading belongs to the current run.
                conn.model.add_spawn_plan(event['previews'], source, round_hint)
            else:
                # Preserve forecasts across missing or delayed scene packets. A next
                # forecast replaces the pending snapshot so reconnects cannot strand it.
                if conn.pending_plan:
                    conn.model.add_spawn_plan(*conn.pending_plan)
                conn.pending_plan = (event['previews'], source)
                if conn.match_key is None:
                    conn.model.add_spawn_plan(event['previews'], source, round_hint)
                else:
                    # The preview includes its target round; keep it even if the
                    # corresponding downlink scene never arrives after reconnect.
                    conn.model.add_spawn_plan(event['previews'], source, round_hint)
            return
        else:
            if kind == 'preparation':
                preparation = event['preparation']
                seat, hp, number = preparation[:3]
                if 1 <= seat <= 4 and max(1, conn.model.current_round) <= number <= 15:
                    if conn.last_phase and conn.last_phase[0] == number and conn.last_phase[1] not in ('prep', 'special_prep'):
                        return
                    if seat in conn.model.eliminated:
                        return  # 准备快照没有复活标记；以服务端 runtime 的确认结果为准。
                    # Server preparation includes a round, but need not distinguish normal/special phases.
                    conn.model.observe_round(number)
                    conn.model.current_round = number
                    conn.model.set_players({seat: ''})
                    conn.model.set_prep_extras(number, preparation)
                    if hp > 0:
                        conn.model.set_player_status(number, {seat: {'hp': hp}})
                return None
            else:
                if kind == 'phase':
                    number = event['round']
                    phase = event['phase']
                    if event.get('players'):
                        conn.model.set_players(event['players'])
                    if event.get('mode_id'):
                        conn.model.battle_config = {key: event[key] for key in ['mode_id', 'boss_id', 'hidden_boss_id']}
                    if event.get('enemy_types'):
                        conn.model.enemy_types = event['enemy_types']
                    if conn.pending_plan:
                        previews, source = conn.pending_plan
                        if event['phase'] != 'end':
                            conn.model.add_spawn_plan((preview for preview in previews if preview.round_number == number),
                                                      source, number)
                        conn.pending_plan = None
                    previews = event['spawn_preview']
                    conn.model.add_spawn_plan(previews, '下行', number)
                    if not number and event['phase'] in ('loading', 'end'):
                        if event['phase'] == 'end' and conn.boss_round is not None:
                            conn.model.finish_boss_round(conn.boss_round)
                        self._invalidate_phase(conn)
                    if number:
                        terminal = phase in ('settle', 'end')
                        # An end scene may be the first Boss event we see. Its runtime
                        # belongs here only if the Boss is tied to this same round.
                        previous_boss = conn.boss_round
                        continued_terminal = (conn.last_phase in ((number, 'settle'), (number, 'end'))
                                              and self._boss_context(conn, allow_terminal=True) == number)
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
                    if number:
                        if phase in ('prep', 'special_prep', 'self'):
                            conn.current_candidate_round = number
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
                        if previous_boss is not None and (number != previous_boss or terminal):
                            conn.model.finish_boss_round(previous_boss)
                            conn.boss_round = None
                        if phase == 'boss' and number in BOSS_ROUNDS:
                            conn.boss_round = number
                            conn.model.set_boss_hp(number, event.get('boss_hp'))
                        if terminal and number in BOSS_ROUNDS:
                            boss_linked = (number == previous_boss or continued_terminal
                                           or number in event.get('boss_record_rounds', ())
                                           or (event.get('boss_hp') or 0) > 0)
                            if boss_linked:
                                conn.model.set_boss_hp(number, event.get('boss_hp'))
                                conn.model.set_boss_totals(number, event['runtime'], at_settlement=True)
                                conn.model.finish_boss_round(number)
                model = conn.model
                if kind in ('phase', 'runtime') and event.get('player_status'):
                        model.set_player_status(model.current_round, event['player_status'])
                if kind in ('phase', 'runtime') and event.get('runtime'):
                        model.set_players(dict.fromkeys(event['runtime'], ''))
                        if kind == 'runtime' and any(damage > 0 for damage in event['runtime'].values()):
                            self.boss_events['runtime'] += 1
                        boss_round, inferred = (self._boss_data_context(conn) if kind == 'runtime'
                                                else (self._boss_context(conn), False))
                        if boss_round is not None:
                            has_damage = any(damage > 0 for damage in event['runtime'].values())
                            if not inferred or has_damage:
                                model.set_boss_totals(boss_round, event['runtime'], inferred=inferred)
                            if inferred and has_damage:
                                self.boss_events['inferred'] += 1
                if kind == 'boss_ratio':
                    self.boss_events['ratio'] += 1
                    boss_round, inferred = self._boss_data_context(conn)
                    if boss_round is not None:
                        model.set_boss_ratio(boss_round, event['uid'], event['ratio'], inferred=inferred)
                        if inferred:
                            self.boss_events['inferred'] += 1
                    else:
                        self.boss_events['unassigned'] += 1
                if kind == 'step':
                    uplink = event.get('uplink', False)
                    if uplink and event.get('uid') in range(1, 5):
                            conn.player = event['uid']
                    boss_round, inferred = self._boss_data_context(conn) if not uplink else (self._boss_context(conn), False)
                    # Official Boss results can be tied to the nearest confirmed Boss round.
                    rank = not uplink and any(op == 20 and params and len(params) % 3 == 0
                                              for _, actions in event['steps'] for op, params in actions)
                    if rank:
                        self.boss_events['rank'] += 1
                        if boss_round is None:
                            self.boss_events['unassigned'] += 1
                        elif inferred:
                            self.boss_events['inferred'] += 1
                    if boss_round is not None:
                        for seq, actions in event['steps']:
                            model.add_step(boss_round, seq, actions, uplink=uplink, uid=event.get('uid'), inferred=inferred)
                if kind == 'help_kill':
                    model.add_help_kill(event['enemy_inst_id'], event['is_token'], event['credited_uid'])
                if kind == 'help_finish':
                    model.set_help_finish(event['round'], event['kills'], from_rejoin=event['from_rejoin'],
                                          escaped_enemies=event.get('escaped_enemies', ()))
                if kind == 'self_finish' and not event['from_rejoin'] and 1 <= event['round'] <= 15:
                        number = event['round']
                        model.observe_round(number)
                        conn.local_finishes[number] = event
                if conn.player is None and conn.local_finishes and kind in ('phase', 'self_finish'):
                    # Actual spawn instances may arrive after the local result, even without a help stage.
                    candidates = {model.identify_own_player(number, finish['escaped_ids'])
                                  for number, finish in conn.local_finishes.items()} - {None}
                    if len(candidates) == 1:
                        conn.player = candidates.pop()
                if conn.player in range(1, 5):
                    if conn.local_finishes:
                        for number, finish in conn.local_finishes.items():
                            model.set_self_leaks(number, conn.player, finish['escaped_count'], escaped_ids=finish['escaped_ids'], token_ids=finish['escaped_token_ids'])
                        conn.local_finishes.clear()
    def snapshot(self) -> dict:
        key, conn = self.current if self.current else (None, None)
        player = conn.player if conn else None
        if conn and player is None:
            # 不把协防关联推得的席位写进对局身份。出现冲突或明确席位后重新判断。
            candidates = {conn.model.identify_player_from_help(number, finish['escaped_ids'], finish['escaped_token_ids'])
                          for number, finish in conn.local_finishes.items()} - {None}
            if len(candidates) == 1:
                player = candidates.pop()
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
            "self": player,
            "round": conn.model.current_round if conn else 0,
            "unknown_messages": dict(self.unknown.most_common(40)),
        }
        if conn and player is not None and conn.player is None:
            summary['self_basis'] = 'help'
        match = conn.model.snapshot() if conn else {"players": {}, "rounds": {}}
        if conn:
            for number, row in match['rounds'].items():
                finish = conn.local_finishes.get(number)
                if conn.player is not None:
                    value = conn.model.rounds[number].local_leaks.get(conn.player)
                else:
                    value = finish['escaped_count'] if finish is not None else None
                    if value is not None and player is None:
                        row['unassigned_self_leaks'] = value
                if value is not None:
                    row['self_leaks'] = value
                    row['self_leak_enemies'] = conn.model.own_leak_enemies(number, player, finish)
        return {"capture": summary, **match}
