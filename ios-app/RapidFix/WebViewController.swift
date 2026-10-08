import UIKit
import WebKit
import Network
import UserNotifications

/**
 * The RapidFix app screen: rapidfix.in in the app's own web view, full screen,
 * with the native bridge `window.RapidFixNative` (same protocol as the Android
 * app — see apps/web/src/lib/nativeApp.ts):
 *
 *   page → app  {id, cmd, value}
 *   app → page  {id, result} | {event: 'token' | 'state' | 'navigate' | 'push', ...}
 *
 * Without internet the copy built into the app (Resources/web) is shown, and the
 * live site loads by itself once a connection appears.
 *
 * Don't add WKAppBoundDomains to Info.plist: it turns off the injected bridge
 * script and message handler, and the page falls back to browser location prompts.
 */
final class WebViewController: UIViewController {
    static let home = URL(string: "https://rapidfix.in")!
    static let appHosts: Set<String> = ["rapidfix.in", "www.rapidfix.in"]

    /**
     * Makes the website feel like an iPhone app: no grey tap flash, no long-press
     * "Copy / Save image" menu on buttons and pictures (text stays selectable), and
     * no zoom-in when a form field is tapped.
     */
    static let nativeFeel = """
    (function () {
      var css = '*{-webkit-tap-highlight-color:transparent}' +
        'button,a,img,svg,nav,[role=button],label{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
        'html{-webkit-text-size-adjust:100%}';
      var style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      var vp = document.querySelector('meta[name=viewport]');
      if (vp && !/maximum-scale/.test(vp.content)) vp.content += ', maximum-scale=1';
    })();
    """

    private(set) static weak var current: WebViewController?
    private static var pendingPath: String?

    private var web: WKWebView!
    private let splash = UIImageView(image: UIImage(named: "LaunchLogo"))
    private let offline = OfflineView()
    private var popup: PopupController?
    private let bridge = Bridge()
    private let monitor = NWPathMonitor()
    private var online = true
    private var showingBundledCopy = false
    private var pageShown = false
    private var startPath: String?

