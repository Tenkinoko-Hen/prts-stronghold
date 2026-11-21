"""Windows IPv4 capture restricted to TCP connections owned by Arknights.exe."""

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


class ProcessEntry(ct.Structure):
    _fields_ = [
        ("size", wt.DWORD), ("usage", wt.DWORD), ("pid", wt.DWORD),
        ("heap", ct.c_size_t), ("module", wt.DWORD), ("threads", wt.DWORD),
        ("parent", wt.DWORD), ("priority", wt.LONG), ("flags", wt.DWORD),
        ("exe", wt.WCHAR * 260),
    ]


def game_pids() -> set[int]:
    kernel = ct.windll.kernel32
    kernel.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wt.HANDLE
    kernel.Process32FirstW.argtypes = kernel.Process32NextW.argtypes = [wt.HANDLE, ct.POINTER(ProcessEntry)]
    kernel.CloseHandle.argtypes = [wt.HANDLE]
    snapshot = kernel.CreateToolhelp32Snapshot(2, 0)  # TH32CS_SNAPPROCESS
    if snapshot == ct.c_void_p(-1).value:
        raise OSError("Process snapshot unavailable")
    try:
        result: set[int] = set()
        entry = ProcessEntry(size=ct.sizeof(ProcessEntry))
        found = kernel.Process32FirstW(snapshot, ct.byref(entry))
        while found:
            if entry.exe.casefold() == "arknights.exe":
                result.add(entry.pid)
            found = kernel.Process32NextW(snapshot, ct.byref(entry))
        return result
    finally:
        kernel.CloseHandle(snapshot)


def game_connections(pids: set[int]) -> set[Connection]:
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
    count = struct.unpack_from("<I", buffer)[0]
    result: set[Connection] = set()
    for index in range(min(count, (len(buffer) - 4) // 24)):
        offset = 4 + index * 24
        local, remote, pid = struct.unpack_from("4x4s4x4s4xI", buffer, offset)
        if pid not in pids or local == b"\0" * 4 or remote == b"\0" * 4:
            continue
        local_port = struct.unpack_from("!H", buffer, offset + 8)[0]
        remote_port = struct.unpack_from("!H", buffer, offset + 16)[0]
        if remote_port:
            result.add(((socket.inet_ntoa(local), local_port), (socket.inet_ntoa(remote), remote_port)))
    return result


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


def segments(
    stopped: Event, on_status: Callable[[str], None],
) -> Iterator[tuple[Segment, Direction] | None]:
    receivers: dict[str, socket.socket | NpcapReceiver] = {}
    connections: set[Connection] = set()
    pids: set[int] = set()
    deferred: deque[Segment] = deque(maxlen=_MAX_DEFERRED)
    next_refresh = 0.0
    next_connection_check = 0.0
    last_backend = ''
    game_servers = set()

    def defer_game(segment: Segment) -> None:
        if (segment.src in game_servers or segment.dst in game_servers
                or segment.src[1] == 8443 or segment.dst[1] == 8443):
            deferred.append(segment)

    try:
        while not stopped.is_set():
            now = monotonic()
            refresh_receivers = now >= next_refresh
            if refresh_receivers:
                pids = game_pids()
            checked = refresh_receivers or (bool(deferred) and now >= next_connection_check)
            if checked:
                connections = game_connections(pids)
                game_servers = {server for _, server in connections}
                next_connection_check = now + _CONNECTION_INTERVAL
            if refresh_receivers:
                connected = {client[0] for client, _ in connections}
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
                    result = read_segment(packet, connections, defer_game)
                    if result is None:
                        break  # 新连接先交回外层刷表，不用后续包挤掉待确认的首包。
                    yield result
                    if stopped.is_set() or not select([receiver], [], [], 0)[0]:
                        break
            yield None
    finally:
        for receiver in receivers.values():
            receiver.close()
