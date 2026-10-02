package in.rapidfix.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Technician "on duty": while the partner is online, this foreground service
 * keeps RapidFix running — even after it is swiped away from recents — so job
 * requests ring instantly, and sends the phone's GPS to the server
 * (every 5 s while travelling to a customer, otherwise every 30 s).
 *
 * Authorised by a location-only key from the server (POST /technician/location-key),
 * never by the login. Stops itself when the server says the partner is offline,
 * when the key is rejected, or when the partner goes offline / signs out in the app.
 */
public class DutyService extends Service {
    static final String ACTION_START = "in.rapidfix.app.DUTY_START";
    static final String ACTION_STOP = "in.rapidfix.app.DUTY_STOP";
    static final String EXTRA_API = "api";
    static final String EXTRA_KEY = "key";

    private static final String PREFS = "rapidfix.duty";
    private static final String CHANNEL_ID = "rapidfix_on_duty_v1";
    private static final int NOTIFICATION_ID = 7001;
    private static final long IDLE_MS = 30_000;
    private static final long TRAVEL_MS = 5_000;

    private FusedLocationProviderClient fused;
    private HandlerThread worker;
    private Handler io;
    private String api;
    private String key;
    private boolean travelling;
    private long lastSent;

    private final LocationCallback callback = new LocationCallback() {
        @Override
        public void onLocationResult(@NonNull LocationResult result) {
            Location loc = result.getLastLocation();
            if (loc == null) return;
            long now = System.currentTimeMillis();
            if (now - lastSent < (travelling ? TRAVEL_MS : IDLE_MS) - 500) return;
            lastSent = now;
            io.post(() -> send(loc.getLatitude(), loc.getLongitude()));
        }
    };

    /** On duty right now (survives the app being closed). */
    static boolean isOnDuty(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getString(EXTRA_KEY, null) != null;
    }

    static void start(Context ctx, String api, String key) {
        Intent i = new Intent(ctx, DutyService.class).setAction(ACTION_START).putExtra(EXTRA_API, api).putExtra(EXTRA_KEY, key);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    static void stop(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().clear().apply();
        ctx.stopService(new Intent(ctx, DutyService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fused = LocationServices.getFusedLocationProviderClient(this);
        worker = new HandlerThread("rapidfix-duty");
        worker.start();
        io = new Handler(worker.getLooper());
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stop(this);
            return START_NOT_STICKY;
        }
        if (intent != null && intent.getStringExtra(EXTRA_KEY) != null) {
            prefs.edit().putString(EXTRA_API, intent.getStringExtra(EXTRA_API)).putString(EXTRA_KEY, intent.getStringExtra(EXTRA_KEY)).apply();
        }
        api = prefs.getString(EXTRA_API, null);
        key = prefs.getString(EXTRA_KEY, null);
        // Restarted by Android after being killed (START_STICKY) with nothing saved, or no location access: stop.
        if (api == null || key == null || !hasLocationPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (RuntimeException e) {
            // Not allowed to start from the background right now; the app restarts it when opened.
            stopSelf();
            return START_NOT_STICKY;
        }
        requestUpdates();
        return START_STICKY; // if Android kills it for memory, bring it back
    }

    private void requestUpdates() {
        fused.removeLocationUpdates(callback);
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, travelling ? TRAVEL_MS : IDLE_MS)
                .setMinUpdateIntervalMillis(TRAVEL_MS)
                .build();
        try {
            fused.requestLocationUpdates(req, callback, worker.getLooper());
        } catch (SecurityException e) {
            stop(this);
        }
    }

    /** POST /technician/device/location — the reply says whether we're travelling (faster pings) or offline (stop). */
    private void send(double lat, double lng) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(api + "/technician/device/location").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15_000);
            c.setReadTimeout(15_000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + key);
            byte[] body = new JSONObject().put("lat", lat).put("lng", lng).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) {
                out.write(body);
            }
            int code = c.getResponseCode();
            if (code == 401 || code == 403) {
                new Handler(Looper.getMainLooper()).post(() -> stop(this));
                return;
            }
            if (code != 200) return;
            String text;
            try (InputStream in = c.getInputStream()) {
                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                for (int n; (n = in.read(chunk)) > 0; ) buf.write(chunk, 0, n);
                text = buf.toString("UTF-8");
            }
            JSONObject data = new JSONObject(text).optJSONObject("data");
            if (data == null) return;
            if (!data.optBoolean("online", true)) {
                new Handler(Looper.getMainLooper()).post(() -> stop(this));
                return;
            }
            boolean nowTravelling = data.optBoolean("travelling", false);
            if (data.optBoolean("accepted", false) && nowTravelling != travelling) {
                travelling = nowTravelling;
                new Handler(Looper.getMainLooper()).post(this::requestUpdates);
            }
        } catch (Exception ignored) {
            // No signal right now: the next fix tries again.
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private Notification buildNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Online for jobs", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while you are online so job requests reach you instantly.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .putExtra(MainActivity.EXTRA_URL, "/technician")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_rapidfix)
                .setColor(getColor(R.color.brand))
                .setContentTitle("You're online for jobs")
                .setContentText("New requests will ring here, even with the app closed. Go offline in the app to stop.")
                .setStyle(new Notification.BigTextStyle().bigText("New requests will ring here, even with the app closed. Go offline in the app to stop."))
                .setContentIntent(tap)
                .setOngoing(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onDestroy() {
        fused.removeLocationUpdates(callback);
        worker.quitSafely();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
