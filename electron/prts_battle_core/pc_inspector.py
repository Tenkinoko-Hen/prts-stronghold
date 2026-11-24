# 青逝痕 Tenkinoko 制作
"""Zero-injection Win32 read-only battle inspector with double logic-frame guards.

Safety & Clean-Room Invariants:
1. Uses ONLY ReadProcessMemory (`PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION`).
   Never injects DLLs, never allocates/writes process memory, never suspends threads,
   and never uses Frida or debuggers.
2. Every poll is bounded by `max_reads_per_poll` and bracketed by a before/after
   frame-tick & controller-ownership guard (`GuardedFrameReader`). Any mid-frame race
   or scene teardown discards the sample cleanly without side effects.
3. Automatically verifies client build fingerprint & metadata availability; degrades
   gracefully to `standby` when `Arknights.exe` is closed or on unverified builds.
"""

from __future__ import annotations

import ctypes as ct
from ctypes import wintypes as wt
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import struct
import sys
from typing import Protocol

from .combat_meter import BattleFrameSample, EnemySample, UnitSample

PROCESS_VM_READ = 0x0010
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
TH32CS_SNAPPROCESS = 0x00000002
TH32CS_SNAPMODULE = 0x00000008
TH32CS_SNAPMODULE32 = 0x00000010
INVALID_HANDLE_VALUE = ct.c_void_p(-1).value

TARGET_EXE_NAMES = ("arknights.exe",)
IL2CPP_METADATA_MAGIC = 0xFAB11BAF


class MemorySource(Protocol):
    """Abstract read-only memory source (Win32 process or synthetic test buffer)."""

    def read_bytes(self, address: int, size: int) -> bytes | None: ...

    def module_base(self, module_name: str) -> int | None: ...

    def close(self) -> None: ...


@dataclass(frozen=True)
class FieldLayout:
    """Verified pointer chain & struct field offsets for read-only inspection."""

    build_tag: str
    controller_rva: int
    instance_offset: int = 0x00
    logic_tick_offset: int = 0x18
    stage_id_offset: int = 0x20
    unit_list_offset: int = 0x30
    enemy_list_offset: int = 0x38
    list_items_offset: int = 0x10
    list_size_offset: int = 0x18
    array_first_offset: int = 0x20
    # Unit entry offsets
    unit_instance_id_offset: int = 0x10
    unit_char_id_offset: int = 0x18
    unit_name_offset: int = 0x20
    unit_seat_offset: int = 0x28
    unit_flags_offset: int = 0x2C  # bit0: on_field, bit1: is_summon, bit2: is_device
    unit_host_inst_offset: int = 0x30
    unit_stats_offset: int = 0x38
    # Stats struct offsets (f64channels: physical, arts, true, elemental, healing)
    stats_channels_offset: int = 0x10
    # Enemy entry offsets
    enemy_instance_id_offset: int = 0x10
    enemy_id_offset: int = 0x18
    enemy_name_offset: int = 0x20
    enemy_hp_offset: int = 0x28
    enemy_max_hp_offset: int = 0x30
    enemy_flags_offset: int = 0x38  # bit0: is_boss


