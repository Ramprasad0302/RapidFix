package in.rapidfix.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import java.util.Map;

/**
 * System notifications for pushes that arrive while the app is closed or in the
 * background.
 *
 * New job requests (type NEW_JOB) use the "Job requests" channel: the RapidFix
 * alert tone, repeated (FLAG_INSISTENT) until the technician taps or swipes it,
 * and removed automatically when the offer expires. Everything else uses the
 * "Booking updates" channel with the normal notification sound.
 */
final class Notifications {
    static final String TYPE_NEW_JOB = "NEW_JOB";
    private static final String JOB_TAG = "job";
    private static final long[] JOB_VIBRATION = {0, 600, 250, 600, 250, 600, 1200};

    private Notifications() {}

    static void createChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        String jobsId = ctx.getString(R.string.channel_jobs_id);
        String updatesId = ctx.getString(R.string.channel_updates_id);

        NotificationChannel jobs = new NotificationChannel(jobsId, ctx.getString(R.string.channel_jobs_name), NotificationManager.IMPORTANCE_HIGH);
        jobs.setDescription(ctx.getString(R.string.channel_jobs_desc));
        jobs.setSound(jobTone(ctx), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        jobs.enableVibration(true);
        jobs.setVibrationPattern(JOB_VIBRATION);
        jobs.enableLights(true);
        jobs.setLightColor(ctx.getColor(R.color.brand));
        jobs.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(jobs);

        NotificationChannel updates = new NotificationChannel(updatesId, ctx.getString(R.string.channel_updates_name), NotificationManager.IMPORTANCE_HIGH);
        updates.setDescription(ctx.getString(R.string.channel_updates_desc));
        updates.enableVibration(true);
        nm.createNotificationChannel(updates);

        // Channels left over from the earlier Play Store build (web app shell).
        for (NotificationChannel c : nm.getNotificationChannels()) {
            if (!c.getId().equals(jobsId) && !c.getId().equals(updatesId) && !c.getId().startsWith("rapidfix_job_") && !c.getId().startsWith("rapidfix_on_duty") && !c.getId().equals(NotificationChannel.DEFAULT_CHANNEL_ID)) {
                nm.deleteNotificationChannel(c.getId());
            }
        }
    }

    static void show(Context ctx, Map<String, String> data) {
        String title = data.get("title");
        String body = data.get("body");
        if (title == null || title.isEmpty()) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || !nm.areNotificationsEnabled()) return;

        boolean job = TYPE_NEW_JOB.equals(data.get("type"));
        String key = data.get(job ? "bookingId" : "notificationId");
        int id = key != null ? key.hashCode() : (int) System.currentTimeMillis();

        Intent open = new Intent(ctx, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .putExtra(MainActivity.EXTRA_URL, data.get("url"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, job ? Ringtones.jobChannel(ctx) : ctx.getString(R.string.channel_updates_id))
                : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_rapidfix)
                .setColor(ctx.getColor(R.color.brand))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setShowWhen(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (job) {
            b.setCategory(Notification.CATEGORY_CALL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                long left = millisUntil(data.get("expiresAt"));
                if (left > 0) b.setTimeoutAfter(left);
            } else {
                b.setPriority(Notification.PRIORITY_MAX).setSound(Ringtones.uri(ctx, Ringtones.selected(ctx))).setVibrate(JOB_VIBRATION);
            }
        } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }

        Notification n = b.build();
        if (job) n.flags |= Notification.FLAG_INSISTENT; // keep ringing until the technician responds
        try {
            nm.notify(job ? JOB_TAG : null, id, n);
        } catch (SecurityException ignored) {
            // Notifications switched off for the app.
        }
    }

    /** The app is open: the in-app pop-up takes over, so stop any ringing job alerts. */
    static void cancelJobAlerts(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (StatusBarNotification s : nm.getActiveNotifications()) {
            if (JOB_TAG.equals(s.getTag())) nm.cancel(s.getTag(), s.getId());
        }
    }

    private static Uri jobTone(Context ctx) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/" + R.raw.job_alert);
    }

    private static long millisUntil(String iso) {
        if (iso == null || iso.isEmpty()) return 0;
        try {
            long at = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? java.time.Instant.parse(iso).toEpochMilli()
                    : 0;
            return at - System.currentTimeMillis();
        } catch (RuntimeException e) {
            return 0;
        }
    }
}
