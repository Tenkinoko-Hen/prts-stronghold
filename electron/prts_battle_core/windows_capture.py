# 青逝痕 Tenkinoko 制作
"""Windows IPv4 capture restricted to TCP connections owned by Arknights.exe or MuMu."""

from collections import deque
import ctypes as ct
from ctypes import wintypes as wt
from dataclasses import dataclass
from select import select
import socket
import struct
import sys
from threading import Event
from time import monotonic
from typing import Callable, Iterator, Literal
from .npcap_input import NpcapReceiver

Endpoint = tuple[str, int]
Direction = Literal["up", "down"]
Connection = tuple[Endpoint, Endpoint]
_CONNECTION_INTERVAL = 0.08
_MAX_DEFERRED = 64
_DWMWA_EXTENDED_FRAME_BOUNDS = 9
_MUMU_CONTROL_PORTS = frozenset({5037, 7555})
_WEB_PORTS = frozenset({80, 443})
_STRONGHOLD_DEFER_IDS = frozenset({1, 2, 300, 302, 303, 306, 310, 311, 313, 341, 344, 348, 366, 367})
_MUMU_HUB_TITLE_KEYWORDS = (
    "多开器",
    "游戏中心",
    "应用中心",
    "模拟器中心",
    "multi-instance",
    "multi instance",
    "app center",
)

PC_PROCESS_NAMES = frozenset({"arknights.exe"})
# Emulator player processes that host an actual Android display window.
MUMU_WINDOW_PROCESS_NAMES = frozenset({
    "mumunxdevice.exe",
    "mumuplayer.exe",
    "nemuplayer.exe",
})
# Processes that prove an actual MuMu Android emulator instance is running
# (excludes launcher-only MuMuNxMain.exe and idle background services).
MUMU_INSTANCE_PROCESS_NAMES = MUMU_WINDOW_PROCESS_NAMES | frozenset({
    "mumuvmmheadless.exe",
    "nemuheadless.exe",
})
# All MuMu emulator / hypervisor processes that may own guest NAT TCP sockets.
MUMU_PROCESS_NAMES = MUMU_INSTANCE_PROCESS_NAMES | frozenset({
    "mumunxmain.exe",
    "mumuvmmservice.exe",
    "mumuvmmsvc.exe",
    "mumunxsvc.exe",
})


@dataclass(frozen=True)
class Segment:
    time: float
    src: Endpoint
    dst: Endpoint
    payload: bytes
    seq: int
    syn: bool
    ack: bool
    fin: bool
    rst: bool
    ack_sequence: int | None = None


@dataclass(frozen=True)
class RetiredConnections:
    keys: frozenset[Connection]


class ProcessEntry(ct.Structure):
    _fields_ = [
        ("size", wt.DWORD), ("usage", wt.DWORD), ("pid", wt.DWORD),
        ("heap", ct.c_size_t), ("module", wt.DWORD), ("threads", wt.DWORD),
        ("parent", wt.DWORD), ("priority", wt.LONG), ("flags", wt.DWORD),
        ("exe", wt.WCHAR * 260),
    ]


def list_process_map() -> dict[int, str]:
    if not hasattr(ct, "windll"):
        return {}
    kernel = ct.windll.kernel32
    kernel.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wt.HANDLE
    kernel.Process32FirstW.argtypes = kernel.Process32NextW.argtypes = [wt.HANDLE, ct.POINTER(ProcessEntry)]
    kernel.CloseHandle.argtypes = [wt.HANDLE]
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)  # TH32CS_SNAPPROCESS
    if snapshot == ct.c_void_p(-1).value:
        raise OSError("Process snapshot unavailable")
    try:
        result: dict[int, str] = {}
        entry = ProcessEntry(size=ct.sizeof(ProcessEntry))
        found = kernel.Process32FirstW(snapshot, ct.byref(entry))
        while found:
            if entry.exe:
                result[int(entry.pid)] = entry.exe.casefold()
            found = kernel.Process32NextW(snapshot, ct.byref(entry))
        return result
    finally:
        kernel.CloseHandle(snapshot)


def game_pids() -> set[int]:
    return {pid for pid, exe in list_process_map().items() if exe in PC_PROCESS_NAMES}


def _is_arknights_title(title: str) -> bool:
    folded = title.casefold()
    return "明日方舟" in title or "arknights" in folded


