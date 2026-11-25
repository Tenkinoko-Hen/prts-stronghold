# 青逝痕 Tenkinoko 制作
"""Directional TCP reassembly for live and saved captures."""
import heapq


class TcpStream:
    def __init__(self):
        self.next_seq = None
        self.pending = []
        self.buffered = 0
        self.saw_syn = False
        self.acknowledged_seq = None

    def _unwrap(self, seq):
        delta = (seq - self.next_seq + 2147483648) % 4294967296 - 2147483648
        return self.next_seq + delta

    def acknowledge(self, seq: int) -> None:
        """Record the next byte expected by the receiving TCP endpoint."""
        if self.next_seq is not None:
            end = self._unwrap(seq)
            if end > self.next_seq and (self.acknowledged_seq is None or end > self.acknowledged_seq):
                self.acknowledged_seq = end

    def resume_acknowledged(self) -> bytes:
        if not self.pending or self.acknowledged_seq is None or self.pending[0][0] > self.acknowledged_seq:
            return b""
        self.next_seq = self.pending[0][0]
        return self._drain([])

    def contiguous_after_gap(self) -> tuple[int, bytes]:
        if not self.pending:
            return (0, b"")
        start = end = self.pending[0][0]
        chunks = []
        for position, payload in sorted(self.pending):
            if position > end:
                break
            extra = payload[end - position:]
            chunks.append(extra)
            end += len(extra)
        return (start, b"".join(chunks))

    def resume_at(self, sequence: int) -> bytes:
        self.next_seq = sequence
        return self._drain([])

    @property
    def missing_bytes(self):
        return self.pending[0][0] - self.next_seq if self.pending else 0
    def feed(self, seq, payload, *, syn=False):
        if syn:
            self.saw_syn = True
            seq = (seq + 1) & 0xFFFFFFFF
        if self.next_seq is None:
            if not syn and not payload:
                return b""
            self.next_seq = seq
        if not payload:
            return b""
        start = self._unwrap(seq)
        if start + len(payload) <= self.next_seq:
            return b""
        if start > self.next_seq:
            if start - self.next_seq > 8388608 or self.buffered > 8388608:
                raise ValueError("TCP 字节缺失，后续片段超过重组范围")
            heapq.heappush(self.pending, (start, payload))
            self.buffered += len(payload)
            return b""
        chunks = [payload[self.next_seq - start:]]
        self.next_seq = start + len(payload)
        return self._drain(chunks)

    def _drain(self, chunks: list[bytes]) -> bytes:
        while self.pending and self.pending[0][0] <= self.next_seq:
            pending_start, pending_data = heapq.heappop(self.pending)
            self.buffered -= len(pending_data)
            extra = pending_data[self.next_seq - pending_start:]
            if extra:
                chunks.append(extra)
                self.next_seq += len(extra)
        return b"".join(chunks)
