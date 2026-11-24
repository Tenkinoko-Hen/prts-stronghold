package com.prts.stronghold.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    static final String EXTRA_SECOND_SCREEN = "prts_second_screen";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static volatile MainActivity currentInstance;
    private static boolean visible;
    static boolean isVisible() { return visible; }
    private WebView guide;
    private LinearLayout guideControls;
    private TextView permissionStatus;
    private LinearLayout root;
    private boolean secondScreenActive;
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    static void setSecondScreenFromBridge(final Context context, final boolean enabled) {
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                if (enabled) {
                    OverlayService.stopActive();
                    MainActivity act = currentInstance;
                    if (act != null && !act.isFinishing() && !act.isDestroyed() && visible) {
                        if (act.guide == null) act.showGuide();
                        act.applySecondScreenMode(true);
                    } else {
                        try {
                            Intent intent = new Intent(context, MainActivity.class)
                                .putExtra(EXTRA_SECOND_SCREEN, true)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                            context.startActivity(intent);
                        } catch (RuntimeException ignored) {}
                    }
                } else {
                    MainActivity act = currentInstance;
                    if (act != null && !act.isFinishing() && !act.isDestroyed()) {
                        act.applySecondScreenMode(false);
                    }
                }
            }
        });
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentInstance = this;
        if (getIntent() != null && getIntent().getBooleanExtra(EXTRA_SECOND_SCREEN, false)) {
            OverlayService.stopActive();
            showGuide();
            applySecondScreenMode(true);
        } else {
            showHome();
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra(EXTRA_SECOND_SCREEN, false)) {
            OverlayService.stopActive();
            if (guide == null) showGuide();
            applySecondScreenMode(true);
        }
    }

    private void prepareRoot() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff0c141b);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else { v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); }
            return insets;
        });
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        setContentView(root);
        root.requestApplyInsets();
    }

    private TextView text(String value, int size, int color) {
        TextView label = new TextView(this);
        label.setText(value);
        label.setTextSize(size);
        label.setTextColor(color);
        label.setPadding(0, dp(10), 0, dp(10));
        return label;
    }

    private void button(LinearLayout parent, String label, View.OnClickListener action) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(0xff10291e);
        button.setMinHeight(dp(52));
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xff9ce3bb));
        button.setOnClickListener(action);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.bottomMargin = dp(10);
        parent.addView(button, layout);
    }

    private void showHome() {
        applySecondScreenMode(false);
        guideControls = null;
        if (guide != null) { guide.destroy(); guide = null; }
        prepareRoot();
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(24), dp(24), dp(24), dp(24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
        if (getResources().getBoolean(R.bool.show_home_icon)) {
            TextView brand = text(getString(R.string.product_title), 20, 0xffeceff4);
            Drawable mark = getDrawable(getApplicationInfo().icon);
            if (mark != null) {
                mark.setBounds(0, 0, dp(36), dp(36));
                brand.setCompoundDrawables(mark, null, null, null);
                brand.setCompoundDrawablePadding(dp(8));
            }
            body.addView(brand);
        } else {
            body.addView(text(getString(R.string.product_title), 28, 0xffedf4f5));
        }
        body.addView(text(getString(R.string.home_subtitle), 17, 0xff9ce3bb));
        body.addView(text(getString(R.string.home_body), 15, 0xffb7cbd5));
        permissionStatus = text("", 14, 0xffe4d3a5);
        body.addView(permissionStatus);
        button(body, "开启悬浮球 · 返回游戏", v -> startOverlay());
        button(body, getString(R.string.home_open_button), v -> {
            OverlayService.stopActive();
            showGuide();
        });
        button(body, "悬浮窗权限设置", v -> openOverlaySettings());
        if (Build.VERSION.SDK_INT >= 33) button(body, "允许显示通知（可选）", v -> requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 20));
        button(body, "关闭悬浮助手", v -> { stopService(new Intent(this, OverlayService.class)); Toast.makeText(this, "悬浮助手已关闭，进度已保留", Toast.LENGTH_SHORT).show(); });
        body.addView(text(getString(R.string.home_tips), 14, 0xffa6b8c4));
        updatePermission();
    }

    private void updatePermission() {
        if (permissionStatus != null) permissionStatus.setText(Settings.canDrawOverlays(this) ? "悬浮窗权限已允许" : getString(R.string.permission_hint));
    }
    private void openOverlaySettings() {
        try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
        catch (RuntimeException error) { Toast.makeText(this, "请在系统设置中为" + getString(R.string.app_name) + "开启悬浮窗权限", Toast.LENGTH_LONG).show(); }
    }
    private void startOverlay() {
        if (!Settings.canDrawOverlays(this)) { openOverlaySettings(); return; }
        if (guide != null) { guide.destroy(); guide = null; }
        try {
            startForegroundService(new Intent(this, OverlayService.class));
            showHome();
            moveTaskToBack(true);
        } catch (RuntimeException error) { Toast.makeText(this, "无法开启悬浮助手，请检查系统后台运行权限", Toast.LENGTH_LONG).show(); }
    }
    @SuppressWarnings("deprecation")
    private void applySecondScreenMode(boolean enabled) {
        secondScreenActive = enabled;
        setRequestedOrientation(enabled
            ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (enabled) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        if (guideControls != null) {
            guideControls.setVisibility(enabled ? View.GONE : View.VISIBLE);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                if (enabled) {
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                } else {
                    controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            }
        } else {
            View decor = getWindow().getDecorView();
            if (enabled) {
                decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                );
            } else {
                decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
        }
    }

    private void showGuide() {
        prepareRoot();
        LinearLayout controls = new LinearLayout(this);
        controls.setPadding(dp(8), 0, dp(8), 0);
        Button back = new Button(this);
        back.setText("返回");
        back.setOnClickListener(v -> showHome());
        controls.addView(back, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button floatButton = new Button(this);
        floatButton.setText("切换悬浮球");
        floatButton.setOnClickListener(v -> startOverlay());
        controls.addView(floatButton, new LinearLayout.LayoutParams(0, dp(48), 2));
        guideControls = controls;
        root.addView(controls);
        guide = GuideWebView.create(this);
        root.addView(guide, new LinearLayout.LayoutParams(-1, 0, 1));
    }
    @Override protected void onResume() { super.onResume(); currentInstance = this; visible = true; updatePermission(); }
    @Override protected void onPause() { visible = false; super.onPause(); }
    @Override public void onBackPressed() {
        if (secondScreenActive) {
            LanSyncBridge.disconnectStatic();
            applySecondScreenMode(false);
            return;
        }
        if (guide != null) showHome();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (currentInstance == this) currentInstance = null;
        if (guide != null) guide.destroy();
        super.onDestroy();
    }
}