    init(startPath: String?) {
        self.startPath = startPath
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    // MARK: Opening pages

    /** "/technician/jobs/1?x=y" for a rapidfix.in link. */
    static func path(of url: URL) -> String {
        var p = url.path.isEmpty ? "/" : url.path
        if let q = url.query { p += "?" + q }
        return p
    }

    /** Show an app page — from a notification tap or a link. */
    static func open(path: String) {
        guard let vc = current, vc.pageShown else {
            pendingPath = path
            return
        }
        if vc.bridge.ready { vc.sendEvent(["event": "navigate", "url": path]) } else { vc.load(path: path) }
    }

    private func load(path: String?) {
        let url = URL(string: path ?? "/", relativeTo: Self.home)?.absoluteURL ?? Self.home
        web.load(URLRequest(url: url))
    }

    // MARK: Screen

    override func viewDidLoad() {
        super.viewDidLoad()
        Self.current = self
        view.backgroundColor = .white

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = [] // the job-alert tone plays without a tap
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1 RapidFixApp/\(AppState.version)"
        config.setURLSchemeHandler(BundledWeb(), forURLScheme: BundledWeb.scheme)
        let content = config.userContentController
        content.addUserScript(WKUserScript(source: Bridge.shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.addUserScript(WKUserScript(source: Self.nativeFeel, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        content.add(WeakMessageHandler(self), name: Bridge.handlerName)
        #if DEBUG
        // Store screenshots (launch with -screenshots): skip the one-time permission sheets.
        if ProcessInfo.processInfo.arguments.contains("-screenshots") {
            let skip = "try{localStorage.setItem('rapidfix.permissionsAsked','1');localStorage.setItem('rapidfix.notificationsAsked','1')}catch(e){}"
            content.addUserScript(WKUserScript(source: skip, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.allowsLinkPreview = false // no long-press link previews: taps behave like app buttons
        web.isOpaque = false
        web.backgroundColor = .clear // the logo shows through until the first page paints
        // Edge to edge, like a native app: the pages pad themselves with env(safe-area-inset-*).
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.backgroundColor = .white
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }
        #endif

        splash.contentMode = .scaleAspectFit
        for v in [splash, web!, offline] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        NSLayoutConstraint.activate([
            splash.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            splash.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            splash.widthAnchor.constraint(equalToConstant: 160),
            splash.heightAnchor.constraint(equalToConstant: 160),
            // iPad shows the website's desktop layout, whose top bar doesn't pad for the status bar.
            web.topAnchor.constraint(equalTo: UIDevice.current.userInterfaceIdiom == .pad ? view.safeAreaLayoutGuide.topAnchor : view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            offline.topAnchor.constraint(equalTo: view.topAnchor),
            offline.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            offline.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offline.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        offline.isHidden = true
        offline.onRetry = { [weak self] in self?.retry() }

        bridge.controller = self
        watchConnection()
        let path = startPath ?? Self.pendingPath
        Self.pendingPath = nil
        load(path: path)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    /** Back on screen: tell the page (permissions may have changed in Settings), clear rung-out job alerts. */
    func didBecomeActive() {
        UNUserNotificationCenter.current().getDeliveredNotifications { list in
            let jobs = list.filter { ($0.request.content.userInfo["type"] as? String) == "NEW_JOB" }.map(\.request.identifier)
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: jobs)
        }
        Task { @MainActor in
            var s = await bridge.state()
            s["event"] = "state"
            sendEvent(s)
        }
    }

    // MARK: Talking to the page

    func sendEvent(_ message: [String: Any]) {
        guard bridge.ready,
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8),
              let literal = try? JSONSerialization.data(withJSONObject: [json]),
              let arg = String(data: literal, encoding: .utf8)
        else { return }
        // arg is `["…"]`: a safely escaped JS string inside an array.
        DispatchQueue.main.async { self.web.evaluateJavaScript("window.__rapidfixDeliver && window.__rapidfixDeliver(\(arg)[0])") }
    }

    func print(jobName: String) {
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = jobName
        info.outputType = .general
        let pc = UIPrintInteractionController.shared
        pc.printInfo = info
        pc.printFormatter = web.viewPrintFormatter()
        pc.present(animated: true)
    }

    // MARK: Offline

    private func watchConnection() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let wasOnline = self.online
                self.online = path.status == .satisfied
                // Back online after showing the built-in copy or the offline screen: load the live site.
                if self.online, !wasOnline || self.showingBundledCopy || !self.offline.isHidden { self.retry() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "rapidfix.network"))
    }

    private func retry() {
        guard showingBundledCopy || !offline.isHidden else { return }
        offline.isHidden = true
        let path = showingBundledCopy ? web.url.map(Self.path(of:)) : nil
        showingBundledCopy = false
        load(path: path)
    }

    fileprivate func failedToLoad(_ error: Error, url: URL?) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled || code == 102 /* frame load interrupted */ { return }
        let host = url?.host ?? Self.home.host!
        guard Self.appHosts.contains(host) else { return }
        if BundledWeb.available {
            showingBundledCopy = true
            let path = url.map(Self.path(of:)) ?? "/"
            web.load(URLRequest(url: URL(string: "\(BundledWeb.scheme)://app\(path)")!))
        } else {
            offline.isHidden = false
        }
    }

    /** The app's code is running (bridge said hello): fade the logo into the first screen. */
    func appStarted() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.revealPage() }
    }

    fileprivate func pageFinished() {
        // Fallback if the page never says hello (e.g. an error page).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.revealPage() }
    }

    private func revealPage() {
        guard !pageShown else { return }
        pageShown = true
        web.backgroundColor = .white
        UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseOut]) {
            self.splash.alpha = 0
            self.splash.transform = CGAffineTransform(scaleX: 1.08, y: 1.08)
        } completion: { _ in
            self.splash.isHidden = true
        }
        if let p = Self.pendingPath {
            Self.pendingPath = nil
            Self.open(path: p)
        }
    }
}

// MARK: - Bridge messages

extension WebViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? String else { return }
        let origin = message.frameInfo.securityOrigin
        let trusted = (origin.protocol == "https" && Self.appHosts.contains(origin.host)) || origin.protocol == BundledWeb.scheme
        guard trusted else { return }
        bridge.handle(body) { [weak self] reply in self?.sendEvent(reply) }
    }
}

