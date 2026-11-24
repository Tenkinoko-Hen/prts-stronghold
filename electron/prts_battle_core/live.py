"""Emits only local battle summaries; no external connections or files."""

import ctypes as ct
import json
import os
import sys
from threading import Event, Thread
from time import monotonic

from .analyzer import Analyzer
from .wave_power import enemy_template
from .windows_capture import RetiredConnections, segments


def print_event(value: dict) -> None:
    print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)


def self_check() -> None:
    enemy = enemy_template("enemy_10001_trslim")
    if not enemy or not isinstance(Analyzer().snapshot().get("rounds"), dict):
        raise RuntimeError("本地战报资源不完整")
    print("PRTS_BATTLE_REPORT_READY")


def serve() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if not ct.windll.shell32.IsUserAnAdmin():
        print_event({"kind": "status", "status": "permission"})
        return
    stopped = Event()

    def stop_with_parent() -> None:
        try:
            # 不持有 Python 缓冲流的锁，采集异常也能直接退出。
            os.read(sys.stdin.fileno(), 1)
        except OSError:
            pass
        finally:
            stopped.set()

    Thread(target=stop_with_parent, daemon=True).start()
    last_status = ""

    def status(value: str) -> None:
        nonlocal last_status
        if value != last_status:
            print_event({"kind": "status", "status": value})
            last_status = value

    collect_reports(segments(stopped, status), stopped, status)


def collect_reports(results, stopped: Event, status) -> None:
    analyzer = Analyzer()
    last_report = None
    last_count = -1
    last_progress = None
    next_report = 0.0
    next_diagnostics = 0.0
    next_recovery = 0.0
    payloads = {"up": 0, "down": 0}
    payload_bytes = {"up": 0, "down": 0}
    round_count = 0
    report_details = (0, 0, 0)
    failures = 0
    processing_errors = 0
    data_errors = (ValueError, TypeError, KeyError, IndexError, OverflowError)

    def send_report(force: bool = False, idle: bool = False) -> None:
        nonlocal last_count, last_progress, next_report, last_report, round_count, report_details
        now = monotonic()
        if not analyzer.current:
            return
        conn = analyzer.current[1]
        model = conn.model
        progress = (conn.generation, conn.closed, conn.serial, conn.player, model.current_round,
                    conn.last_phase, len(model.rounds),
                    analyzer.report_events[311], analyzer.report_events[313])
        if progress == last_progress and (analyzer.message_count == last_count or (not force and now < next_report)):
            return
        if conn.closed and last_report is None and last_progress and last_progress[:3] == progress[:3]:
            return  # This closed match was already emitted and cleared.
        if not (last_report or model.rounds or model.battle_config or force or idle):
            # 同一批数据里的初始预告和场景合并显示；即使缺场景，空闲时也会发出预告。
            return
        last_count = analyzer.message_count
        last_progress = progress
        next_report = now + 0.25
        report = analyzer.snapshot()
        rounds = report["rounds"]
        round_count = len(rounds)
        report_details = (
            sum(row["phase"] not in ("", "other") for row in rounds.values()),
            sum(wave["planned"] is not None for row in rounds.values()
                for wave in row.get("wave_power", {}).get("rows", ())),
            len(report["spawn_plan"]),
        )
        if round_count or report["spawn_plan"] or report["battle_config"]:
            capture = report["capture"]
            report["capture"] = {key: capture[key] for key in ("match", "round", "self", "self_basis") if key in capture}
            # Keep display names only in the local renderer feed; diagnostics contain counts, not names.
            encoded = json.dumps({"kind": "report", "report": report}, ensure_ascii=False, allow_nan=False)
            if encoded != last_report:
                print(encoded, flush=True)
                last_report = encoded
            if not conn.closed:
                return
        if last_report is not None:
            print_event({"kind": "report", "report": None})
            last_report = None
        round_count = 0
        report_details = (0, 0, 0)

    def send_diagnostics(force: bool = False) -> None:
        nonlocal next_diagnostics
        now = monotonic()
        if not force and now < next_diagnostics:
            return
        next_diagnostics = now + 2.0
        print("PRTS_REPORT_DIAG", payloads["down"], payloads["up"], analyzer.wire_ordinal,
              analyzer.message_count, round_count, analyzer.parse_errors, analyzer.reassembly_errors,
              analyzer.waiting_streams, file=sys.stderr, flush=True)
        print("PRTS_REPORT_DETAIL", *(analyzer.report_events[key] for key in (300, 302, 303, 311, 313)),
              analyzer.scene_candidate_rejections, *report_details, processing_errors,
              file=sys.stderr, flush=True)
        print("PRTS_REPORT_BYTES", payload_bytes["down"], payload_bytes["up"], file=sys.stderr, flush=True)
        print("PRTS_REPORT_BOSS", *(analyzer.boss_events[key] for key in
              ("phase", "terminal", "runtime", "rank", "ratio", "unassigned", "inferred")), file=sys.stderr, flush=True)
        unknown = []
        for key, count in analyzer.unknown.most_common(12):
            direction, message_id = key.split(" ", 1)
            unknown.extend((0 if direction == "down" else 1, int(message_id), count))
        print("PRTS_REPORT_UNKNOWN", *unknown, file=sys.stderr, flush=True)

    try:
        for result in results:
            messages = analyzer.message_count
            errors = analyzer.parse_errors + analyzer.reassembly_errors
            try:
                if result is None:
                    now = monotonic()
                    if now >= next_recovery:
                        next_recovery = now + 0.25
                        analyzer.resume_acknowledged_gaps(now)
                elif isinstance(result, RetiredConnections):
                    analyzer.retire_connections(result.keys)
                else:
                    segment, direction = result
                    if segment.payload:
                        payloads[direction] += 1
                        payload_bytes[direction] += len(segment.payload)
                    analyzer.accept(segment, direction)
            except data_errors:
                failures += 1
                processing_errors += 1
            else:
                if analyzer.message_count > messages:
                    failures = 0
                failures += analyzer.parse_errors + analyzer.reassembly_errors - errors
            if failures >= 20:
                status("incompatible")
                break
            send_report(idle=result is None)
            send_diagnostics()
    except OSError:
        if not stopped.is_set():
            status("unavailable")
    except data_errors:
        status("incompatible")
    if not stopped.is_set():
        try:
            send_report(force=True)
        except data_errors:
            status("incompatible")
        send_diagnostics(force=True)
