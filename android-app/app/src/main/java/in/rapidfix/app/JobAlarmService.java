package in.rapidfix.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;

import java.util.Map;

/**
 * The job-request buzzer while the app is closed: a short foreground service that
 * rings the technician's chosen tone on the ALARM stream (audible even on silent
 * or vibrate, like an alarm clock) and vibrates like an incoming call, with a
 * heads-up "New service request" notification — until the technician opens the
 * app, taps "Stop ringing", swipes it away, or the offer expires (2 min at most).
 *
 * The notification's own sound is the fallback (Notifications.show) when Android
 * doesn't let the service start.
 */
public class JobAlarmService extends Service {
    static final String ACTION_STOP = "in.rapidfix.app.JOB_ALARM_STOP";
    private static final String CHANNEL_ID = "rapidfix_job_ringing_v1";
    private static final int NOTIFICATION_ID = 7002;
    private static final long MAX_RING_MS = 120_000;

    private final Handler main = new Handler(Looper.getMainLooper());

    /** Start ringing for a job push. Returns false when Android refuses — the caller shows a normal ringing notification instead. */
    static boolean start(Context ctx, Map<String, String> data) {
        Intent i = new Intent(ctx, JobAlarmService.class);
        for (Map.Entry<String, String> e : data.entrySet()) i.putExtra(e.getKey(), e.getValue());
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
            return true;
        } catch (RuntimeException e) {
            Log.w("RapidFixPush", "job alarm not allowed: " + e);
            return false;
        }
    }

    /** The technician has seen it (opened the app / answered): silence the buzzer. */
    static void stop(Context ctx) {
        Ringtones.stop();
        ctx.stopService(new Intent(ctx, JobAlarmService.class));
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            silence();
            return START_NOT_STICKY;
        }
        Notification n = buildNotification(intent);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE);
            else startForeground(NOTIFICATION_ID, n);
        } catch (RuntimeException e) {
            // Not allowed right now: fall back to the notification's own (insistent) sound.
            Log.w("RapidFixPush", "job alarm foreground refused: " + e);
            Notifications.show(this, extrasOf(intent));
            stopSelf();
            return START_NOT_STICKY;
        }
        Ringtones.play(this, null, true, 0);
        main.removeCallbacksAndMessages(null);
        long until = Notifications.millisUntil(intent.getStringExtra("expiresAt"));
        main.postDelayed(this::silence, until > 0 ? Math.min(until, MAX_RING_MS) : MAX_RING_MS);
        return START_NOT_STICKY;
    }

    /** Stop the sound and vibration; the notification stays (silently) until the offer expires. */
    private void silence() {
        main.removeCallbacksAndMessages(null);
        Ringtones.stop();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_DETACH);
        else stopForeground(false);
        stopSelf();
    }

    /** Android 14+: a short service must finish within ~3 minutes. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        silence();
    }

    @Override
    public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        Ringtones.stop();
        super.onDestroy();
    }

    private Notification buildNotification(Intent data) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            // The service rings and vibrates itself, so this channel is silent — but heads-up and on the lock screen.
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, getString(R.string.channel_jobs_name), NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(getString(R.string.channel_jobs_desc));
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        String title = data.getStringExtra("title");
        String body = data.getStringExtra("body");
        String url = data.getStringExtra("url");
        Intent open = new Intent(this, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .putExtra(MainActivity.EXTRA_URL, url != null ? url : "/technician")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent mute = PendingIntent.getService(this, NOTIFICATION_ID, new Intent(this, JobAlarmService.class).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_rapidfix)
                .setColor(getColor(R.color.brand))
                .setContentTitle(title != null ? title : "New service request")
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_CALL)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(tap)
                .setDeleteIntent(mute)
                .setAutoCancel(true)
                .setShowWhen(true)
                .addAction(new Notification.Action.Builder(null, "View request", tap).build())
                .addAction(new Notification.Action.Builder(null, "Stop ringing", mute).build());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_MAX);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        long left = Notifications.millisUntil(data.getStringExtra("expiresAt"));
        if (left > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(left);
        return b.build();
    }

    private static Map<String, String> extrasOf(Intent i) {
        Map<String, String> m = new java.util.HashMap<>();
        if (i.getExtras() != null) for (String k : i.getExtras().keySet()) {
            String v = i.getStringExtra(k);
            if (v != null) m.put(k, v);
        }
        return m;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
