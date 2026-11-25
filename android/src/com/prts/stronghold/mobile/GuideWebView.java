package com.prts.stronghold.mobile;
// 青逝痕 Tenkinoko 制作

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class GuideWebView {
    private static final String HOST = "app.prts.local";
    private GuideWebView() {}

    static WebView create(Context context) {
        return create(context, false, null);
    }

    static WebView create(Context context, boolean overlay) {
        return create(context, overlay, null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    static WebView create(Context context, boolean overlay, final Runnable onRendererGone) {
        WebView view = new WebView(context);
        view.setBackgroundColor(0xff0b0d11);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        view.addJavascriptInterface(new SessionBridge(context), "PRTSJournal");
        view.addJavascriptInterface(new ReportFiles.Bridge(context), "PRTSFiles");
        if (context.getResources().getBoolean(R.bool.covenant_scan_enabled)) {
            view.addJavascriptInterface(new ScanBridge(context.getApplicationContext()), "PRTSScan");
        }
        view.addJavascriptInterface(new CaptureBridge(context.getApplicationContext()), "PRTSCapture");
        view.addJavascriptInterface(new RoundBridge(context.getApplicationContext()), "PRTSRound");
        view.addJavascriptInterface(new LanSyncBridge(context.getApplicationContext()), "PRTSLan");
        view.addJavascriptInterface(new OverlayBridge(), "PRTSOverlay");
        view.addJavascriptInterface(new DisplayBridge(context.getApplicationContext()), "PRTSDisplay");
        view.setWebViewClient(new WebViewClient() {
            private boolean local(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()); }
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) { return !local(request.getUrl()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!local(uri) || !"GET".equals(request.getMethod()) || path == null || path.contains("..") || path.contains("\\")) return empty(403, "Forbidden");
                if (path.equals("/")) path = "/index.html";
                try {
                    String mime = path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".html") ? "text/html" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'");
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, context.getAssets().open(path.substring(1)));
                } catch (IOException ignored) { return empty(404, "Not Found"); }
            }
            @Override public boolean onRenderProcessGone(WebView web, RenderProcessGoneDetail detail) {
                // 返回 true 拦截系统默认崩溃，防止《明日方舟》高内存压力回收 WebView 渲染进程时连带杀掉悬浮球与抓包服务
                if (onRendererGone != null) {
                    new Handler(Looper.getMainLooper()).post(onRendererGone);
                }
                return true;
            }
            private WebResourceResponse empty(int status, String reason) { return new WebResourceResponse("text/plain", "UTF-8", status, reason, null, new ByteArrayInputStream(new byte[0])); }
        });
        view.loadUrl("https://" + HOST + "/index.html?mobile=1" + (overlay ? "&overlay=1" : ""));
        return view;
    }

    private static final class ScanBridge {
        private final Context context;
        private final Handler main = new Handler(Looper.getMainLooper());
        ScanBridge(Context context) { this.context = context; }
        @JavascriptInterface public String getState() { return CovenantScanState.json(); }
        @JavascriptInterface public boolean isProjectionReady() { return CovenantScanService.hasActiveProjection(); }
        @JavascriptInterface public void start() {
            main.post(() -> {
                if (CovenantScanState.permissionPending() || CovenantScanState.scanning()) return;
                RoundScanState.stop("已切换到盟约识别");
                if (!CovenantScanState.begin()) return;
                String id = CovenantScanState.currentId();
                // 已有同局授权时直接复用，不再二次弹窗
                if (CovenantScanService.switchToCovenant(id)) return;
                OverlayService.hideForScan();
                try {
                    context.startActivity(new Intent(context, CapturePermissionActivity.class)
                        .putExtra("scanId", id)
                        .putExtra("mode", "covenant")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS));
                } catch (RuntimeException error) {
                    CovenantScanState.set("error", "无法打开截屏授权，请从应用内重新启动识别");
                    OverlayService.showAfterScan();
                }
            });
        }
        @JavascriptInterface public void stop() {
            if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled", "已取消本次识别");
            main.post(CovenantScanService::stopActive);
        }
        @JavascriptInterface public void reset() {
            CovenantScanState.reset();
            RoundScanState.reset();
            BattleCaptureState.resetMatch();
            main.post(() -> context.stopService(new Intent(context, CovenantScanService.class)));
        }
    }

    private static final class RoundBridge {
        private final Context context;
        private final Handler main = new Handler(Looper.getMainLooper());
        RoundBridge(Context context) { this.context = context; }
        @JavascriptInterface public String getState() { return RoundScanState.json(); }
        @JavascriptInterface public String getPreview() { return RoundScanState.preview(); }
        @JavascriptInterface public boolean isProjectionReady() { return CovenantScanService.hasActiveProjection(); }
        @JavascriptInterface public void start() {
            main.post(() -> {
                if (RoundScanState.is("permission") || RoundScanState.is("capturing") || RoundScanState.is("calibrating") || RoundScanState.is("scanning")) return;
                if (CovenantScanState.permissionPending()) CovenantScanState.set("cancelled", "已切换到回合同步");
                String id = RoundScanState.begin();
                // 复用开局盟约已授权的 MediaProjection，零二次弹窗！
                if (CovenantScanService.switchToRound(id)) return;
                OverlayService.hideForRound();
                try {
                    context.startActivity(new Intent(context, CapturePermissionActivity.class)
                        .putExtra("scanId", id)
                        .putExtra("mode", "round")
                        .putExtra("roundMode", true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS));
                } catch (RuntimeException error) {
                    RoundScanState.stop("无法打开截屏授权，请重试");
                    OverlayService.showAfterScan();
                }
            });
        }
        @JavascriptInterface public void setRegion(double left, double top, double right, double bottom) {
            main.post(() -> {
                if (RoundScanState.select(left, top, right, bottom)) {
                    // 若面板不遮挡框选区则不必收起面板，保留用户顺畅查阅体验
                    if (OverlayService.overlapsNormalizedRect(RoundScanState.region())) {
                        OverlayService.hideForRound();
                    }
                }
            });
        }
        @JavascriptInterface public void pause() { RoundScanState.pause(); }
        @JavascriptInterface public void resume() { RoundScanState.resume(); }
        @JavascriptInterface public void stop() {
            RoundScanState.stop("回合同步已停止");
            main.post(CovenantScanService::stopRoundKeepProjection);
        }
    }

    private static final class CaptureBridge {
        private final Context context;
        private final Handler main = new Handler(Looper.getMainLooper());
        CaptureBridge(Context context) { this.context = context; }
        @JavascriptInterface public String getState() { return BattleCaptureState.json(); }
        @JavascriptInterface public boolean isRunning() { return BattleCaptureState.isRunning(); }
        @JavascriptInterface public void start() {
            main.post(() -> {
                if (BattleCaptureState.isRunning()) return;
                try {
                    context.startActivity(new Intent(context, VpnPermissionActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS));
                } catch (RuntimeException error) {
                    BattleCaptureState.setStatus(false, "error", "无法打开系统 VPN 授权，请从主页启动抓包");
                }
            });
        }
        @JavascriptInterface public void stop() {
            main.post(() -> StrongholdVpnService.stopActive(context));
        }
        @JavascriptInterface public void restart() {
            main.post(() -> StrongholdVpnService.restartActive(context));
        }
        @JavascriptInterface public void reset() {
            BattleCaptureState.resetMatch();
        }
    }

    private static final class OverlayBridge {
        @JavascriptInterface public void updateStrip(int round, String headline, String detail) {
            OverlayService.updateStripFromBridge(round, 0, headline, "", detail);
        }
        @JavascriptInterface public void updateStripFull(int round, int tier, String headline, String grabHint, String detail) {
            OverlayService.updateStripFromBridge(round, tier, headline, grabHint, detail);
        }
        @JavascriptInterface public void updateStripV2(
            int round, int tier, int prevTier, String headline, String grabHint,
            String progressText, String banWarning, String loadoutHint, String fallbackAdvice, String detail
        ) {
            OverlayService.updateStripV2(round, tier, prevTier, headline, grabHint, progressText, banWarning, loadoutHint, fallbackAdvice, detail);
        }
        @JavascriptInterface public void enterStrip(boolean locked) {
            OverlayService.enterStripFromBridge(locked);
        }
        @JavascriptInterface public void setFocusable(boolean focusable) {
            OverlayService.setPanelFocusableFromBridge(focusable);
        }
        @JavascriptInterface public void stopScreenShare() {
            CovenantScanService.stopActive();
        }
    }

    private static final class DisplayBridge {
        private final Context context;
        DisplayBridge(Context context) { this.context = context; }
        @JavascriptInterface public void setSecondScreenMode(boolean enabled) {
            MainActivity.setSecondScreenFromBridge(context, enabled);
        }
    }
}
