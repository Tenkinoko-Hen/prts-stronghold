"""Clean-room PRTS combat telemetry engine (3-caliber logic-clock DPS & arena scopes)."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Iterable, Mapping

from .operator_catalog import (
    is_stage_device,
    is_summon_token,
    resolve_operator_name,
    resolve_strategist_name,
    resolve_summon_host,
)

LOGIC_TICKS_PER_SECOND = 30.0
ENGAGEMENT_TAIL_SECONDS = 1.5
PULSE_WINDOW_SECONDS = 5.0
MIN_ACTIVE_DIVISOR = 1.0 / LOGIC_TICKS_PER_SECOND
MIN_PULSE_DIVISOR = 0.25


@dataclass
class UnitSample:
    """Single-frame snapshot of one allied unit or stage device."""

    instance_id: int
    unit_id: str
    name: str = ""
    owner_seat: int | None = None
    owner_uid: str = ""
    host_instance_id: int | None = None
    host_unit_id: str = ""
    on_field: bool = True
    is_summon: bool = False
    is_device: bool = False
    physical: float = 0.0
    arts: float = 0.0
    true: float = 0.0
    elemental: float = 0.0
    healing: float = 0.0
    shield_guarded: float | None = None
    overkill_trimmed: float | None = None
    raw_pre_mitigation: float | None = None
    skill_damage: float | None = None
    hit_count: int | None = None


@dataclass
class EnemySample:
    """Single-frame snapshot of one active enemy on the battlefield."""

    instance_id: int
    enemy_id: str = ""
    name: str = ""
    hp: float = 0.0
    max_hp: float = 0.0
    is_boss: bool = False


@dataclass
class BattleFrameSample:
    """Frame-guarded battle snapshot keyed by fixed game logic ticks."""

    battle_id: str
    logic_tick: int
    stage_id: str = ""
    stage_name: str = ""
    units: tuple[UnitSample, ...] = ()
    enemies: tuple[EnemySample, ...] = ()
    source: str = "memory_readonly"


class IntervalAccumulator:
    """Merges active engagement windows [t0, t1 + 1.5s] and clips future tail at now_logic."""

    __slots__ = ("_completed", "_open_start", "_open_end")

    def __init__(self) -> None:
        self._completed: float = 0.0
        self._open_start: float | None = None
        self._open_end: float | None = None

    def mark_active(self, window_start: float, event_time: float, tail: float = ENGAGEMENT_TAIL_SECONDS) -> None:
        start = max(0.0, min(window_start, event_time))
        end = max(start, event_time + tail)
        if self._open_start is None or self._open_end is None:
            self._open_start = start
            self._open_end = end
            return
        if start <= self._open_end + 1e-6:
            if end > self._open_end:
                self._open_end = end
        else:
            self._completed += max(0.0, self._open_end - self._open_start)
            self._open_start = start
            self._open_end = end

    def seconds_at(self, now_logic: float) -> float:
        total = self._completed
        if self._open_start is not None and self._open_end is not None and now_logic > self._open_start:
            clipped_end = min(self._open_end, now_logic)
            if clipped_end > self._open_start:
                total += clipped_end - self._open_start
        return total


class PulseWindow:
    """5-logic-second sliding pulse calculator with boundary linear interpolation."""

    __slots__ = ("_window", "_attach_time", "_attach_value", "_points")

    def __init__(self, window_seconds: float = PULSE_WINDOW_SECONDS) -> None:
        self._window = window_seconds
        self._attach_time: float | None = None
        self._attach_value: float = 0.0
        self._points: deque[tuple[float, float]] = deque()

    def observe(self, logic_time: float, cumulative_value: float) -> None:
        if self._attach_time is None:
            self._attach_time = logic_time
            self._attach_value = cumulative_value
        if self._points and abs(self._points[-1][0] - logic_time) < 1e-9:
            self._points[-1] = (logic_time, cumulative_value)
        elif not self._points or logic_time > self._points[-1][0]:
            self._points.append((logic_time, cumulative_value))
        cutoff = logic_time - self._window
        while len(self._points) >= 2 and self._points[1][0] <= cutoff:
            self._points.popleft()

    def rate_at(self, now_logic: float) -> float:
        if not self._points or self._attach_time is None:
            return 0.0
        latest_value = self._points[-1][1]
        elapsed_since_attach = now_logic - self._attach_time
        if elapsed_since_attach < self._window:
            delta = max(0.0, latest_value - self._attach_value)
            if delta <= 0.0:
                return 0.0
            return delta / max(elapsed_since_attach, MIN_PULSE_DIVISOR)
        target_time = now_logic - self._window
        if target_time >= self._points[-1][0]:
            return 0.0
        if target_time <= self._points[0][0]:
            base = self._points[0][1]
            return max(0.0, latest_value - base) / self._window
        prev_t, prev_v = self._points[0]
        interp_v = prev_v
        for curr_t, curr_v in self._points:
            if curr_t >= target_time:
                span = curr_t - prev_t
                if span > 1e-9:
                    ratio = (target_time - prev_t) / span
                    interp_v = prev_v + (curr_v - prev_v) * ratio
                else:
                    interp_v = curr_v
                break
            prev_t, prev_v = curr_t, curr_v
        return max(0.0, latest_value - interp_v) / self._window


@dataclass
class _TrackedEntity:
    key: tuple[int | None, int, str]
    instance_id: int
    unit_id: str
    name: str
    owner_seat: int | None
    owner_uid: str
    is_summon: bool
    is_device: bool
    host_instance_id: int | None = None
    host_unit_id: str = ""
    on_field: bool = True
    physical: float = 0.0
    arts: float = 0.0
    true: float = 0.0
    elemental: float = 0.0
    healing: float = 0.0
    shield_guarded: float | None = None
    overkill_trimmed: float | None = None
    raw_pre_mitigation: float | None = None
    skill_damage: float | None = None
    hit_count: int | None = None
    presence_seconds: float = 0.0
    last_seen_time: float | None = None
    damage_intervals: IntervalAccumulator = field(default_factory=IntervalAccumulator)
    heal_intervals: IntervalAccumulator = field(default_factory=IntervalAccumulator)
    damage_pulse: PulseWindow = field(default_factory=PulseWindow)
    heal_pulse: PulseWindow = field(default_factory=PulseWindow)

    @property
    def total_damage(self) -> float:
        return self.physical + self.arts + self.true + self.elemental


class CombatMeter:
    """Clean-room single-battle combat meter operating on monotonic fixed logic ticks."""

    def __init__(self, battle_id: str = "", stage_id: str = "", stage_name: str = "", source: str = "memory_readonly") -> None:
        self.battle_id = battle_id
        self.stage_id = stage_id
        self.stage_name = stage_name
        self.source = source
        self.first_tick: int | None = None
        self.latest_tick: int = 0
        self.midstream: bool = False
        self._entities: dict[tuple[int | None, int, str], _TrackedEntity] = {}
        self._enemy_last_hp: dict[int, tuple[float, float, str, str, bool]] = {}
        self.defeated_enemies: int = 0
        self.respawn_resets: int = 0
        self.live_enemies: tuple[EnemySample, ...] = ()

    @property
    def logic_seconds(self) -> float:
        return self.latest_tick / LOGIC_TICKS_PER_SECOND

    def observe_frame(self, frame: BattleFrameSample) -> bool:
        if frame.logic_tick < 0:
            return False
        if self.first_tick is not None and frame.logic_tick < self.latest_tick:
            # Reject out-of-order / rolled-back frame
            return False
        if self.first_tick is None:
            self.first_tick = frame.logic_tick
            # Attaching after >1.5s of combat means earlier ticks were missed ("midstream")
            self.midstream = frame.logic_tick > int(LOGIC_TICKS_PER_SECOND * 1.5)
        if frame.stage_id:
            self.stage_id = frame.stage_id
        if frame.stage_name:
            self.stage_name = frame.stage_name
        if frame.source:
            self.source = frame.source

        now_time = frame.logic_tick / LOGIC_TICKS_PER_SECOND
        self.latest_tick = frame.logic_tick

        seen_keys: set[tuple[int | None, int, str]] = set()
        for sample in frame.units:
            unit_id = (sample.unit_id or "").strip()
            if not unit_id:
                continue
            device = sample.is_device or is_stage_device(unit_id)
            inferred_host = sample.host_unit_id or resolve_summon_host(unit_id)
            summon = (not device) and (sample.is_summon or is_summon_token(unit_id) or bool(inferred_host) or sample.host_instance_id is not None)
            key = (sample.owner_seat, sample.instance_id, unit_id)
            seen_keys.add(key)
            entity = self._entities.get(key)
            display_name = resolve_operator_name(unit_id, sample.name)
            if entity is None:
                entity = _TrackedEntity(
                    key=key,
                    instance_id=sample.instance_id,
                    unit_id=unit_id,
                    name=display_name,
                    owner_seat=sample.owner_seat,
                    owner_uid=sample.owner_uid,
                    is_summon=summon,
                    is_device=device,
                    host_instance_id=sample.host_instance_id,
                    host_unit_id=inferred_host,
                    on_field=sample.on_field,
                )
                self._entities[key] = entity
            else:
                if display_name and (not entity.name or entity.name == entity.unit_id):
                    entity.name = display_name
                if sample.host_instance_id is not None:
                    entity.host_instance_id = sample.host_instance_id
                if inferred_host and not entity.host_unit_id:
                    entity.host_unit_id = inferred_host

            prev_time = entity.last_seen_time
            dt = max(0.0, now_time - prev_time) if prev_time is not None else 0.0
            if sample.on_field and prev_time is not None and dt > 0.0:
                entity.presence_seconds += dt
            entity.on_field = sample.on_field
            entity.last_seen_time = now_time

            new_phys = max(entity.physical, max(0.0, float(sample.physical)))
            new_arts = max(entity.arts, max(0.0, float(sample.arts)))
            new_true = max(entity.true, max(0.0, float(sample.true)))
            new_elem = max(entity.elemental, max(0.0, float(sample.elemental)))
            new_heal = max(entity.healing, max(0.0, float(sample.healing)))

            prev_dmg = entity.total_damage
            prev_heal = entity.healing
            entity.physical = new_phys
            entity.arts = new_arts
            entity.true = new_true
            entity.elemental = new_elem
            entity.healing = new_heal

            if sample.shield_guarded is not None:
                entity.shield_guarded = max(entity.shield_guarded or 0.0, max(0.0, float(sample.shield_guarded)))
            if sample.overkill_trimmed is not None:
                entity.overkill_trimmed = max(entity.overkill_trimmed or 0.0, max(0.0, float(sample.overkill_trimmed)))
            if sample.raw_pre_mitigation is not None:
                entity.raw_pre_mitigation = max(entity.raw_pre_mitigation or 0.0, max(0.0, float(sample.raw_pre_mitigation)))
            if sample.skill_damage is not None:
                entity.skill_damage = max(entity.skill_damage or 0.0, max(0.0, float(sample.skill_damage)))
            if sample.hit_count is not None:
                entity.hit_count = max(entity.hit_count or 0, int(sample.hit_count))

            curr_dmg = entity.total_damage
            win_start = max(0.0, now_time - min(dt, ENGAGEMENT_TAIL_SECONDS)) if prev_time is not None else now_time
            if curr_dmg > prev_dmg + 1e-6:
                entity.damage_intervals.mark_active(win_start, now_time)
            if new_heal > prev_heal + 1e-6:
                entity.heal_intervals.mark_active(win_start, now_time)

            entity.damage_pulse.observe(now_time, curr_dmg)
            entity.heal_pulse.observe(now_time, new_heal)

        # Units absent from frame are treated as retreated/off-field without erasing cumulative totals
        for key, entity in self._entities.items():
            if key not in seen_keys:
                entity.on_field = False
                entity.last_seen_time = now_time
                entity.damage_pulse.observe(now_time, entity.total_damage)
                entity.heal_pulse.observe(now_time, entity.healing)

        self._update_enemies(frame.enemies)
        return True

    def _update_enemies(self, enemies: tuple[EnemySample, ...]) -> None:
        current_ids: set[int] = set()
        active_list: list[EnemySample] = []
        for enemy in enemies:
            current_ids.add(enemy.instance_id)
            hp = max(0.0, float(enemy.hp))
            max_hp = max(hp, max(0.0, float(enemy.max_hp)))
            prev = self._enemy_last_hp.get(enemy.instance_id)
            if prev is not None:
                prev_hp, prev_max, _, _, _ = prev
                # Detect boss phase rebirth / HP pool refill on same instance
                if prev_max > 0 and hp > prev_hp + max(1000.0, prev_max * 0.30):
                    self.respawn_resets += 1
            self._enemy_last_hp[enemy.instance_id] = (hp, max_hp, enemy.enemy_id, enemy.name, enemy.is_boss)
            if hp > 0.0:
                active_list.append(EnemySample(enemy.instance_id, enemy.enemy_id, enemy.name, hp, max_hp, enemy.is_boss))
        for old_id in list(self._enemy_last_hp):
            if old_id not in current_ids:
                prev_hp = self._enemy_last_hp.pop(old_id)[0]
                if prev_hp > 0:
                    self.defeated_enemies += 1
        self.live_enemies = tuple(active_list)

    def _resolve_host_group_key(
        self,
        entity: _TrackedEntity,
        hosts_by_inst: Mapping[tuple[int | None, int], tuple[int | None, str]],
        hosts_by_unit: Mapping[tuple[int | None, str], tuple[int | None, str]],
    ) -> tuple[int | None, str]:
        if not entity.is_summon:
            return (entity.owner_seat, entity.unit_id)
        if entity.host_instance_id is not None:
            by_inst = hosts_by_inst.get((entity.owner_seat, entity.host_instance_id))
            if by_inst is not None:
                return by_inst
        if entity.host_unit_id:
            by_unit = hosts_by_unit.get((entity.owner_seat, entity.host_unit_id))
            if by_unit is not None:
                return by_unit
            return (entity.owner_seat, entity.host_unit_id)
        return (entity.owner_seat, entity.unit_id)

    def snapshot(self) -> dict:
        now_time = self.logic_seconds
        hosts_by_inst: dict[tuple[int | None, int], tuple[int | None, str]] = {}
        hosts_by_unit: dict[tuple[int | None, str], tuple[int | None, str]] = {}
        for entity in self._entities.values():
            if not entity.is_summon and not entity.is_device:
                group_key = (entity.owner_seat, entity.unit_id)
                hosts_by_inst[(entity.owner_seat, entity.instance_id)] = group_key
                hosts_by_unit[(entity.owner_seat, entity.unit_id)] = group_key

        grouped: dict[tuple[int | None, str], list[_TrackedEntity]] = {}
        devices: list[_TrackedEntity] = []
        for entity in self._entities.values():
            if entity.is_device:
                devices.append(entity)
                continue
            gkey = self._resolve_host_group_key(entity, hosts_by_inst, hosts_by_unit)
            grouped.setdefault(gkey, []).append(entity)

        operator_rows: list[dict] = []
        for (owner_seat, host_unit_id), members in grouped.items():
            hosts = [m for m in members if not m.is_summon]
            summons = [m for m in members if m.is_summon]

            phys = sum(m.physical for m in members)
            arts = sum(m.arts for m in members)
            true_dmg = sum(m.true for m in members)
            elem = sum(m.elemental for m in members)
            total_dmg = phys + arts + true_dmg + elem
            summon_dmg = sum(m.total_damage for m in summons)
            heal = sum(m.healing for m in members)

            # Engagement seconds: union across host + summons via max / merged bounds
            active_dmg_sec = max((m.damage_intervals.seconds_at(now_time) for m in members), default=0.0)
            active_heal_sec = max((m.heal_intervals.seconds_at(now_time) for m in members), default=0.0)
            pulse_dps = sum(m.damage_pulse.rate_at(now_time) for m in members)
            pulse_hps = sum(m.heal_pulse.rate_at(now_time) for m in members)

            # Host presence stops increasing after host retreats even if summons stay on field
            presence_sec = max((m.presence_seconds for m in hosts), default=0.0)
            if not hosts:
                presence_sec = max((m.presence_seconds for m in summons), default=0.0)

            active_dps = total_dmg / max(active_dmg_sec, MIN_ACTIVE_DIVISOR) if total_dmg > 0 else 0.0
            active_hps = heal / max(active_heal_sec, MIN_ACTIVE_DIVISOR) if heal > 0 else 0.0
            span_den = max(presence_sec, active_dmg_sec)
            span_dps = total_dmg / max(span_den, MIN_ACTIVE_DIVISOR) if total_dmg > 0 and span_den > 0 else (active_dps if total_dmg > 0 else 0.0)
            span_heal_den = max(presence_sec, active_heal_sec)
            span_hps = heal / max(span_heal_den, MIN_ACTIVE_DIVISOR) if heal > 0 and span_heal_den > 0 else (active_hps if heal > 0 else 0.0)

            shield_vals = [m.shield_guarded for m in members if m.shield_guarded is not None]
            overkill_vals = [m.overkill_trimmed for m in members if m.overkill_trimmed is not None]
            raw_vals = [m.raw_pre_mitigation for m in members if m.raw_pre_mitigation is not None]
            skill_vals = [m.skill_damage for m in members if m.skill_damage is not None]
            hit_vals = [m.hit_count for m in members if m.hit_count is not None]

            raw_sum = sum(raw_vals) if len(raw_vals) == len(members) and raw_vals else None
            mitigation_ratio: float | None = None
            if raw_sum is not None and raw_sum > 0:
                mitigation_ratio = round(max(0.0, min(1.0, 1.0 - (total_dmg / raw_sum))), 4)

            primary_name = next((m.name for m in hosts if m.name), "") or resolve_operator_name(host_unit_id)
            on_field = any(m.on_field for m in hosts) if hosts else any(m.on_field for m in summons)

            children = [
                {
                    "unit_id": s.unit_id,
                    "name": s.name,
                    "total_damage": round(s.total_damage, 1),
                    "physical": round(s.physical, 1),
                    "arts": round(s.arts, 1),
                    "true": round(s.true, 1),
                    "elemental": round(s.elemental, 1),
                    "healing": round(s.healing, 1),
                    "on_field": s.on_field,
                }
                for s in sorted(summons, key=lambda item: (-item.total_damage, item.unit_id))
                if s.total_damage > 0 or s.healing > 0
            ]

            if total_dmg <= 0 and heal <= 0 and not on_field:
                continue

            operator_rows.append({
                "char_id": host_unit_id,
                "name": primary_name,
                "seat": owner_seat,
                "on_field": on_field,
                "total_damage": round(total_dmg, 1),
                "summon_damage": round(summon_dmg, 1),
                "physical": round(phys, 1),
                "arts": round(arts, 1),
                "true": round(true_dmg, 1),
                "elemental": round(elem, 1),
                "healing": round(heal, 1),
                "active_dps": round(active_dps, 1),
                "pulse_dps": round(pulse_dps, 1),
                "span_dps": round(span_dps, 1),
                "active_hps": round(active_hps, 1),
                "pulse_hps": round(pulse_hps, 1),
                "span_hps": round(span_hps, 1),
                "active_seconds": round(active_dmg_sec, 2),
                "presence_seconds": round(presence_sec, 2),
                "shield_guarded": round(sum(shield_vals), 1) if shield_vals else None,
                "overkill_trimmed": round(sum(overkill_vals), 1) if overkill_vals else None,
                "skill_damage": round(sum(skill_vals), 1) if skill_vals else None,
                "mitigation_ratio": mitigation_ratio,
                "hits": sum(hit_vals) if hit_vals else None,
                "share_ratio": 0.0,
                "children": children,
            })

        operator_rows.sort(key=lambda row: (-row["total_damage"], -row["healing"], row["char_id"]))
        team_total_damage = round(sum(row["total_damage"] for row in operator_rows), 1)
        team_total_healing = round(sum(row["healing"] for row in operator_rows), 1)
        for row in operator_rows:
            row["share_ratio"] = round(row["total_damage"] / team_total_damage, 4) if team_total_damage > 0 else 0.0

        device_rows = [
            {
                "unit_id": d.unit_id,
                "name": d.name,
                "total_damage": round(d.total_damage, 1),
                "physical": round(d.physical, 1),
                "arts": round(d.arts, 1),
                "true": round(d.true, 1),
                "elemental": round(d.elemental, 1),
                "healing": round(d.healing, 1),
            }
            for d in sorted(devices, key=lambda item: (-item.total_damage, item.unit_id))
            if d.total_damage > 0 or d.healing > 0
        ]

        live_hp = round(sum(e.hp for e in self.live_enemies), 1)
        live_max_hp = round(sum(e.max_hp for e in self.live_enemies), 1)
        boss_enemy = next((e for e in self.live_enemies if e.is_boss), None)

        return {
            "battle_id": self.battle_id,
            "stage_id": self.stage_id,
            "stage_name": self.stage_name,
            "source": self.source,
            "coverage": "midstream" if self.midstream else "full",
            "logic_tick": self.latest_tick,
            "logic_seconds": round(now_time, 2),
            "team_total_damage": team_total_damage,
            "team_total_healing": team_total_healing,
            "operators": operator_rows,
            "stage_devices": device_rows,
            "enemy_pool": {
                "active_count": len(self.live_enemies),
                "defeated_count": self.defeated_enemies,
                "respawn_resets": self.respawn_resets,
                "live_hp": live_hp,
                "live_max_hp": live_max_hp,
                "boss": {
                    "enemy_id": boss_enemy.enemy_id,
                    "name": boss_enemy.name,
                    "hp": round(boss_enemy.hp, 1),
                    "max_hp": round(boss_enemy.max_hp, 1),
                } if boss_enemy else None,
            },
        }


def build_protocol_telemetry(match_snapshot: Mapping) -> dict | None:
    """Derive clean protocol-only operator & lineup telemetry when memory inspector is idle."""
    rounds = match_snapshot.get("rounds") or {}
    lineups = match_snapshot.get("lineups") or {}
    config = match_snapshot.get("battle_config") or {}
    mode_id = str(config.get("mode_id") or "")
    scope = "solo_stronghold" if mode_id.startswith("mode_single_") else "coop_boss"

    boss_round_candidates = set(match_snapshot.get("boss_rounds") or (14, 15))
    for k, row in rounds.items():
        if isinstance(row, Mapping) and (
            row.get("boss_uplink_rows") or row.get("boss_official") or row.get("phase") == "boss" or row.get("boss_ended")
        ):
            if str(k).isdigit():
                boss_round_candidates.add(int(k))

    operator_totals: dict[tuple[int, str], dict] = {}
    round_snaps: dict[str, dict] = {}
    latest_duration: float | None = None
    latest_timeline: list[dict] = []
    latest_boss_hp: float | None = None

    for round_no in sorted(boss_round_candidates):
        row = rounds.get(round_no) or rounds.get(str(round_no))
        if not isinstance(row, Mapping):
            continue
        duration = row.get("boss_duration")
        dur_sec = float(duration) if isinstance(duration, (int, float)) and duration > 0 else None
        raw_tl = row.get("boss_timeline") or ()
        if dur_sec is not None:
            latest_duration = dur_sec
        if isinstance(row.get("boss_hp"), (int, float)) and row["boss_hp"] > 0:
            latest_boss_hp = float(row["boss_hp"])

        # Build per-round timeline points (t, dps, total)
        round_tl: list[dict] = []
        prev_t, prev_v = 0.0, 0.0
        for pt in raw_tl:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                t, v = float(pt[0]), float(pt[1])
                dt = max(0.5, t - prev_t) if round_tl else max(1.0, t)
                inst_dps = round(max(0.0, (v - prev_v) / dt), 1)
                round_tl.append({"t": round(t, 1), "dps": inst_dps, "total": round(v, 1)})
                prev_t, prev_v = t, v
        if round_tl:
            latest_timeline = round_tl

        # Prefer official ranked rows per (seat, identifier) when present; otherwise use uplink hits
        round_ops: dict[tuple[int, str], dict] = {}
        official_rows = list(row.get("boss_official") or ())
        uplink_rows = list(row.get("boss_uplink_rows") or ())
        source_rows = official_rows if official_rows else uplink_rows
        is_official = bool(official_rows)

        for hit in source_rows:
            ident = hit.get("identifier") if is_official else hit.get("attacker")
            char_id = hit.get("char_id") or f"slot_{ident or 0}"
            seat = int(hit.get("player") or 0)
            dmg = float(hit.get("damage") or 0.0)
            if dmg <= 0 or seat not in range(1, 5):
                continue
            name = hit.get("operator_name") or resolve_operator_name(char_id, f"干员 #{ident}")
            for target_map in (operator_totals, round_ops):
                entry = target_map.setdefault(
                    (seat, char_id),
                    {
                        "char_id": char_id,
                        "name": name,
                        "seat": seat,
                        "on_field": False,
                        "total_damage": 0.0,
                        "summon_damage": 0.0,
                        "physical": 0.0,
                        "arts": 0.0,
                        "true": 0.0,
                        "elemental": 0.0,
                        "healing": 0.0,
                        "active_dps": None,
                        "pulse_dps": None,
                        "span_dps": None,
                        "active_hps": None,
                        "pulse_hps": None,
                        "span_hps": None,
                        "active_seconds": dur_sec,
                        "presence_seconds": dur_sec,
                        "shield_guarded": None,
                        "overkill_trimmed": None,
                        "skill_damage": None,
                        "mitigation_ratio": None,
                        "hits": 0,
                        "share_ratio": 0.0,
                        "children": [],
                    },
                )
                entry["total_damage"] = round(entry["total_damage"] + dmg, 1)
                entry["hits"] = (entry["hits"] or 0) + 1
                if dur_sec and dur_sec > 0:
                    est_dps = round(entry["total_damage"] / dur_sec, 1)
                    entry["active_dps"] = est_dps
                    entry["span_dps"] = est_dps

        if round_ops:
            r_list = sorted(round_ops.values(), key=lambda r: (-r["total_damage"], r["char_id"]))
            r_total = round(sum(r["total_damage"] for r in r_list), 1)
            for r in r_list:
                r["share_ratio"] = round(r["total_damage"] / r_total, 4) if r_total > 0 else 0.0
            round_snaps[str(round_no)] = {
                "scope": scope,
                "source": "protocol_wire",
                "coverage": "protocol",
                "retained_round": None,
                "logic_seconds": dur_sec,
                "team_total_damage": r_total,
                "team_total_healing": None,
                "operators": r_list,
                "stage_devices": [],
                "enemy_pool": None,
                "timeline": round_tl,
                "rounds": {},
            }

    if not operator_totals and not lineups:
        return None

    operators = sorted(operator_totals.values(), key=lambda r: (-r["total_damage"], r["char_id"]))
    total_dmg = round(sum(r["total_damage"] for r in operators), 1)
    for r in operators:
        r["share_ratio"] = round(r["total_damage"] / total_dmg, 4) if total_dmg > 0 else 0.0

    enemy_pool = None
    if latest_boss_hp and latest_boss_hp > 0:
        remain = max(0.0, latest_boss_hp - total_dmg)
        enemy_pool = {
            "active_count": 1 if remain > 0 else 0,
            "defeated_count": 1 if remain <= 0 and total_dmg > 0 else 0,
            "respawn_resets": 0,
            "live_hp": round(remain, 1),
            "live_max_hp": round(latest_boss_hp, 1),
            "boss": {
                "enemy_id": str(config.get("boss_id") or ""),
                "name": "本局首领",
                "hp": round(remain, 1),
                "max_hp": round(latest_boss_hp, 1),
            },
        }

    return {
        "scope": scope,
        "source": "protocol_wire",
        "coverage": "protocol",
        "retained_round": None,
        "logic_seconds": latest_duration,
        "team_total_damage": total_dmg,
        "team_total_healing": None,
        "operators": operators,
        "stage_devices": [],
        "enemy_pool": enemy_pool,
        "timeline": latest_timeline,
        "rounds": round_snaps,
    }


class ArenaTelemetryCoordinator:
    """Coordinates single-player & multi-player Stronghold scopes with prep-phase retention."""

    def __init__(self, max_solo_history: int = 50) -> None:
        self._active_meter: CombatMeter | None = None
        self._retained_defense: tuple[int, dict] | None = None
        self._round_archives: dict[int, dict] = {}
        self._match_serial: int | None = None
        self._solo_serial: int = 1000
        self.solo_history: deque[dict] = deque(maxlen=max_solo_history)

    def reset_stronghold_match(self, match_serial: int | None) -> None:
        if match_serial is None:
            return
        if self._match_serial is None:
            self._match_serial = match_serial
        elif match_serial != self._match_serial:
            self._match_serial = match_serial
            self._retained_defense = None
            self._round_archives.clear()

    def accept_battle_frame(
        self,
        frame: BattleFrameSample | None,
        *,
        in_stronghold: bool = False,
        match_serial: int | None = None,
        mode_id: str = "",
        round_number: int = 0,
        phase: str = "",
    ) -> dict | None:
        if in_stronghold:
            self.reset_stronghold_match(match_serial)
        if frame is None:
            if self._active_meter is not None:
                finished = self._active_meter.snapshot()
                if not in_stronghold and finished["operators"]:
                    self.solo_history.appendleft(finished)
                self._active_meter = None
            return None

        if self._active_meter is None or self._active_meter.battle_id != frame.battle_id:
            if self._active_meter is not None and not in_stronghold:
                prev_snap = self._active_meter.snapshot()
                if prev_snap["operators"]:
                    self.solo_history.appendleft(prev_snap)
            if not in_stronghold:
                self._solo_serial += 1
            self._active_meter = CombatMeter(
                battle_id=frame.battle_id,
                stage_id=frame.stage_id,
                stage_name=frame.stage_name,
                source=frame.source,
            )

        self._active_meter.observe_frame(frame)
        snap = self._active_meter.snapshot()
        scope = self._resolve_scope(in_stronghold=in_stronghold, mode_id=mode_id, phase=phase, round_number=round_number)
        snap["scope"] = scope
        snap["retained_round"] = None

        if in_stronghold and 1 <= round_number <= 15:
            if phase in ("self", "assist", "boss") and snap["operators"]:
                self._round_archives[round_number] = dict(snap)
            if phase == "self" and snap["operators"]:
                self._retained_defense = (round_number, dict(snap))
        return snap

    @staticmethod
    def _resolve_scope(*, in_stronghold: bool, mode_id: str, phase: str, round_number: int) -> str:
        if not in_stronghold:
            return "solo_stage"
        if mode_id.startswith("mode_single_"):
            return "solo_stronghold"
        if phase == "assist":
            return "coop_assist"
        if phase == "boss" or round_number in (14, 15):
            return "coop_boss"
        return "coop_defense"

    def enrich_report(self, report: dict, inspector_status: str = "standby") -> dict:
        """Attach unified telemetry block to a Stronghold report snapshot."""
        capture = report.get("capture") or {}
        self.reset_stronghold_match(capture.get("match"))
        round_no = int(capture.get("round") or 0)
        rounds = report.get("rounds") or {}
        round_row = rounds.get(round_no) or rounds.get(str(round_no)) or {}
        phase = str(round_row.get("phase") or "")
        config = report.get("battle_config") or {}
        mode_id = str(config.get("mode_id") or "")

        live_snap = None
        if self._active_meter is not None:
            live_snap = self._active_meter.snapshot()
            live_snap["scope"] = self._resolve_scope(
                in_stronghold=True, mode_id=mode_id, phase=phase, round_number=round_no
            )
            live_snap["retained_round"] = None

        # Freeze & retain previous defense DPS during prep / special_prep so shopping never wipes review
        if phase in ("prep", "special_prep") and self._retained_defense is not None:
            ret_round, ret_snap = self._retained_defense
            if live_snap is None or not live_snap.get("operators"):
                live_snap = {
                    **ret_snap,
                    "retained_round": ret_round,
                }

        if live_snap and (live_snap.get("operators") or live_snap.get("enemy_pool")):
            live_snap["inspector_status"] = inspector_status
            live_snap["rounds"] = {str(k): v for k, v in sorted(self._round_archives.items())}
            report["telemetry"] = live_snap
            return report

        proto = build_protocol_telemetry(report)
        if proto is not None:
            proto["inspector_status"] = inspector_status
            if self._round_archives:
                proto["rounds"] = {**(proto.get("rounds") or {}), **{str(k): v for k, v in sorted(self._round_archives.items())}}
            report["telemetry"] = proto
        return report

    def build_solo_report(self, inspector_status: str = "active") -> dict | None:
        """Build standalone BattleReport-compatible payload for non-Stronghold single-player stages."""
        if self._active_meter is None:
            return None
        snap = self._active_meter.snapshot()
        if not snap["operators"] and not snap["enemy_pool"]["active_count"]:
            return None
        snap["scope"] = "solo_stage"
        snap["retained_round"] = None
        snap["inspector_status"] = inspector_status
        snap["rounds"] = {"1": snap}
        stage_label = snap["stage_name"] or snap["stage_id"] or "单人作战关卡"
        return {
            "capture": {
                "match": self._solo_serial,
                "round": 1,
                "self": 1,
            },
            "players": {1: "博士"},
            "rounds": {
                1: {
                    "phase": "self",
                    "leaks": {1: 0},
                    "leaks_status": "reported",
                    "leak_minimums": {},
                    "uncovered_leaks": {},
                    "uncovered_status": "reported",
                    "assists": {},
                    "assists_status": "skipped",
                    "assists_others": {},
                    "assists_others_status": "skipped",
                    "unattributed_assists": 0,
                    "assist_pairs": [],
                    "assist_enemies": [],
                    "uncovered_enemies": [],
                    "hp_costs": {},
                    "boss_totals": {},
                    "boss_status": "unknown",
                    "boss_official": [],
                    "boss_uplink": {},
                    "boss_uplink_rows": [],
                    "self_leaks": 0,
                    "self_leak_enemies": [],
                }
            },
            "spawn_plan": [],
            "enemy_types": [],
            "hp": {},
            "eliminated": {},
            "battle_config": {
                "mode_id": "mode_solo_stage",
                "stage_id": snap["stage_id"],
                "stage_name": stage_label,
                "boss_id": "",
                "hidden_boss_id": "",
            },
            "defeated_boss_rounds": [],
            "lineups": {},
            "telemetry": snap,
        }