class GuardedFrameReader:
    """Enforces read budget and double logic-frame / pointer ownership consistency."""

    def __init__(self, source: MemorySource, max_reads: int = 256) -> None:
        self.source = source
        self.max_reads = max_reads
        self.reads_used = 0

    def _read(self, address: int, size: int) -> bytes | None:
        if address <= 0x10000 or size <= 0 or size > 65536:
            return None
        if self.reads_used >= self.max_reads:
            return None
        self.reads_used += 1
        return self.source.read_bytes(address, size)

    def ptr(self, address: int) -> int | None:
        raw = self._read(address, 8)
        if raw is None or len(raw) != 8:
            return None
        val = struct.unpack("<Q", raw)[0]
        return val if val > 0x10000 else None

    def i32(self, address: int) -> int | None:
        raw = self._read(address, 4)
        return struct.unpack("<i", raw)[0] if raw and len(raw) == 4 else None

    def u32(self, address: int) -> int | None:
        raw = self._read(address, 4)
        return struct.unpack("<I", raw)[0] if raw and len(raw) == 4 else None

    def f64_tuple(self, address: int, count: int) -> tuple[float, ...] | None:
        raw = self._read(address, 8 * count)
        if raw is None or len(raw) != 8 * count:
            return None
        return struct.unpack(f"<{count}d", raw)

    def utf16_il2cpp_string(self, str_ptr: int | None, max_chars: int = 64) -> str:
        """Read standard IL2CPP System.String (length at +0x10, UTF-16LE chars at +0x14)."""
        if not str_ptr:
            return ""
        header = self._read(str_ptr + 0x10, 4)
        if not header or len(header) != 4:
            return ""
        length = struct.unpack("<i", header)[0]
        if length <= 0 or length > max_chars:
            return ""
        raw = self._read(str_ptr + 0x14, length * 2)
        if not raw or len(raw) != length * 2:
            return ""
        try:
            return raw.decode("utf-16-le", errors="ignore").strip("\x00")
        except ValueError:
            return ""