def _is_mumu_hub_title(title: str) -> bool:
    folded = title.casefold()
    return any(keyword in title or keyword in folded for keyword in _MUMU_HUB_TITLE_KEYWORDS)


def _select_best_mumu_window(candidates: list[tuple[str, str, int, int, int, int]]) -> dict | None:
    """Pick the best MuMu emulator window from (exe, title, x, y, width, height) in Z-order.

    MuMu Player 12 (v4/v5 `MuMuNxDevice.exe`) renders app tabs internally in Qt while keeping
    the Win32 top-level title as the instance name (e.g. `MuMu安卓设备-1`). Prefer explicit
    Arknights/明日方舟 titles when present, and otherwise dock to the largest visible emulator
    instance window (excluding launcher/hub windows).
    """
    best_rank: tuple[int, int] | None = None
    best_window: dict | None = None
    for exe, raw_title, x, y, width, height in candidates:
        exe_key = exe.casefold()
        title = raw_title.strip()
        if not title or width < 300 or height < 200:
            continue
        if _is_arknights_title(title) and exe_key in MUMU_PROCESS_NAMES:
            tier = 2
        elif exe_key in MUMU_WINDOW_PROCESS_NAMES and not _is_mumu_hub_title(title):
            tier = 1
        else:
            continue
        rank = (tier, int(width) * int(height))
        if best_rank is None or rank > best_rank:
            best_rank = rank
            best_window = {
                "title": title,
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
            }
    return best_window


def find_mumu_arknights_window(process_map: dict[int, str]) -> dict | None:
    mumu_pids = {pid: exe.casefold() for pid, exe in process_map.items() if exe.casefold() in MUMU_PROCESS_NAMES}
    if not mumu_pids or not hasattr(ct, "windll"):
        return None
    user32 = ct.windll.user32
    dwmapi = getattr(ct.windll, "dwmapi", None)
    enum_proc = ct.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    user32.EnumWindows.argtypes = [enum_proc, wt.LPARAM]
    user32.EnumWindows.restype = wt.BOOL
    user32.IsWindowVisible.argtypes = [wt.HWND]
    user32.IsWindowVisible.restype = wt.BOOL
    user32.IsIconic.argtypes = [wt.HWND]
    user32.IsIconic.restype = wt.BOOL
    user32.GetWindowThreadProcessId.argtypes = [wt.HWND, ct.POINTER(wt.DWORD)]
    user32.GetWindowThreadProcessId.restype = wt.DWORD
    user32.GetWindowTextLengthW.argtypes = [wt.HWND]
    user32.GetWindowTextLengthW.restype = ct.c_int
    user32.GetWindowTextW.argtypes = [wt.HWND, wt.LPWSTR, ct.c_int]
    user32.GetWindowTextW.restype = ct.c_int
    user32.GetWindowRect.argtypes = [wt.HWND, ct.POINTER(wt.RECT)]
    user32.GetWindowRect.restype = wt.BOOL
    if dwmapi is not None and hasattr(dwmapi, "DwmGetWindowAttribute"):
        dwmapi.DwmGetWindowAttribute.argtypes = [wt.HWND, wt.DWORD, ct.c_void_p, wt.DWORD]
        dwmapi.DwmGetWindowAttribute.restype = ct.c_long

    candidates: list[tuple[str, str, int, int, int, int]] = []

    def callback(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd):
            return True
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ct.byref(pid))
        exe = mumu_pids.get(pid.value)
        if exe is None:
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ct.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value.strip()
        if not title:
            return True
        rect = wt.RECT()
        got_rect = False
        if dwmapi is not None and hasattr(dwmapi, "DwmGetWindowAttribute"):
            try:
                got_rect = dwmapi.DwmGetWindowAttribute(
                    hwnd, _DWMWA_EXTENDED_FRAME_BOUNDS, ct.byref(rect), ct.sizeof(rect)
                ) == 0
            except OSError:
                got_rect = False
        if not got_rect and not user32.GetWindowRect(hwnd, ct.byref(rect)):
            return True
        width = int(rect.right - rect.left)
        height = int(rect.bottom - rect.top)
        if width < 300 or height < 200:
            return True
        candidates.append((exe, title, int(rect.left), int(rect.top), width, height))
        return True

    user32.EnumWindows(enum_proc(callback), 0)
    return _select_best_mumu_window(candidates)


