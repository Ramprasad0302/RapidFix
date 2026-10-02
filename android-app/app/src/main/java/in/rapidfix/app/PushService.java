package in.rapidfix.app;

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
        // While the app is on screen it shows the update itself (and rings in-app for job requests).
        if (MainActivity.isInForeground()) {
            MainActivity.notifyWeb(data);
            return;
        }
        Notifications.show(this, data);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        MainActivity.onPushToken(this, token);
    }
}