def read_guarded_battle_frame(
    source: MemorySource,
    layout: FieldLayout,
    *,
    assembly_name: str = "GameAssembly.dll",
    max_reads: int = 256,
    max_units: int = 48,
    max_enemies: int = 64,
) -> tuple[BattleFrameSample | None, str]:
    """Read one battle frame guarded by before/after controller & tick checks.

    Returns `(sample, reason)` where `reason` is `'ok'`, `'idle'`, `'torn'`, or `'budget'`.
    """
    base = source.module_base(assembly_name)
    if not base:
        return None, "idle"

    reader = GuardedFrameReader(source, max_reads=max_reads)
    static_slot = base + layout.controller_rva
    ctrl_before = reader.ptr(static_slot)
    if not ctrl_before:
        return None, "idle"
    if layout.instance_offset:
        ctrl_before = reader.ptr(ctrl_before + layout.instance_offset)
        if not ctrl_before:
            return None, "idle"

    tick_before = reader.i32(ctrl_before + layout.logic_tick_offset)
    if tick_before is None or tick_before < 0:
        return None, "idle"

    stage_id = reader.utf16_il2cpp_string(reader.ptr(ctrl_before + layout.stage_id_offset))

    units: list[UnitSample] = []
    unit_list = reader.ptr(ctrl_before + layout.unit_list_offset)
    if unit_list:
        count = reader.i32(unit_list + layout.list_size_offset) or 0
        items_arr = reader.ptr(unit_list + layout.list_items_offset)
        if items_arr and 0 < count <= max_units:
            for idx in range(count):
                u_ptr = reader.ptr(items_arr + layout.array_first_offset + idx * 8)
                if not u_ptr:
                    continue
                inst_id = reader.i32(u_ptr + layout.unit_instance_id_offset)
                char_id = reader.utf16_il2cpp_string(reader.ptr(u_ptr + layout.unit_char_id_offset))
                if inst_id is None or not char_id:
                    continue
                name = reader.utf16_il2cpp_string(reader.ptr(u_ptr + layout.unit_name_offset))
                seat_raw = reader.i32(u_ptr + layout.unit_seat_offset)
                seat = seat_raw if seat_raw in (1, 2, 3, 4) else None
                flags = reader.u32(u_ptr + layout.unit_flags_offset) or 0
                host_inst = reader.i32(u_ptr + layout.unit_host_inst_offset)
                stats_ptr = reader.ptr(u_ptr + layout.unit_stats_offset)
                channels = reader.f64_tuple(stats_ptr + layout.stats_channels_offset, 5) if stats_ptr else None
                if channels is None:
                    continue
                phys, arts, true_dmg, elem, heal = channels
                units.append(
                    UnitSample(
                        instance_id=inst_id,
                        unit_id=char_id,
                        name=name,
                        owner_seat=seat,
                        host_instance_id=host_inst if host_inst and host_inst > 0 else None,
                        on_field=bool(flags & 1),
                        is_summon=bool(flags & 2),
                        is_device=bool(flags & 4),
                        physical=phys,
                        arts=arts,
                        true=true_dmg,
                        elemental=elem,
                        healing=heal,
                    )
                )

    enemies: list[EnemySample] = []
    enemy_list = reader.ptr(ctrl_before + layout.enemy_list_offset)
    if enemy_list:
        e_count = reader.i32(enemy_list + layout.list_size_offset) or 0
        e_arr = reader.ptr(enemy_list + layout.list_items_offset)
        if e_arr and 0 < e_count <= max_enemies:
            for idx in range(e_count):
                e_ptr = reader.ptr(e_arr + layout.array_first_offset + idx * 8)
                if not e_ptr:
                    continue
                e_inst = reader.i32(e_ptr + layout.enemy_instance_id_offset)
                if e_inst is None:
                    continue
                e_id = reader.utf16_il2cpp_string(reader.ptr(e_ptr + layout.enemy_id_offset))
                e_name = reader.utf16_il2cpp_string(reader.ptr(e_ptr + layout.enemy_name_offset))
                hp_pair = reader.f64_tuple(e_ptr + layout.enemy_hp_offset, 2)
                if hp_pair is None:
                    continue
                e_flags = reader.u32(e_ptr + layout.enemy_flags_offset) or 0
                enemies.append(
                    EnemySample(
                        instance_id=e_inst,
                        enemy_id=e_id,
                        name=e_name,
                        hp=hp_pair[0],
                        max_hp=hp_pair[1],
                        is_boss=bool(e_flags & 1),
                    )
                )

    if reader.reads_used >= reader.max_reads:
        return None, "budget"

    # Closing bracket guard: verify same BattleController instance & non-torn logic frame
    ctrl_after = reader.ptr(static_slot)
    if layout.instance_offset and ctrl_after:
        ctrl_after = reader.ptr(ctrl_after + layout.instance_offset)
    tick_after = reader.i32(ctrl_before + layout.logic_tick_offset) if ctrl_after == ctrl_before else None

    if ctrl_after != ctrl_before or tick_after is None or tick_after < tick_before or (tick_after - tick_before) > 2:
        return None, "torn"

    battle_id = f"{ctrl_before:x}:{stage_id or 'stage'}"
    return (
        BattleFrameSample(
            battle_id=battle_id,
            logic_tick=tick_after,
            stage_id=stage_id,
            units=tuple(units),
            enemies=tuple(enemies),
            source="memory_readonly",
        ),
        "ok",
    )


def verify_client_metadata(exe_path: Path) -> tuple[bool, str]:
    """Check client build fingerprint & whether standard IL2CPP metadata header is readable."""
    try:
        assembly = exe_path.parent / "GameAssembly.dll"
        metadata = exe_path.parent / "Arknights_Data" / "il2cpp_data" / "Metadata" / "global-metadata.dat"
        if not assembly.is_file():
            return False, "missing_assembly"
        stat = assembly.stat()
        with assembly.open("rb") as fh:
            pe_head = fh.read(4096)
        fingerprint = hashlib.sha256(pe_head + str(stat.st_size).encode("ascii")).hexdigest()[:16]
        if not metadata.is_file():
            return False, f"missing_metadata:{fingerprint}"
        with metadata.open("rb") as fh:
            head = fh.read(8)
        if len(head) < 8:
            return False, f"truncated_metadata:{fingerprint}"
        magic, version = struct.unpack("<II", head)
        if magic != IL2CPP_METADATA_MAGIC:
            # Protected/obfuscated metadata header: degrade cleanly without probing blindly
            return False, f"protected_metadata:{fingerprint}"
        return True, f"il2cpp_v{version}:{fingerprint}"
    except OSError:
        return False, "io_error"


