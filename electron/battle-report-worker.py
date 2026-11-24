"""Lightweight pure-stdlib battle report capture worker for standalone telemetry builds."""
import sys


if __name__ == "__main__":
    from prts_battle_core.live import self_check, serve

    if sys.argv[1:] == ["--battle-report-check"]:
        self_check()
    elif sys.argv[1:] == ["--battle-report"]:
        serve()
    else:
        raise SystemExit("Expected --battle-report or --battle-report-check")