find_mumu_window = find_mumu_arknights_window


def resolve_capture_target(
    process_map: dict[int, str],
    mumu_window: dict | None,
    *,
    has_mumu_traffic: bool = False,
) -> tuple[str, set[int], dict | None]:
    pc_pids = {pid for pid, exe in process_map.items() if exe.casefold() in PC_PROCESS_NAMES}
    if pc_pids:
        return ("pc", pc_pids, None)
    mumu_instance_pids = {
        pid for pid, exe in process_map.items()
        if exe.casefold() in MUMU_INSTANCE_PROCESS_NAMES
    }
    mumu_pids = {pid for pid, exe in process_map.items() if exe.casefold() in MUMU_PROCESS_NAMES}
    if mumu_pids and (mumu_instance_pids or mumu_window is not None or has_mumu_traffic):
        return ("mumu", mumu_pids, mumu_window)
    return ("none", set(), None)


def _is_mumu_control_port(port: int) -> bool:
    return port in _MUMU_CONTROL_PORTS or 5555 <= port <= 5585 or 16384 <= port <= 16500


def _is_likely_stronghold_port(port: int) -> bool:
    return port == 8443 or 6000 <= port <= 6999


def _looks_like_stronghold_segment(segment: Segment) -> bool:
    if _is_likely_stronghold_port(segment.src[1]) or _is_likely_stronghold_port(segment.dst[1]):
        return True
    payload = segment.payload
    if len(payload) >= 8:
        length, message_id = struct.unpack_from("!II", payload, 0)
        if message_id in _STRONGHOLD_DEFER_IDS and 2 <= length <= 131072:
            return True
    if segment.syn and not segment.ack:
        dst_port = segment.dst[1]
        if (
            dst_port not in _WEB_PORTS
            and not _is_mumu_control_port(dst_port)
            and not segment.dst[0].startswith("127.")
        ):
            return True
    return False


