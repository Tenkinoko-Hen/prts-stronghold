# 青逝痕 Tenkinoko 制作
"""使用本机已经安装的 Npcap；不安装驱动、不保存原始包。"""

import ctypes as ct
from functools import cache
from pathlib import Path
import socket
import struct


class _Address(ct.Structure):
    pass


class _Device(ct.Structure):
    pass


_Address._fields_ = [('next', ct.POINTER(_Address)), ('addr', ct.c_void_p),
                      ('mask', ct.c_void_p), ('broadcast', ct.c_void_p), ('dest', ct.c_void_p)]
_Device._fields_ = [('next', ct.POINTER(_Device)), ('name', ct.c_char_p), ('description', ct.c_void_p),
                     ('addresses', ct.POINTER(_Address)), ('flags', ct.c_uint32)]


class _Filter(ct.Structure):
    _fields_ = [('length', ct.c_uint), ('code', ct.c_void_p)]


class _Header(ct.Structure):
    _fields_ = [('seconds', ct.c_int32), ('micros', ct.c_int32), ('caplen', ct.c_uint32), ('size', ct.c_uint32)]


@cache
def _library():
    directory = ct.create_unicode_buffer(520)
    n = ct.windll.kernel32.GetSystemDirectoryW(directory, len(directory))
    if not 0 < n < len(directory):
        return None
    path = Path(directory.value) / 'Npcap' / 'wpcap.dll'
    if not path.is_file():
        return None
    void, char, integer = ct.c_void_p, ct.c_char_p, ct.c_int
    try:
        lib = ct.CDLL(str(path), winmode=0x900)  # DLL 所在目录和 System32
        signatures = {
            'findalldevs': (integer, [ct.POINTER(ct.POINTER(_Device)), char]),
            'freealldevs': (None, [ct.POINTER(_Device)]),
            'open_live': (void, [char, integer, integer, integer, char]),
            'close': (None, [void]), 'datalink': (integer, [void]),
            'compile': (integer, [void, ct.POINTER(_Filter), char, integer, ct.c_uint32]),
            'setfilter': (integer, [void, ct.POINTER(_Filter)]), 'freecode': (None, [ct.POINTER(_Filter)]),
            'setnonblock': (integer, [void, integer, char]),
            'next_ex': (integer, [void, ct.POINTER(ct.POINTER(_Header)), ct.POINTER(void)]),
        }
        for name, (result, args) in signatures.items():
            fn = getattr(lib, 'pcap_' + name)
            fn.restype, fn.argtypes = result, args
        return lib
    except (AttributeError, OSError):
        return None


def _device_for(lib, address: bytes, error) -> bytes | None:
    devices = ct.POINTER(_Device)()
    if lib.pcap_findalldevs(ct.byref(devices), error) != 0:
        return None
    try:
        item = devices
        while item:
            device = item.contents
            ptr = device.addresses
            while ptr:
                addr = ptr.contents.addr
                if (addr and ct.c_ushort.from_address(addr).value == socket.AF_INET
                        and ct.string_at(addr + 4, 4) == address):
                    return device.name
                ptr = ptr.contents.next
            item = device.next
    finally:
        lib.pcap_freealldevs(devices)
    return None


def ipv4_payload(frame: bytes, link: int) -> bytes:
    if link == 1 and len(frame) >= 14:  # Ethernet；可选的 VLAN 标记
        pos = 14
        kind = struct.unpack_from('!H', frame, 12)[0]
        while kind in (0x8100, 0x88a8) and pos + 4 <= len(frame):
            kind = struct.unpack_from('!H', frame, pos + 2)[0]
            pos += 4
        return frame[pos:] if kind == 0x0800 else b''
    if link in (0, 108) and frame[:4] in (b'\x02\0\0\0', b'\0\0\0\x02'):
        return frame[4:]
    return frame if link in (12, 101, 228) and frame[:1] and frame[0] >> 4 == 4 else b''


class NpcapReceiver:
    def __init__(self, lib, handle, link: int):
        self.lib, self.handle, self.link = lib, handle, link

    @classmethod
    def open(cls, address: str):
        lib = _library()
        if lib is None:
            return None
        error = ct.create_string_buffer(256)
        name = _device_for(lib, socket.inet_aton(address), error)
        handle = lib.pcap_open_live(name, 262144, 0, 10, error) if name else None
        if not handle:
            return None
        success = False
        try:
            link = lib.pcap_datalink(handle)
            if link not in (0, 1, 12, 101, 108, 228) or lib.pcap_setnonblock(handle, 1, error) != 0:
                return None
            program = _Filter()
            # 驱动先限制到本机接口的 IPv4 TCP；交给分析器前仍须命中游戏进程连接。
            base = f'ip and tcp and host {socket.inet_ntoa(socket.inet_aton(address))}'
            expression = f'({base}) or (vlan and {base})' if link == 1 else base
            if lib.pcap_compile(handle, ct.byref(program), expression.encode('ascii'), 1, 0xffffffff):
                return None
            try:
                if lib.pcap_setfilter(handle, ct.byref(program)):
                    return None
            finally:
                lib.pcap_freecode(ct.byref(program))
            success = True
            return cls(lib, handle, link)
        finally:
            if not success:
                lib.pcap_close(handle)

    def recv(self) -> bytes | None:
        header, data = ct.POINTER(_Header)(), ct.c_void_p()
        status = self.lib.pcap_next_ex(self.handle, ct.byref(header), ct.byref(data))
        if status == 0:
            return None
        if status != 1 or not header or not data:
            raise OSError('Npcap receiver unavailable')
        size = header.contents.caplen
        if size != header.contents.size or size > 262144:
            return b''
        return ipv4_payload(ct.string_at(data, size), self.link)

    def close(self):
        self.lib.pcap_close(self.handle)
