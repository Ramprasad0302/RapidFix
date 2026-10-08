import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

/**
 * App start-up: Firebase push (job requests and booking updates arrive even when
 * the app is closed — Apple shows them), the technician's alert tone, and the
 * "online for jobs" location sharing, which iOS relaunches the app for after a
 * location change even when it was closed.
 */
@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            Messaging.messaging().delegate = self
        }
        UNUserNotificationCenter.current().delegate = self
        Tones.installSelected()
        DutyService.shared.resumeIfOnDuty()
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
    }

    // MARK: Push

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else { return }
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken, !token.isEmpty else { return }
        AppState.pushToken = token
        WebViewController.current?.sendEvent(["event": "token", "token": token])
    }

    /** A push while the app is on screen: the page refreshes its lists; a new job rings in the app itself. */
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let type = notification.request.content.userInfo["type"] as? String ?? ""
        WebViewController.current?.sendEvent(["event": "push", "type": type])
        completionHandler(type == "NEW_JOB" ? [.banner, .list] : [.banner, .list, .sound])
    }

    /** Notification tapped: open the screen it's about. */
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let type = info["type"] as? String
        let url = info["url"] as? String ?? (type == "NEW_JOB" ? "/technician" : nil)
        if let url { WebViewController.open(path: url) }
        completionHandler()
    }
}

/** Small values kept across launches. */
enum AppState {
    private static let tokenKey = "rapidfix.pushToken"

    static var pushToken: String? {
        get { UserDefaults.standard.string(forKey: tokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: tokenKey) }
    }

    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }
}
