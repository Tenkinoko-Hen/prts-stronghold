package com.prts.stronghold.mobile;

import java.nio.charset.StandardCharsets;

public final class LanSyncBridgeTest {
    private static int checks;

    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError("Failed: " + label);
    }

    public static void main(String[] args) {
        check(LanSyncBridge.isPrivateLanIpv4("127.0.0.1"), "loopback");
        check(LanSyncBridge.isPrivateLanIpv4("192.168.1.42"), "192.168");
        check(LanSyncBridge.isPrivateLanIpv4("10.12.0.8"), "10.x");
        check(LanSyncBridge.isPrivateLanIpv4("172.16.0.1"), "172.16");
        check(LanSyncBridge.isPrivateLanIpv4("172.31.255.254"), "172.31");
        check(!LanSyncBridge.isPrivateLanIpv4("172.32.0.1"), "reject 172.32");
        check(!LanSyncBridge.isPrivateLanIpv4("8.8.8.8"), "reject public");
        check(!LanSyncBridge.isPrivateLanIpv4("example.com"), "reject domain");

        String[] outHost = new String[1];
        int[] port = LanSyncBridge.parseHostPort("http://192.168.31.9:39527/api", outHost);
        check(port != null && port[0] == 39527 && "192.168.31.9".equals(outHost[0]), "parseHostPort with scheme");
        check(LanSyncBridge.parseHostPort("8.8.8.8:39527", outHost) == null, "reject public hostPort");
        check(LanSyncBridge.parseHostPort("192.168.1.1:80", outHost) == null, "reject privileged port");

        byte[] rawOk = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"ok\":true,\"seq\":3}".getBytes(StandardCharsets.UTF_8);
        String body = LanSyncBridge.extractHttpBody(rawOk, rawOk.length);
        check("{\"ok\":true,\"seq\":3}".equals(body), "extract 200 JSON body");

        System.out.println("LanSyncBridge: " + checks + " checks passed");
    }
}
