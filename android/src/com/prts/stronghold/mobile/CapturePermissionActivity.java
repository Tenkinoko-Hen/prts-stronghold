package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionConfig;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;

public class CapturePermissionActivity extends Activity {
    private String scanId;
    private String mode;

    private boolean isRound() { return "round".equals(mode); }

    private boolean pending() {
        if (isRound()) return RoundScanState.matches(scanId) && RoundScanState.is("permission");
        return CovenantScanState.matches(scanId) && CovenantScanState.permissionPending();
    }

    private void fail(String message) {
        if (isRound()) RoundScanState.stop(message);
        else CovenantScanState.set("cancelled", message);
        OverlayService.showAfterScan();
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        scanId = getIntent().getStringExtra("scanId");
        mode = getIntent().getStringExtra("mode");
        if (mode == null || mode.isEmpty()) {
            mode = getIntent().getBooleanExtra("roundMode", false) ? "round" : "covenant";
        }
        if (!pending()) { finish(); return; }
        if (saved != null) return;
        try {
            MediaProjectionManager mpm = getSystemService(MediaProjectionManager.class);
            Intent captureIntent;
            if (Build.VERSION.SDK_INT >= 34) {
                captureIntent = mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay());
            } else {
                captureIntent = mpm.createScreenCaptureIntent();
            }
            startActivityForResult(captureIntent, 40);
        } catch (RuntimeException error) {
            fail("无法打开系统截屏授权，请重新尝试");
            finish();
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 40) return;
        if (!pending()) { finish(); return; }
        if (result == RESULT_OK && data != null) {
            try {
                Intent svc = new Intent(this, CovenantScanService.class)
                    .putExtra("scanId", scanId)
                    .putExtra("mode", mode)
                    .putExtra("roundMode", isRound())
                    .putExtra("resultCode", result)
                    .putExtra("data", data);
                startForegroundService(svc);
                moveTaskToBack(true);
            } catch (RuntimeException error) {
                fail("无法启动识别，请从应用内重新授权");
            }
        } else {
            fail("已取消截屏授权，当前条件未更改");
        }
        finish();
    }
}
