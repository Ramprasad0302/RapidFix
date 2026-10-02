package in.rapidfix.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.lang.ref.WeakReference;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * RapidFix runs full screen in its own WebView (no browser, no address bar).
 *
 * The page talks to the app through `window.RapidFixNative` (a web message
 * listener limited to RapidFix origins): push token, notification permission,
 * keep-screen-on, printing and settings shortcuts. Messages are JSON:
 *   page → app  {id, cmd, value}
 *   app → page  {id, result} | {event, ...}
 */
public class MainActivity extends Activity {
    static final String EXTRA_URL = "url";
    private static final String PREFS = "rapidfix";
    private static final String PREF_TOKEN = "fcmToken";
    private static final String PREF_NOTIF_ASKED = "notifAsked";
    private static final int REQ_NOTIFICATIONS = 1;
    private static final int REQ_LOCATION = 2;
    private static final int REQ_FILE = 3;

    private static volatile boolean foreground;
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private Uri home;
    private Set<String> appHosts;
    private Set<String> bridgeOrigins;
    private WebView web;
    private View offline;
    private JavaScriptReplyProxy bridge;
    private String pendingPermissionId;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private boolean firstPageShown;
    private String failedUrl;
    private ConnectivityManager.NetworkCallback networkCallback;

    /**
     * The app is on screen right now. Checked with Android too: when the app is swiped
     * away from recents it can be destroyed without onPause, and a stale flag would
     * swallow job alerts.
     */
    static boolean isInForeground() {
        MainActivity a = current.get();
        if (!foreground || a == null || a.isFinishing() || a.isDestroyed()) return false;
        android.app.ActivityManager.RunningAppProcessInfo info = new android.app.ActivityManager.RunningAppProcessInfo();
        android.app.ActivityManager.getMyMemoryState(info);
        return info.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }

    /** Push received while the app is open: let the page refresh its lists. */
    static void notifyWeb(Map<String, String> data) {
        new Handler(Looper.getMainLooper()).post(() -> {
            MainActivity a = current.get();
            if (a == null) return;
            JSONObject e = new JSONObject();
            try {
                e.put("event", "push");
                e.put("type", data.get("type"));
            } catch (JSONException ignored) {
            }
            a.send(e);
        });
    }

    static void onPushToken(Context ctx, String token) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(PREF_TOKEN, token).apply();
        new Handler(Looper.getMainLooper()).post(() -> {
            MainActivity a = current.get();
            if (a != null) a.sendToken(token);
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = new WeakReference<>(this);
        home = Uri.parse(BuildConfig.HOME_URL);
        appHosts = new HashSet<>(Arrays.asList("rapidfix.in", "www.rapidfix.in", home.getHost()));
        bridgeOrigins = new HashSet<>(Arrays.asList("https://rapidfix.in", "https://www.rapidfix.in", origin(home)));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT); // splash logo shows through until the first page paints
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        offline = buildOfflineView();
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applySystemBars(root);

        configureWebView();
        fetchPushToken();
        watchConnection();

        if (savedInstanceState != null && web.restoreState(savedInstanceState) != null) return;
        web.loadUrl(resolve(urlFrom(getIntent())));
    }

    // ── Window ──────────────────────────────────────────────────────────────

