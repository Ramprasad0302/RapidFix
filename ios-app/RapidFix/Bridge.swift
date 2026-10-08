import UIKit
import CoreLocation
import UserNotifications

/**
 * Commands from the page (`window.RapidFixNative.postMessage`), answered as
 * {id, result}. Same commands and answers as the Android app (MainActivity.java),
 * so the website needs no iPhone-specific code beyond `platform: "ios"`.
 */
final class Bridge {
    static let handlerName = "rapidfix"

    /**
     * Gives the page the same `window.RapidFixNative` object the Android app does:
     * postMessage(string) and addEventListener('message', e => e.data).
     */
    static let shim = """
    (function () {
      if (window.RapidFixNative) return;
      var listeners = [];
      window.RapidFixNative = {
        platform: 'ios',
        postMessage: function (m) { window.webkit.messageHandlers.\(handlerName).postMessage(String(m)); },
        addEventListener: function (type, l) { if (type === 'message') listeners.push(l); },
        removeEventListener: function (type, l) { listeners = listeners.filter(function (x) { return x !== l; }); }
      };
      window.__rapidfixDeliver = function (data) {
        listeners.slice().forEach(function (l) { try { l({ data: data }); } catch (e) { console.error(e); } });
      };
    })();
    """

    weak var controller: WebViewController?
    /** The current page has said "hello" (its listener is in place). */
    var ready = false
    private let location = LocationFix()

    func handle(_ body: String, reply: @escaping ([String: Any]) -> Void) {
        guard let data = body.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cmd = msg["cmd"] as? String
        else { return }
        let id = msg["id"] as? String ?? ""
        let value = msg["value"]
        let respond: (Any?) -> Void = { result in
            guard !id.isEmpty else { return }
            reply(["id": id, "result": result ?? NSNull()])
        }

        switch cmd {
        case "hello":
            ready = true
            controller?.appStarted()
            Task { @MainActor in respond(await self.state()) }
        case "state":
            Task { @MainActor in respond(await self.state()) }
        case "requestNotificationPermission":
            requestNotificationPermission(respond)
        case "keepScreenOn":
            UIApplication.shared.isIdleTimerDisabled = (value as? Bool) ?? false
            respond(nil)
        case "openNotificationSettings":
            let s: String
            if #available(iOS 16.0, *) { s = UIApplication.openNotificationSettingsURLString } else { s = UIApplication.openSettingsURLString }
            if let url = URL(string: s) { UIApplication.shared.open(url) }
            respond(nil)
        case "openAppSettings", "openBatterySettings":
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            respond(nil)
        case "startDuty":
            // Technician went online: share GPS in the background (iOS relaunches the app for it).
            if let v = value as? [String: Any], let api = v["api"] as? String, let key = v["key"] as? String, !api.isEmpty, !key.isEmpty {
                DutyService.shared.start(api: api, key: key)
            }
            respond(DutyService.shared.isOnDuty)
        case "stopDuty":
            DutyService.shared.stop()
            respond(false)
        case "alertTones":
            respond(Tones.list())
        case "setAlertTone":
            Tones.select(value as? String ?? "")
            respond(Tones.list())
        case "previewTone":
            Tones.play(value as? String, loop: false, previewSeconds: 7)
            respond(nil)
        case "ringStart":
            Tones.play(nil, loop: true, previewSeconds: 0)
            respond(nil)
        case "ringStop", "stopTone":
            Tones.stop()
            respond(nil)
        case "haptic":
            Haptics.play(value as? String ?? "light")
            respond(nil)
        case "flushCookies":
            respond(nil) // WebKit saves cookies itself
        case "getLocation":
            location.fetch { respond($0) }
        case "catalogSnapshot":
            respond(BundledWeb.catalogSnapshot())
        case "print":
            controller?.print(jobName: value as? String ?? "RapidFix")
            respond(nil)
        default:
            respond(nil) // e.g. razorpayPay: the iPhone app uses Razorpay's web checkout
        }
    }

    @MainActor
    func state() async -> [String: Any] {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let permission: String
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: permission = "granted"
        case .denied: permission = "denied"
        default: permission = "default"
        }
        let loc: String
        switch CLLocationManager().authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: loc = "granted"
        case .denied, .restricted: loc = "denied"
        default: loc = "default"
        }
        return [
            "platform": "ios",
            "version": AppState.version,
            "permission": permission,
            "token": AppState.pushToken ?? NSNull(),
            "batteryRestricted": false,
            "location": loc,
            "onDuty": DutyService.shared.isOnDuty,
        ]
    }

    private func requestNotificationPermission(_ respond: @escaping (Any?) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async {
                if granted { UIApplication.shared.registerForRemoteNotifications() }
                respond(granted ? "granted" : "denied")
            }
        }
    }
}
