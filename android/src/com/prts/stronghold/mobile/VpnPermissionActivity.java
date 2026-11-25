package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;
import android.os.Bundle;

/** 向系统申请免 Root 本机 VPN 授权并启动 StrongholdVpnService。 */
public final class VpnPermissionActivity extends Activity {
    private static final int REQUEST_VPN = 4102;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        BattleCaptureState.setStatus(false, "permission", "等待确认系统本机抓包授权…");
        Intent prepare = null;
        try {
            prepare = VpnService.prepare(this);
        } catch (RuntimeException error) {
            BattleCaptureState.setStatus(false, "error", "当前系统不支持本机抓包服务");
            finish();
            return;
        }
        if (prepare == null) {
            launchService();
            finish();
            return;
        }
        try {
            startActivityForResult(prepare, REQUEST_VPN);
        } catch (RuntimeException error) {
            BattleCaptureState.setStatus(false, "error", "无法弹出系统 VPN 授权框，请从系统设置确认");
            finish();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_VPN) {
            if (resultCode == RESULT_OK) {
                launchService();
            } else {
                BattleCaptureState.setStatus(false, "idle", "已取消本机抓包授权，可继续使用纯离线攻略");
            }
        }
        finish();
    }

    private void launchService() {
        Intent svc = new Intent(this, StrongholdVpnService.class).setAction(StrongholdVpnService.ACTION_START);
        try {
            startForegroundService(svc);
        } catch (RuntimeException error) {
            BattleCaptureState.setStatus(false, "error", "无法启动本机抓包服务，请检查通知权限");
        }
    }
}