    /** Android 15+ draws apps edge to edge: keep the page clear of the status bar, nav bar and keyboard. */
    private void applySystemBars(View root) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
        }
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        }
    }

    private View buildOfflineView() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.WHITE);
        int pad = dp(32);
        box.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextSize(20);
        title.setTextColor(getColor(R.color.ink));
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView body = new TextView(this);
        body.setText(R.string.offline_body);
        body.setTextSize(15);
        body.setTextColor(getColor(R.color.muted));
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(8), 0, dp(20));
        box.addView(body);

        Button retry = new Button(this);
        retry.setText(R.string.offline_retry);
        retry.setOnClickListener(v -> retryLoad());
        box.addView(retry);
        return box;
    }

    /** Load the page that failed again (reload() would only reload the error page). */
    private void retryLoad() {
        offline.setVisibility(View.GONE);
        web.loadUrl(failedUrl != null ? failedUrl : home.toString());
        failedUrl = null;
    }

    /** First launch without internet shows the offline screen; reload by itself once a connection appears. */
    private void watchConnection() {
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                runOnUiThread(() -> {
                    if (offline.getVisibility() == View.VISIBLE) retryLoad();
                });
            }
        };
        try {
            cm.registerNetworkCallback(new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback);
        } catch (RuntimeException e) {
            networkCallback = null;
        }
    }

    // ── WebView ─────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // job alert tone must play without a tap
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " RapidFixApp/" + BuildConfig.VERSION_NAME);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true); // rapidfix.in ↔ api.rapidfix.in

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "RapidFixNative", bridgeOrigins, this::onBridgeMessage);
        }
        // The service worker's own fetches can be answered from the built-in copy too.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
                @Override
                public WebResourceResponse shouldInterceptRequest(@NonNull WebResourceRequest request) {
                    return BundledWeb.respond(getApplicationContext(), appHosts, request);
                }
            });
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return route(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return BundledWeb.respond(MainActivity.this, appHosts, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Offline, the saved copy of the app usually loads anyway (service worker);
                // show the offline screen only when the page really is the browser's error page.
                view.evaluateJavascript("location.protocol", protocol -> {
                    boolean failed = protocol != null && protocol.contains("chrome-error");
                    offline.setVisibility(failed ? View.VISIBLE : View.GONE);
                });
                if (!firstPageShown) {
                    firstPageShown = true;
                    web.setBackgroundColor(Color.WHITE);
                    getWindow().setBackgroundDrawable(null);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) failedUrl = request.getUrl().toString();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                recreate(); // the page crashed or was killed for memory: start fresh
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, true); // allowed once in Android → never asked again
                    return;
                }
                geoOrigin = origin;
                geoCallback = callback;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("locationAsked", true).apply();
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return openFileChooser(callback, params);
            }
        });
    }

    /** RapidFix pages stay in the app; everything else (maps, phone, WhatsApp, other sites) opens outside. */
    private boolean route(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        boolean web = "https".equals(scheme) || ("http".equals(scheme) && BuildConfig.DEBUG);
        if (web && host != null && (appHosts.contains(host) || host.endsWith(".razorpay.com") || host.endsWith(".firebaseapp.com"))) {
            return false;
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent;
            if ("intent".equals(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback != null) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                    else throw e;
                }
                return;
            }
            intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    // ── Uploads (documents, photos) ─────────────────────────────────────────

    private boolean openFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        cameraUri = null;

        Intent camera = null;
        if (acceptsImages(params.getAcceptTypes())) {
            try {
                File dir = new File(getCacheDir(), "camera");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no camera dir");
                File photo = File.createTempFile("photo_", ".jpg", dir);
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
                camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                        .putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception e) {
                cameraUri = null;
            }
        }

        Intent launch;
        if (params.isCaptureEnabled() && camera != null) {
            launch = camera;
        } else {
            Intent pick = params.createIntent();
            if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            launch = Intent.createChooser(pick, getString(R.string.choose_file));
            if (camera != null) launch.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        try {
            startActivityForResult(launch, REQ_FILE);
            return true;
        } catch (ActivityNotFoundException e) {
            fileCallback = null;
            return false;
        }
    }

    private static boolean acceptsImages(String[] types) {
        if (types == null || types.length == 0) return true;
        for (String t : types) {
            if (t == null || t.isEmpty() || t.startsWith("image/") || t.equals("*/*") || t.equals(".jpg") || t.equals(".jpeg") || t.equals(".png")) return true;
        }
        return false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            boolean picked = data != null && (data.getData() != null || data.getClipData() != null);
            if (picked) {
                result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                if (result == null && data.getClipData() != null) {
                    result = new Uri[data.getClipData().getItemCount()];
                    for (int i = 0; i < result.length; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (cameraUri != null) {
                result = new Uri[]{cameraUri};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    // ── Bridge ──────────────────────────────────────────────────────────────

    private void onBridgeMessage(@NonNull WebView view, @NonNull WebMessageCompat message, @NonNull Uri sourceOrigin,
                                 boolean isMainFrame, @NonNull JavaScriptReplyProxy reply) {
        if (!isMainFrame || message.getData() == null) return;
        JSONObject msg;
        try {
            msg = new JSONObject(message.getData());
        } catch (JSONException e) {
            return;
        }
        String id = msg.optString("id");
        String cmd = msg.optString("cmd");
        switch (cmd) {
            case "hello":
                bridge = reply;
                respond(id, state());
                break;
            case "state":
                respond(id, state());
                break;
            case "requestNotificationPermission":
                requestNotificationPermission(id);
                break;
            case "keepScreenOn":
                if (msg.optBoolean("value")) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                respond(id, null);
                break;
            case "openNotificationSettings":
                openNotificationSettings();
                respond(id, null);
                break;
            case "openAppSettings":
                startSafely(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                respond(id, null);
                break;
            case "openBatterySettings":
                openBatterySettings();
                respond(id, null);
                break;
            case "startDuty": {
                // Technician went online: keep the app alive for job alerts and share GPS in the background.
                JSONObject v = msg.optJSONObject("value");
                if (v != null && hasLocationPermission()) {
                    try {
                        DutyService.start(this, v.optString("api"), v.optString("key"));
                    } catch (RuntimeException ignored) {
                        // Background start not allowed right now; the page asks again when visible.
                    }
                }
                respond(id, DutyService.isOnDuty(this));
                break;
            }
            case "stopDuty":
                DutyService.stop(this);
                respond(id, false);
                break;
            case "alertTones":
                respond(id, Ringtones.list(this));
                break;
            case "setAlertTone":
                Ringtones.select(this, msg.optString("value"));
                respond(id, Ringtones.list(this));
                break;
            case "previewTone":
                Ringtones.play(this, msg.optString("value", null), false, 7_000);
                respond(id, null);
                break;
            case "ringStart":
                // In-app ring for a new job request: the technician's chosen tone, looping.
                Ringtones.play(this, null, true, 0);
                respond(id, null);
                break;
            case "ringStop":
            case "stopTone":
                Ringtones.stop();
                respond(id, null);
                break;
            case "catalogSnapshot":
                respond(id, BundledWeb.catalogSnapshot(this));
                break;
            case "print":
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm != null) {
                    String name = msg.optString("value", "RapidFix");
                    pm.print(name, web.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
                }
                respond(id, null);
                break;
            default:
                respond(id, null);
        }
    }

    private JSONObject state() {
        JSONObject s = new JSONObject();
        try {
            s.put("platform", "android");
            s.put("version", BuildConfig.VERSION_NAME);
            s.put("permission", notificationState());
            s.put("token", getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_TOKEN, null));
            s.put("batteryRestricted", batteryRestricted());
            s.put("location", hasLocationPermission() ? "granted" : locationAsked() ? "denied" : "default");
            s.put("onDuty", DutyService.isOnDuty(this));
        } catch (JSONException ignored) {
        }
        return s;
    }

    private void respond(String id, Object result) {
        if (id == null || id.isEmpty()) return;
        JSONObject r = new JSONObject();
        try {
            r.put("id", id);
            r.put("result", result == null ? JSONObject.NULL : result);
        } catch (JSONException ignored) {
        }
        send(r);
    }

    private void send(JSONObject message) {
        if (bridge == null) return;
        try {
            bridge.postMessage(message.toString());
        } catch (Exception ignored) {
            // page navigated away; the next "hello" brings a fresh channel
        }
    }

    private void sendToken(String token) {
        JSONObject e = new JSONObject();
        try {
            e.put("event", "token");
            e.put("token", token);
        } catch (JSONException ignored) {
        }
        send(e);
    }

    private void navigateWeb(String url) {
        JSONObject e = new JSONObject();
        try {
            e.put("event", "navigate");
            e.put("url", url);
        } catch (JSONException ignored) {
        }
        send(e);
    }

    // ── Notifications ───────────────────────────────────────────────────────

    private void fetchPushToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) onPushToken(this, task.getResult());
        });
    }

    /** "granted" | "denied" (blocked — only Settings can change it) | "default" (we can still ask). */
    private String notificationState() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            boolean asked = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_NOTIF_ASKED, false);
            return !asked || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) ? "default" : "denied";
        }
        return nm != null && nm.areNotificationsEnabled() ? "granted" : "denied";
    }

    private void requestNotificationPermission(String id) {
        if (Build.VERSION.SDK_INT < 33 || !"default".equals(notificationState())) {
            respond(id, notificationState());
            return;
        }
        pendingPermissionId = id;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_NOTIF_ASKED, true).apply();
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
    }

    private void openNotificationSettings() {
        Intent i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
        startSafely(i);
    }

    /** True when Android may delay pushes to save battery (job alerts could arrive late). */
    private boolean batteryRestricted() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        return pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void openBatterySettings() {
        if (!startSafely(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            startSafely(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
    }

    private boolean startSafely(Intent i) {
        try {
            startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Asked before and Android won't show the dialog again ("Don't allow" twice / "Don't ask again"). */
    private boolean locationAsked() {
        boolean asked = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("locationAsked", false);
        return asked && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION);
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_NOTIFICATIONS && pendingPermissionId != null) {
            respond(pendingPermissionId, notificationState());
            pendingPermissionId = null;
        } else if (requestCode == REQ_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocationPermission(), hasLocationPermission());
            geoCallback = null;
            geoOrigin = null;
        }
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = urlFrom(intent);
        if (url == null) return;
        if (bridge != null) navigateWeb(resolve(url));
        else web.loadUrl(resolve(url));
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        current = new WeakReference<>(this);
        web.onResume();
        Notifications.cancelJobAlerts(this);
        JSONObject e = state();
        try {
            e.put("event", "state");
        } catch (JSONException ignored) {
        }
        send(e);
    }

    @Override
    protected void onPause() {
        foreground = false;
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (offline.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            moveTaskToBack(true); // keep the app (and its live connection) warm instead of closing it
        }
    }

    @Override
    protected void onStop() {
        foreground = false;
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        foreground = false;
        if (current.get() == this) current = new WeakReference<>(null);
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm != null && networkCallback != null) cm.unregisterNetworkCallback(networkCallback);
        web.destroy();
        super.onDestroy();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** The page to open: a notification's link, an app link (https://rapidfix.in/...), or home. */
    private String urlFrom(Intent intent) {
        if (intent == null) return null;
        String extra = intent.getStringExtra(EXTRA_URL);
        if (extra != null && !extra.isEmpty()) return extra;
        Uri data = intent.getData();
        if (data != null && appHosts.contains(data.getHost())) return data.toString();
        return null;
    }

    /** Absolute RapidFix URL for a path or link; anything off-site falls back to home. */
    private String resolve(String url) {
        if (url == null || url.isEmpty()) return home.toString();
        Uri u = Uri.parse(url);
        if (u.getScheme() == null) {
            String path = url.startsWith("/") ? url : "/" + url;
            return origin(home) + path;
        }
        if (appHosts.contains(u.getHost())) {
            // Same page on whichever origin this build runs (rapidfix.in, or the local server in debug).
            String rest = u.getEncodedPath() == null ? "/" : u.getEncodedPath();
            if (u.getEncodedQuery() != null) rest += "?" + u.getEncodedQuery();
            if (u.getEncodedFragment() != null) rest += "#" + u.getEncodedFragment();
            return origin(home) + rest;
        }
        return home.toString();
    }

    private static String origin(Uri u) {
        return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