# Win32 Read-Only Process Adapter (loaded only on Windows)
if sys.platform == "win32":
    class _PROCESSENTRY32W(ct.Structure):
        _fields_ = [
            ("dwSize", wt.DWORD),
            ("cntUsage", wt.DWORD),
            ("th32ProcessID", wt.DWORD),
            ("th32DefaultHeapID", ct.c_size_t),
            ("th32ModuleID", wt.DWORD),
            ("cntThreads", wt.DWORD),
            ("th32ParentProcessID", wt.DWORD),
            ("pcPriClassBase", wt.LONG),
            ("dwFlags", wt.DWORD),
            ("szExeFile", wt.WCHAR * 260),
        ]

    class _MODULEENTRY32W(ct.Structure):
        _fields_ = [
            ("dwSize", wt.DWORD),
            ("th32ModuleID", wt.DWORD),
            ("th32ProcessID", wt.DWORD),
            ("GlblcntUsage", wt.DWORD),
            ("ProccntUsage", wt.DWORD),
            ("modBaseAddr", ct.c_void_p),
            ("modBaseSize", wt.DWORD),
            ("hModule", wt.HMODULE),
            ("szModule", wt.WCHAR * 256),
            ("szExePath", wt.WCHAR * 260),
        ]

    _k32 = ct.WinDLL("kernel32", use_last_error=True)
    _k32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
    _k32.OpenProcess.restype = wt.HANDLE
    _k32.CloseHandle.argtypes = [wt.HANDLE]
    _k32.CloseHandle.restype = wt.BOOL
    _k32.ReadProcessMemory.argtypes = [wt.HANDLE, ct.c_void_p, ct.c_void_p, ct.c_size_t, ct.POINTER(ct.c_size_t)]
    _k32.ReadProcessMemory.restype = wt.BOOL
    _k32.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
    _k32.CreateToolhelp32Snapshot.restype = wt.HANDLE
    _k32.Process32FirstW.argtypes = [wt.HANDLE, ct.POINTER(_PROCESSENTRY32W)]
    _k32.Process32FirstW.restype = wt.BOOL
    _k32.Process32NextW.argtypes = [wt.HANDLE, ct.POINTER(_PROCESSENTRY32W)]
    _k32.Process32NextW.restype = wt.BOOL
    _k32.Module32FirstW.argtypes = [wt.HANDLE, ct.POINTER(_MODULEENTRY32W)]
    _k32.Module32FirstW.restype = wt.BOOL
    _k32.Module32NextW.argtypes = [wt.HANDLE, ct.POINTER(_MODULEENTRY32W)]
    _k32.Module32NextW.restype = wt.BOOL