/** WKUserContentController keeps its handlers alive; this keeps the screen from being kept alive with it. */
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(c, didReceive: m) }
}

// MARK: - Navigation

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        bridge.ready = false // the new page says "hello" when its bridge is listening
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.allow) }
        switch scheme {
        case "http", "https":
            // A tapped link to another website opens in Safari; the app's own pages, payment and
            // sign-in steps (redirects and frames) stay in the app.
            let external = action.targetFrame?.isMainFrame == true && action.navigationType == .linkActivated && !Self.appHosts.contains(url.host ?? "")
            if external {
                UIApplication.shared.open(url)
                return decisionHandler(.cancel)
            }
            decisionHandler(.allow)
        case "about", "blob", "data", BundledWeb.scheme:
            decisionHandler(.allow)
        default:
            // tel:, mailto:, whatsapp:, and UPI apps (phonepe:, tez:, paytmmp:, upi:) from the payment sheet.
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageFinished()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let failing = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL
        failedToLoad(error, url: failing ?? webView.url)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        pageFinished()
    }

    /** iOS stopped the page's process to save memory (while in the background): load it again. */
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        bridge.ready = false
        if let url = webView.url { webView.load(URLRequest(url: url)) } else { load(path: nil) }
    }
}

// MARK: - Windows and dialogs

extension WebViewController: WKUIDelegate {
    /** Payment (Razorpay card / bank pages) and sign-in windows open over the app; other sites in Safari. */
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = action.request.url
        if let url, let host = url.host, Self.appHosts.contains(host) {
            webView.load(action.request)
            return nil
        }
        if let url, let scheme = url.scheme, !["http", "https", "about"].contains(scheme) {
            UIApplication.shared.open(url)
            return nil
        }
        let p = PopupController(configuration: configuration, delegate: self)
        popup = p
        present(p, animated: true)
        return p.web
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === popup?.web {
            popup?.dismiss(animated: true)
            popup = nil
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        topPresenter.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        topPresenter.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        topPresenter.present(a, animated: true)
    }

    private var topPresenter: UIViewController {
        var vc: UIViewController = self
        while let next = vc.presentedViewController { vc = next }
        return vc
    }
}

/** A window the page opened (e.g. a bank's card verification page during payment). */
private final class PopupController: UIViewController, WKNavigationDelegate {
    let web: WKWebView

    init(configuration: WKWebViewConfiguration, delegate: WKUIDelegate) {
        web = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
        web.uiDelegate = delegate
        web.navigationDelegate = self
        modalPresentationStyle = .pageSheet
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .touchUpInside)
        for v in [close, web] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            close.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            web.topAnchor.constraint(equalTo: close.bottomAnchor, constant: 8),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = action.request.url, let scheme = url.scheme?.lowercased(), !["http", "https", "about", "blob", "data"].contains(scheme) {
            UIApplication.shared.open(url) // a UPI app from the payment page
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }
}

/** First launch with no internet and nothing saved yet. */
private final class OfflineView: UIView {
    var onRetry: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .white
        let title = UILabel()
        title.text = "You're offline"
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.textColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)
        let body = UILabel()
        body.text = "Connect to the internet to open RapidFix. It reloads by itself when you're back online."
        body.font = .systemFont(ofSize: 15)
        body.textColor = UIColor(red: 0.39, green: 0.45, blue: 0.55, alpha: 1)
        body.numberOfLines = 0
        body.textAlignment = .center
        var cfg = UIButton.Configuration.filled()
        cfg.title = "Try again"
        cfg.baseBackgroundColor = UIColor(red: 0.15, green: 0.39, blue: 0.92, alpha: 1)
        let retry = UIButton(configuration: cfg)
        retry.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, body, retry])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -32),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }
}
