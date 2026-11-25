package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
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
    private TextView permissionBadge;
    private Button overlaySettingBtn;
    private Button notifyBtn;
    private LinearLayout root;
    private boolean secondScreenActive;

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private GradientDrawable box(int fill, int radius, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(radius));
        d.setStroke(dp(1), stroke);
        return d;
    }

    static void setSecondScreenFromBridge(final Context context, final boolean enabled) {
        MAIN.post(() -> {
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
                if (act != null && !act.isFinishing() && !act.isDestroyed() && act.secondScreenActive) {
                    act.applySecondScreenMode(false);
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
        root.setBackgroundColor(0xff0b0d11);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        setContentView(root);
        root.requestApplyInsets();
    }

    private TextView label(String value, float size, int color, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(value);
        tv.setTextSize(size);
        tv.setTextColor(color);
        if (bold) tv.setTypeface(null, 1);
        return tv;
    }

    private Button actionButton(LinearLayout parent, String text, int fill, int stroke, int textColor, int heightDp, View.OnClickListener action) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(14.5f);
        b.setTypeface(null, 1);
        b.setTextColor(textColor);
        b.setMinHeight(dp(heightDp));
        b.setMinimumHeight(dp(heightDp));
        b.setBackground(box(fill, 4, stroke));
        b.setOnClickListener(action);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(10);
        parent.addView(b, lp);
        return b;
    }

    private void showHome() {
        boolean wasSecondScreen = secondScreenActive;
        guideControls = null;
        if (guide != null) { guide.destroy(); guide = null; }
        prepareRoot();
        if (wasSecondScreen) applySecondScreenMode(false);

        ScrollView scroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(20), dp(22), dp(20), dp(24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));

        // PRTS × Endfield 工业风头部
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView chip = label("PRTS", 12f, 0xff0b0d11, true);
        chip.setPadding(dp(8), dp(3), dp(8), dp(3));
        chip.setBackground(box(0xffffe600, 2, 0xffffe600));
        headerRow.addView(chip);
        TextView title = label("  " + getString(R.string.product_title), 21f, 0xfff1f5f9, true);
        if (getResources().getBoolean(R.bool.show_home_icon)) {
            Drawable mark = getDrawable(getApplicationInfo().icon);
            if (mark != null) {
                mark.setBounds(0, 0, dp(28), dp(28));
                title.setCompoundDrawables(mark, null, null, null);
                title.setCompoundDrawablePadding(dp(6));
            }
        }
        headerRow.addView(title);
        body.addView(headerRow);

        TextView subtitle = label(getString(R.string.home_subtitle), 13.5f, 0xff00e5ff, true);
        subtitle.setPadding(0, dp(8), 0, dp(14));
        body.addView(subtitle);

        // 状态卡片
        LinearLayout statusCard = new LinearLayout(this);
        statusCard.setOrientation(LinearLayout.VERTICAL);
        statusCard.setPadding(dp(14), dp(12), dp(14), dp(12));
        statusCard.setBackground(box(0xff11151d, 4, 0xff252d3a));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(-1, -2);
        cardLp.bottomMargin = dp(16);
        body.addView(statusCard, cardLp);

        permissionBadge = label("", 13f, 0xff34d399, true);
        statusCard.addView(permissionBadge);
        TextView gestureGuide = label(
            "悬浮球手势：单击展开侧边抽屉 · 双击一键扫盟约 · 长按切顶部战术迷你条\n"
            + "不抢游戏焦点：展开抽屉时窗外点击直达游戏，同局共享授权免二次弹窗",
            12.5f, 0xff94a3b8, false
        );
        gestureGuide.setLineSpacing(dp(3), 1f);
        gestureGuide.setPadding(0, dp(6), 0, 0);
        statusCard.addView(gestureGuide);

        // 主 CTA：工业黄
        actionButton(body, "开启悬浮助手 · 进入游戏", 0xffffe600, 0xffffe600, 0xff0b0d11, 50, v -> startOverlay());
        // 次要 CTA：应用内查阅 + 无线副屏
        actionButton(body, getString(R.string.home_open_button) + " / 无线副屏", 0xff171c26, 0xff334155, 0xfff1f5f9, 46, v -> {
            OverlayService.stopActive();
            showGuide();
        });
        actionButton(body, "关闭悬浮助手", 0xff11151d, 0xff252d3a, 0xffcbd5e1, 42, v -> {
            stopService(new Intent(this, OverlayService.class));
            stopService(new Intent(this, CovenantScanService.class));
            Toast.makeText(this, "悬浮助手已关闭，本局进度已保留", Toast.LENGTH_SHORT).show();
        });

        // 权限按钮：未授权时高亮显示，已授权时收起为紧凑配置项
        overlaySettingBtn = actionButton(body, "去开启「显示在其他应用上层」权限", 0xff2b2210, 0xffd97706, 0xfffef08a, 44, v -> openOverlaySettings());
        if (Build.VERSION.SDK_INT >= 33) {
            notifyBtn = actionButton(body, "允许状态栏快捷控制通知（可选）", 0xff11151d, 0xff252d3a, 0xff94a3b8, 40,
                v -> requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 20));
        } else {
            notifyBtn = null;
        }

        // 精简说明卡片
        LinearLayout tipsCard = new LinearLayout(this);
        tipsCard.setOrientation(LinearLayout.VERTICAL);
        tipsCard.setPadding(dp(14), dp(12), dp(14), dp(12));
        tipsCard.setBackground(box(0xff0f131a, 4, 0xff1d2432));
        LinearLayout.LayoutParams tipsLp = new LinearLayout.LayoutParams(-1, -2);
        tipsLp.topMargin = dp(6);
        body.addView(tipsCard, tipsLp);
        tipsCard.addView(label("隐私与安全说明", 12.5f, 0xffcbd5e1, true));
        TextView tipsBody = label(
            "• 盟约、回合与商店识别均在本机内存实时完成，不保存截图、不上传云端。\n"
            + "• 无需无障碍权限、无需 Root；无线副屏仅在局域网内配对同步。",
            12f, 0xff94a3b8, false
        );
        tipsBody.setLineSpacing(dp(3), 1f);
        tipsBody.setPadding(0, dp(5), 0, 0);
        tipsCard.addView(tipsBody);

        updatePermission();
    }

    private void updatePermission() {
        boolean canOverlay = Settings.canDrawOverlays(this);
        if (permissionBadge != null) {
            permissionBadge.setText(canOverlay ? "● 悬浮窗权限已就绪（横屏默认右侧紧凑抽屉）" : "▲ 尚未开启悬浮窗权限（点击下方按钮去授权）");
            permissionBadge.setTextColor(canOverlay ? 0xff34d399 : 0xfffbbf24);
        }
        if (overlaySettingBtn != null) {
            overlaySettingBtn.setVisibility(canOverlay ? View.GONE : View.VISIBLE);
        }
        if (notifyBtn != null && Build.VERSION.SDK_INT >= 33) {
            boolean hasNotify = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            notifyBtn.setVisibility(hasNotify ? View.GONE : View.VISIBLE);
        }
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

    private void applySecondScreenMode(final boolean enabled) {
        secondScreenActive = enabled;
        try {
            setRequestedOrientation(enabled
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } catch (RuntimeException ignored) {}
        try {
            if (getWindow() != null) {
                if (enabled) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        } catch (RuntimeException ignored) {}
        if (guideControls != null) {
            guideControls.setVisibility(enabled ? View.GONE : View.VISIBLE);
        }
        View anchor = root != null ? root : (getWindow() != null ? getWindow().peekDecorView() : null);
        if (anchor != null) {
            anchor.post(() -> {
                if (!isFinishing() && !isDestroyed()) applySystemBars(enabled);
            });
        }
    }

    @SuppressWarnings("deprecation")
    private void applySystemBars(boolean immersive) {
        try {
            if (getWindow() == null) return;
            View decor = getWindow().peekDecorView();
            if (decor == null || !decor.isAttachedToWindow()) return;
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController controller = decor.getWindowInsetsController();
                if (controller != null) {
                    if (immersive) {
                        controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                        controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    } else {
                        controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    }
                }
            } else {
                if (immersive) {
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
        } catch (Throwable ignored) {}
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && secondScreenActive) applySystemBars(true);
    }

    private void showGuide() {
        prepareRoot();
        LinearLayout controls = new LinearLayout(this);
        controls.setBackgroundColor(0xff0d1118);
        controls.setPadding(dp(8), dp(4), dp(8), dp(4));
        Button back = new Button(this);
        back.setText("← 主页");
        back.setAllCaps(false);
        back.setTextSize(13f);
        back.setTextColor(0xffcbd5e1);
        back.setBackground(box(0xff171c26, 3, 0xff2b3444));
        back.setOnClickListener(v -> showHome());
        LinearLayout.LayoutParams backLp = new LinearLayout.LayoutParams(0, dp(38), 1);
        backLp.rightMargin = dp(6);
        controls.addView(back, backLp);

        Button floatButton = new Button(this);
        floatButton.setText("切换悬浮助手 · 返回游戏");
        floatButton.setAllCaps(false);
        floatButton.setTextSize(13f);
        floatButton.setTypeface(null, 1);
        floatButton.setTextColor(0xff0b0d11);
        floatButton.setBackground(box(0xffffe600, 3, 0xffffe600));
        floatButton.setOnClickListener(v -> startOverlay());
        controls.addView(floatButton, new LinearLayout.LayoutParams(0, dp(38), 2));

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
