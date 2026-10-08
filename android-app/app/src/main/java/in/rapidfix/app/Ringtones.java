package in.rapidfix.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Job-alert ringtone pack (res/raw/alert_*.wav, made by tools/make_ringtones.py).
 * The technician picks one in the app; it rings for new job requests — in the
 * app and as the notification sound when the app is closed.
 *
 * A notification channel's sound can't change once created, so each tone has
 * its own "Job requests" channel and the chosen one is used for new alerts.
 */
final class Ringtones {
    static final String DEFAULT = "rapidfix";
    private static final String PREF = "alertTone";

    /** id, display name, raw resource. */
    private static final Object[][] TONES = {
            {DEFAULT, "RapidFix (default)", R.raw.job_alert},
            {"marimba", "Marimba Rise", R.raw.alert_marimba},
            {"bells", "Temple Bells", R.raw.alert_bells},
            {"crystal", "Crystal Chime", R.raw.alert_crystal},
            {"classic", "Classic Phone Ring", R.raw.alert_classic},
            {"digital", "Digital Pulse", R.raw.alert_digital},
            {"harp", "Harp Glide", R.raw.alert_harp},
            {"guitar", "Acoustic Guitar", R.raw.alert_guitar},
            {"urgent", "Urgent Alarm", R.raw.alert_urgent},
            {"kalimba", "Kalimba Drops", R.raw.alert_kalimba},
            {"piano", "Soft Piano", R.raw.alert_piano},
    };

    private static MediaPlayer player;
    private static Vibrator vibrator;
    /** Call-style buzz: 0.8 s on, 0.6 s off, repeating. */
    private static final long[] RING_VIBRATION = {0, 800, 600};
    private static final Handler main = new Handler(Looper.getMainLooper());

    private Ringtones() {}

    static String selected(Context ctx) {
        String id = ctx.getSharedPreferences("rapidfix", Context.MODE_PRIVATE).getString(PREF, DEFAULT);
        return resOf(id) != 0 ? id : DEFAULT;
    }

    static void select(Context ctx, String id) {
        if (resOf(id) == 0) return;
        ctx.getSharedPreferences("rapidfix", Context.MODE_PRIVATE).edit().putString(PREF, id).apply();
    }

    static JSONObject list(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            JSONArray arr = new JSONArray();
            for (Object[] t : TONES) arr.put(new JSONObject().put("id", t[0]).put("name", t[1]));
            o.put("tones", arr).put("selected", selected(ctx));
        } catch (JSONException ignored) {
        }
        return o;
    }

    static Uri uri(Context ctx, String id) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/" + resOf(id));
    }

    /** The "Job requests" channel for the chosen tone (created on first use). */
    static String jobChannel(Context ctx) {
        String id = selected(ctx);
        String channelId = DEFAULT.equals(id) ? ctx.getString(R.string.channel_jobs_id) : "rapidfix_job_" + id + "_v1";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(channelId) == null) {
                NotificationChannel ch = new NotificationChannel(channelId, ctx.getString(R.string.channel_jobs_name) + " · " + nameOf(id), NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription(ctx.getString(R.string.channel_jobs_desc));
                ch.setSound(uri(ctx, id), new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 600, 250, 600, 250, 600, 1200});
                ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
        return channelId;
    }

    /**
     * Play a tone: a short preview, or looping — the job-request buzzer — until stop().
     * The buzzer uses the alarm sound stream, so it rings even when the phone is on
     * silent or vibrate (like an alarm clock), and vibrates like an incoming call.
     */
    static void play(Context ctx, String id, boolean loop, long previewMs) {
        stop();
        int res = resOf(id == null ? selected(ctx) : id);
        if (res == 0) return;
        if (loop) vibrate(ctx);
        MediaPlayer mp = MediaPlayer.create(ctx.getApplicationContext(), res, new AudioAttributes.Builder()
                .setUsage(loop ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(), 0);
        if (mp == null) return;
        mp.setLooping(loop);
        mp.setOnCompletionListener(p -> stop());
        mp.start();
        player = mp;
        if (!loop && previewMs > 0) main.postDelayed(Ringtones::stop, previewMs);
    }

    private static void vibrate(Context ctx) {
        Vibrator v;
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = ctx.getSystemService(VibratorManager.class);
            v = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (v == null || !v.hasVibrator()) return;
        AudioAttributes alarm = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(RING_VIBRATION, 0), alarm);
        else v.vibrate(RING_VIBRATION, 0, alarm);
        vibrator = v;
    }

    static void stop() {
        main.removeCallbacksAndMessages(null);
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
        if (player != null) {
            try {
                player.stop();
            } catch (IllegalStateException ignored) {
            }
            player.release();
            player = null;
        }
    }

    private static int resOf(String id) {
        for (Object[] t : TONES) if (t[0].equals(id)) return (int) t[2];
        return 0;
    }

    private static String nameOf(String id) {
        for (Object[] t : TONES) if (t[0].equals(id)) return (String) t[1];
        return id;
    }
}