def _parse_tcp_table(buffer: bytes, pids: set[int], *, exclude_mumu_control: bool = False) -> set[Connection]:
    count = struct.unpack_from("<I", buffer)[0]
    result: set[Connection] = set()
    for index in range(min(count, (len(buffer) - 4) // 24)):
        offset = 4 + index * 24
        state, local, remote, pid = struct.unpack_from("<I4s4x4s4xI", buffer, offset)
        # CLOSED, TIME_WAIT and DELETE_TCB can outlive the usable game stream in the table.
        if state in (1, 11, 12) or pid not in pids or local == b"\0" * 4 or remote == b"\0" * 4:
            continue
        local_port = struct.unpack_from("!H", buffer, offset + 8)[0]
        remote_port = struct.unpack_from("!H", buffer, offset + 16)[0]
        if not remote_port:
            continue
        local_ip = socket.inet_ntoa(local)
        remote_ip = socket.inet_ntoa(remote)
        if exclude_mumu_control and (
            local_ip.startswith("127.")
            or remote_ip.startswith("127.")
            or _is_mumu_control_port(local_port)
            or _is_mumu_control_port(remote_port)
        ):
            continue
        result.add(((local_ip, local_port), (remote_ip, remote_port)))
    return result


def game_connections(pids: set[int], *, exclude_mumu_control: bool = False) -> set[Connection]:
    if not pids:
        return set()
    table = ct.windll.iphlpapi.GetExtendedTcpTable
    table.argtypes = [ct.c_void_p, ct.POINTER(wt.DWORD), wt.BOOL, wt.DWORD, ct.c_int, wt.DWORD]
    size = wt.DWORD()
    # The table may grow between the size query and the read.
    buffer = None
    for _ in range(3):
        code = table(buffer, ct.byref(size), False, socket.AF_INET, 4, 0)  # TCP_TABLE_OWNER_PID_CONNECTIONS
        if code == 0 and buffer is not None:
            break
        if code != 122 or not 4 <= size.value <= 4 * 1024 * 1024:
            raise OSError("TCP table unavailable")
        buffer = ct.create_string_buffer(size.value)
    else:
        raise OSError("TCP table changed during read")
    return _parse_tcp_table(buffer, pids, exclude_mumu_control=exclude_mumu_control)


def read_segment(
    data: bytes, connections: set[Connection], defer: Callable[[Segment], None] | None = None,
) -> tuple[Segment, Direction] | None:
    if len(data) < 40 or data[0] >> 4 != 4 or data[9] != socket.IPPROTO_TCP:
        return None
    offset = (data[0] & 15) * 4
    size, fragment = struct.unpack_from("!H2xH", data, 2)
    if offset < 20 or fragment & 0x3FFF or not offset + 20 <= size <= len(data):
        return None
    tcp_header = (data[offset + 12] >> 4) * 4
    if tcp_header < 20 or offset + tcp_header > size:
        return None
    sport, dport, seq, ack_sequence = struct.unpack_from("!HHII", data, offset)
    src, dst = (socket.inet_ntoa(data[12:16]), sport), (socket.inet_ntoa(data[16:20]), dport)
    flags = data[offset + 13]
    ack = bool(flags & 16)
    segment = Segment(monotonic(), src, dst, data[offset + tcp_header:size], seq,
                      bool(flags & 2), ack, bool(flags & 1), bool(flags & 4),
                      ack_sequence if ack else None)
    owned = _match_connection(segment, connections)
    if owned is None and defer is not None and (segment.payload or segment.syn or segment.ack):
        defer(segment)
    return owned


def _match_connection(segment: Segment, connections: set[Connection]) -> tuple[Segment, Direction] | None:
    if (segment.src, segment.dst) in connections:
        return segment, "up"
    if (segment.dst, segment.src) in connections:
        return segment, "down"
    return None


def local_ipv4() -> set[str]:
    """进程刚启动、连接表还为空时，先准备本机已分配的 IPv4 接口。"""
    table = ct.windll.iphlpapi.GetIpAddrTable
    size = wt.DWORD()
    if table(None, ct.byref(size), False) != 122 or not 4 <= size.value <= 1024 * 1024:
        return set()
    buffer = ct.create_string_buffer(size.value)
    if table(buffer, ct.byref(size), False):
        return set()
    count, = struct.unpack_from('<I', buffer)
    ips = {socket.inet_ntoa(buffer[4 + i * 24:8 + i * 24])
           for i in range(min(count, (len(buffer) - 4) // 24))}
    return {ip for ip in ips if ip != '0.0.0.0' and not ip.startswith('127.')}


def open_raw_receiver(address: str) -> socket.socket:
    receiver = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
    try:
        try:
            receiver.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
        except OSError:
            pass  # 系统限制缓冲大小时仍可使用默认值。
        receiver.bind((address, 0))
        receiver.ioctl(socket.SIO_RCVALL, 3)  # RCVALL_IPLEVEL：不启用网卡混杂模式
        receiver.setblocking(False)
        return receiver
    except OSError:
        receiver.close()
        raise


def open_receiver(address: str):
    try:
        driver = NpcapReceiver.open(address)
    except OSError:
        driver = None
    return driver if driver is not None else open_raw_receiver(address)


_ORIGINAL_LIST_PROCESS_MAP = list_process_map
_ORIGINAL_GAME_PIDS = game_pids


def _window_shifted(a: dict | None, b: dict | None) -> bool:
    if (a is None) != (b is None):
        return True
    if a is None or b is None:
        return False
    if a.get("title") != b.get("title"):
        return True
    return any(abs(int(a[k]) - int(b[k])) > 4 for k in ("x", "y", "width", "height"))


def segments(
    stopped: Event,
    on_status: Callable[[str], None],
    on_source: Callable[[dict], None] | None = None,
) -> Iterator[tuple[Segment, Direction] | RetiredConnections | None]:
    receivers: dict[str, socket.socket | NpcapReceiver] = {}
    connections: set[Connection] = set()
    pids: set[int] = set()
    deferred: deque[Segment] = deque(maxlen=_MAX_DEFERRED)
    next_refresh = 0.0
    next_connection_check = 0.0
    last_backend = ''
    last_client: str | None = None
    last_window: dict | None = None
    client = 'none'
    mumu_window: dict | None = None
    game_servers = set()

    def defer_game(segment: Segment) -> None:
        if (segment.src in game_servers or segment.dst in game_servers
                or _looks_like_stronghold_segment(segment)):
            deferred.append(segment)

    try:
        while not stopped.is_set():
            now = monotonic()
            refresh_receivers = now >= next_refresh
            if refresh_receivers:
                if list_process_map is _ORIGINAL_LIST_PROCESS_MAP and game_pids is not _ORIGINAL_GAME_PIDS:
                    process_map = {pid: "arknights.exe" for pid in game_pids()}
                else:
                    process_map = list_process_map()
                detected_window = find_mumu_arknights_window(process_map)
                has_mumu_traffic = client == "mumu" and any(
                    _is_likely_stronghold_port(server[1]) for _, server in connections
                )
                client, pids, mumu_window = resolve_capture_target(
                    process_map, detected_window, has_mumu_traffic=has_mumu_traffic
                )
            checked = refresh_receivers or (bool(deferred) and now >= next_connection_check)
            if checked:
                previous = connections
                connections = (
                    game_connections(pids, exclude_mumu_control=True)
                    if client == "mumu"
                    else game_connections(pids)
                )
                game_servers = {server for _, server in connections}
                next_connection_check = now + _CONNECTION_INTERVAL
                if retired := previous - connections:
                    yield RetiredConnections(frozenset(retired))
            if refresh_receivers:
                if on_source is not None and (client != last_client or _window_shifted(mumu_window, last_window)):
                    on_source({"client": client, "mumuWindow": mumu_window})
                    last_client = client
                    last_window = dict(mumu_window) if mumu_window is not None else None
                connected = {client_ep[0] for client_ep, _ in connections}
                addresses = connected or ((set(receivers) or local_ipv4()) if pids else set())
                for address in list(receivers.keys() - addresses):
                    receivers.pop(address).close()
                for address in addresses - receivers.keys():
                    try:
                        receivers[address] = open_receiver(address)
                    except OSError:
                        continue
                if not receivers and connected:
                    raise OSError("Game connection capture unavailable")
                on_status("listening" if connected and receivers else "connecting" if pids else "waiting")
                next_refresh = now + (0.25 if pids else 0.75)
            if checked:
                # 首包可能早于连接表缓存刷新。最多留一轮，只处理已确认的游戏连接。
                while deferred:
                    result = _match_connection(deferred.popleft(), connections)
                    if result is not None:
                        yield result
            if not receivers:
                last_backend = ''
                yield None
                stopped.wait(0.25)
                continue
            timeout = max(0, next_connection_check - monotonic()) if deferred else 0.25
            drivers = [(addr, r) for addr, r in receivers.items() if isinstance(r, NpcapReceiver)]
            raw = [r for r in receivers.values() if not isinstance(r, NpcapReceiver)]
            backend = 'mixed' if raw and drivers else 'npcap' if drivers else 'winsock'
            if backend != last_backend:
                print('PRTS_CAPTURE_SOURCE', backend, file=sys.stderr, flush=True)
                last_backend = backend
            received = False
            for address, driver in drivers:
                try:
                    for _ in range(64):
                        packet = driver.recv()
                        if packet is None:
                            break
                        received = True
                        result = read_segment(packet, connections, defer_game)
                        if result is not None:
                            yield result
                except OSError:
                    driver.close()
                    del receivers[address]
                    try:
                        receivers[address] = open_raw_receiver(address)
                    except OSError:
                        if not receivers:
                            raise
            if drivers:
                timeout = 0 if received else min(timeout, 0.01)
            ready = select(raw, [], [], timeout)[0] if raw else []
            if not raw and timeout:
                stopped.wait(timeout)
            for receiver in ready:
                # 和驱动通道一样成批取走已排队的数据，再给其他接口和连接表让出时间。
                for _ in range(64):
                    try:
                        packet = receiver.recv(65535)
                    except BlockingIOError:
                        break
                    deferred_before = len(deferred)
                    result = read_segment(packet, connections, defer_game)
                    if result is None:
                        if len(deferred) > deferred_before:
                            break  # 命中疑似新游戏连接的首包时交回外层刷表；无关系统包继续排空。
                        if stopped.is_set() or not select([receiver], [], [], 0)[0]:
                            break
                        continue
                    yield result
                    if stopped.is_set() or not select([receiver], [], [], 0)[0]:
                        break
            yield None
    finally:
        for receiver in receivers.values():
            receiver.close()
