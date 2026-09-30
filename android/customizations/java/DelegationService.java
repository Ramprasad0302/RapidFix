package in.rapidfix.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;

/**
 * RapidFix customisation (kept in android/customizations/, copied over the
 * Bubblewrap-generated file by android/build.sh).
 *
 * New job requests ("New service request" push) go to a high-priority
 * "Job requests" channel that plays the RapidFix alert tone and keeps ringing
 * (FLAG_INSISTENT) until the technician opens or dismisses the notification —
 * even when the app is closed. Every other notification is shown normally.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    private static final String JOB_CHANNEL_ID = "rapidfix_job_requests_v1";
    private static final String JOB_TITLE = "New service request";
    private static final long[] JOB_VIBRATION = {0, 600, 250, 600, 250, 600, 1200};

    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId, Notification notification, String channelName) {
        if (!isJobRequest(notification)) {
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) return false;

        Uri tone = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/" + R.raw.job_alert);
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ensureJobChannel(manager, tone);
            builder = Notification.Builder.recoverBuilder(this, notification).setChannelId(JOB_CHANNEL_ID);
        } else {
            builder = Notification.Builder.recoverBuilder(this, notification)
                    .setSound(tone)
                    .setVibrate(JOB_VIBRATION)
                    .setPriority(Notification.PRIORITY_MAX);
        }
        builder.setCategory(Notification.CATEGORY_CALL).setAutoCancel(true);
        Notification ringing = builder.build();
        ringing.flags |= Notification.FLAG_INSISTENT; // repeat the tone until the user responds
        manager.notify(platformTag, platformId, ringing);
        return true;
    }

    private static boolean isJobRequest(Notification n) {
        CharSequence title = n.extras != null ? n.extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        return title != null && title.toString().startsWith(JOB_TITLE);
    }

    private void ensureJobChannel(NotificationManager manager, Uri tone) {
        if (manager.getNotificationChannel(JOB_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(JOB_CHANNEL_ID, "Job requests", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("New service requests from customers. Rings until you respond.");
        channel.setSound(tone, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        channel.enableVibration(true);
        channel.setVibrationPattern(JOB_VIBRATION);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }
}
