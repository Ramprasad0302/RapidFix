package in.rapidfix.app;

import android.app.Application;

public class App extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Notifications.createChannels(this);
    }
}
