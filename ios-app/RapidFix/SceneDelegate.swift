import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        // Opened from a rapidfix.in link: start on that page.
        let link = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb })?.webpageURL
        #if DEBUG
        // Store screenshots: launch with -startPath /assistant to open a given page.
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-startPath"), i + 1 < args.count {
            let window = UIWindow(windowScene: windowScene)
            window.rootViewController = WebViewController(startPath: args[i + 1])
            window.makeKeyAndVisible()
            self.window = window
            return
        }
        #endif
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController(startPath: link.map(WebViewController.path(of:)))
        window.makeKeyAndVisible()
        self.window = window
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
            WebViewController.open(path: WebViewController.path(of: url))
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        WebViewController.current?.didBecomeActive()
    }
}