class Win32ReadOnlyProcess(MemorySource):
    """Strictly read-only Win32 process handle wrapper."""

    def __init__(self, pid: int, handle: int, exe_path: Path, modules: dict[str, int]) -> None:
        self.pid = pid
        self._handle = handle
        self.exe_path = exe_path
        self._modules = {k.lower(): v for k, v in modules.items()}

    @classmethod
    def attach_arknights(cls) -> Win32ReadOnlyProcess | None:
        if sys.platform != "win32":
            return None
        snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
        if not snap or snap == INVALID_HANDLE_VALUE:
            return None
        target_pid = 0
        try:
            entry = _PROCESSENTRY32W()
            entry.dwSize = ct.sizeof(_PROCESSENTRY32W)
            ok = _k32.Process32FirstW(snap, ct.byref(entry))
            while ok:
                if entry.szExeFile.lower() in TARGET_EXE_NAMES:
                    target_pid = int(entry.th32ProcessID)
                    break
                ok = _k32.Process32NextW(snap, ct.byref(entry))
        finally:
            _k32.CloseHandle(snap)
        if not target_pid:
            return None

        mod_snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, target_pid)
        if not mod_snap or mod_snap == INVALID_HANDLE_VALUE:
            return None
        modules: dict[str, int] = {}
        exe_path: Path | None = None
        try:
            mod = _MODULEENTRY32W()
            mod.dwSize = ct.sizeof(_MODULEENTRY32W)
            ok = _k32.Module32FirstW(mod_snap, ct.byref(mod))
            while ok:
                base = int(mod.modBaseAddr or 0)
                if base > 0:
                    modules[mod.szModule] = base
                    if mod.szModule.lower() in TARGET_EXE_NAMES:
                        exe_path = Path(mod.szExePath)
                ok = _k32.Module32NextW(mod_snap, ct.byref(mod))
        finally:
            _k32.CloseHandle(mod_snap)

        if exe_path is None:
            return None
        handle = _k32.OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, False, target_pid)
        if not handle:
            return None
        return cls(target_pid, int(handle), exe_path, modules)

    def module_base(self, module_name: str) -> int | None:
        return self._modules.get(module_name.lower())

    def read_bytes(self, address: int, size: int) -> bytes | None:
        if not self._handle or size <= 0:
            return None
        buf = ct.create_string_buffer(size)
        read_n = ct.c_size_t(0)
        ok = _k32.ReadProcessMemory(self._handle, ct.c_void_p(address), buf, size, ct.byref(read_n))
        if not ok or read_n.value != size:
            return None
        return buf.raw

    def close(self) -> None:
        if self._handle and sys.platform == "win32":
            _k32.CloseHandle(self._handle)
            self._handle = 0


class PcBattleInspector:
    """High-level non-intrusive battle inspector with automatic build verification & fallback."""

    def __init__(
        self,
        *,
        layout_registry: dict[str, FieldLayout] | None = None,
        source_factory=None,
    ) -> None:
        self._layouts = dict(layout_registry or {})
        self._source_factory = source_factory or Win32ReadOnlyProcess.attach_arknights
        self._process: MemorySource | None = None
        self._active_layout: FieldLayout | None = None
        self.status: str = "standby"
        self.build_tag: str = ""
        self.torn_reads: int = 0
        self.successful_polls: int = 0

    def register_layout(self, build_tag: str, layout: FieldLayout) -> None:
        self._layouts[build_tag] = layout

    def close(self) -> None:
        if self._process is not None:
            self._process.close()
            self._process = None
        self._active_layout = None
        self.status = "standby"

    def poll(self) -> BattleFrameSample | None:
        if self._process is None:
            proc = self._source_factory()
            if proc is None:
                self.status = "standby"
                return None
            self._process = proc
            exe_path = getattr(proc, "exe_path", None)
            if isinstance(exe_path, Path):
                verified, tag = verify_client_metadata(exe_path)
                self.build_tag = tag
                self._active_layout = self._layouts.get(tag) or self._layouts.get("*")
                if not verified and self._active_layout is None:
                    self.status = "standby_protected"
                    return None
                if self._active_layout is None:
                    self.status = "standby_unverified"
                    return None
            else:
                self._active_layout = self._layouts.get("*")
                if self._active_layout is None:
                    self.status = "standby_unverified"
                    return None

        if self._active_layout is None:
            return None

        frame, reason = read_guarded_battle_frame(self._process, self._active_layout)
        if reason == "ok" and frame is not None:
            self.status = "active"
            self.successful_polls += 1
            return frame
        if reason == "torn":
            self.torn_reads += 1
            return None
        if reason == "idle":
            # Verify process is still alive via module base read; if gone, detach cleanly
            base = self._process.module_base("GameAssembly.dll")
            if not base or self._process.read_bytes(base, 2) != b"MZ":
                if getattr(self._process, "exe_path", None) is not None:
                    self.close()
                    return None
            self.status = "idle_lobby"
        return None
