package com.prts.dossier.review;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static boolean visible;
    static boolean isVisible() { return visible; }
    private WebView guide;
    private TextView permissionStatus;
    private LinearLayout root;
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showHome();
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
        if (guide != null) { guide.destroy(); guide = null; }
        prepareRoot();
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(24), dp(24), dp(24), dp(24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));
        body.addView(text("PRTS 战报终端", 28, 0xffedf4f5));
        body.addView(text("局内战报 · 回合识别 · 随行攻略", 17, 0xff9ce3bb));
        body.addView(text("27 套阵容 · 离线资料库\n拖动悬浮球到顺手的位置，点球显示攻略；面板顶部可拖动，点「收起」返回游戏。", 15, 0xffb7cbd5));
        permissionStatus = text("", 14, 0xffe4d3a5);
        body.addView(permissionStatus);
        button(body, "开启悬浮球 · 返回游戏", v -> startOverlay());
        button(body, "打开战报与攻略", v -> {
            OverlayService.stopActive();
            showGuide();
        });
        button(body, "悬浮窗权限设置", v -> openOverlaySettings());
        if (Build.VERSION.SDK_INT >= 33) button(body, "允许显示通知（可选）", v -> requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 20));
        button(body, "关闭悬浮助手", v -> { stopService(new Intent(this, OverlayService.class)); Toast.makeText(this, "悬浮助手已关闭，进度已保留", Toast.LENGTH_SHORT).show(); });
        body.addView(text("使用提示\n• 首次开启需允许「显示在其他应用上层」。\n• 若 HyperOS 回到游戏后不显示，请检查后台弹出界面与后台运行权限。\n• 点击识别时需系统屏幕共享授权；在游戏本局盟约总览停留，露出全部三排盟约。完成或45秒后自动停止，可从通知随时停止。\n• 仅识别盟约亮暗状态，禁用干员仍需按游戏核对。截图在本机处理，不保存、不上传，无联网或无障碍权限。", 14, 0xffa6b8c4));
        updatePermission();
    }

    private void updatePermission() {
        if (permissionStatus != null) permissionStatus.setText(Settings.canDrawOverlays(this) ? "悬浮窗权限已允许" : "尚未允许悬浮窗，仍可在应用内查看攻略");
    }
    private void openOverlaySettings() {
        try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
        catch (RuntimeException error) { Toast.makeText(this, "请在系统设置中为 PRTS 随行攻略开启悬浮窗权限", Toast.LENGTH_LONG).show(); }
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
        root.addView(controls);
        guide = GuideWebView.create(this);
        root.addView(guide, new LinearLayout.LayoutParams(-1, 0, 1));
    }
    @Override protected void onResume() { super.onResume(); visible = true; updatePermission(); }
    @Override protected void onPause() { visible = false; super.onPause(); }
    @Override public void onBackPressed() { if (guide != null) showHome(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (guide != null) guide.destroy(); super.onDestroy(); }
}
