package in.rapidfix.app;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * Receives RapidFix pushes. The server sends data-only, high-priority messages
 * to the app, so this runs even when the app is closed and builds the
 * notification itself (ringing for job requests).
 */
public class PushService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = new HashMap<>(message.getData());
        RemoteMessage.Notification n = message.getNotification();
        if (n != null) {
            if (!data.containsKey("title")) data.put("title", n.getTitle());
            if (!data.containsKey("body")) data.put("body", n.getBody());
        }
        Log.i("RapidFixPush", "message " + data.get("type") + " foreground=" + MainActivity.isInForeground());
        // While the app is on screen it shows the update itself (and rings in-app for job requests).
        if (MainActivity.isInForeground()) {
            MainActivity.notifyWeb(data);
            return;
        }
        // A new job request rings like an alarm (audible on silent / vibrate) until answered;
        // everything else is a normal notification.
        if (Notifications.TYPE_NEW_JOB.equals(data.get("type")) && JobAlarmService.start(this, data)) return;
        Notifications.show(this, data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        MainActivity.onPushToken(this, token);
    }
}
