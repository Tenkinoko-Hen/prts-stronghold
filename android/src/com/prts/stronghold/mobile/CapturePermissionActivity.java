package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;

public class CapturePermissionActivity extends Activity {
    private String scanId;
    private boolean roundMode;
    private boolean pending() { return roundMode ? RoundScanState.matches(scanId) && RoundScanState.is("permission") : CovenantScanState.matches(scanId) && CovenantScanState.permissionPending(); }
    private void fail(String message) { if (roundMode) RoundScanState.stop(message); else CovenantScanState.set("cancelled", message); OverlayService.showAfterScan(); }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        scanId = getIntent().getStringExtra("scanId");
        roundMode = getIntent().getBooleanExtra("roundMode", false);
        if (!pending()) { finish(); return; }
        if (saved != null) return;
        try { startActivityForResult(getSystemService(MediaProjectionManager.class).createScreenCaptureIntent(), 40); }
        catch (RuntimeException error) { fail("无法打开系统截屏授权，请重新尝试"); finish(); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if (request != 40) return;
        if (!pending()) { finish(); return; }
        if (result == RESULT_OK && data != null) {
            try {
                startForegroundService(new Intent(this,CovenantScanService.class).putExtra("scanId",scanId).putExtra("roundMode",roundMode).putExtra("resultCode",result).putExtra("data",data));
                moveTaskToBack(true);
            } catch (RuntimeException error) { fail("无法启动识别，请从应用内重新授权"); }
        } else { fail("已取消截屏授权，本局条件未更改"); }
        finish();
    }
}
