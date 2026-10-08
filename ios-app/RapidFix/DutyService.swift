import UIKit
import CoreLocation

/**
 * Technician "online for jobs": sends the phone's GPS to the server (every 5 s
 * while travelling to a customer, otherwise every 30 s) — in the background too.
 * If the app is closed, iOS relaunches it in the background on the next
 * significant location change and sharing carries on.
 *
 * Authorised by a location-only key from the server (POST /technician/location-key),
 * never by the login. Stops when the server says the partner is offline, when the
 * key is rejected, or when the partner goes offline / signs out in the app.
 */
final class DutyService: NSObject, CLLocationManagerDelegate {
    static let shared = DutyService()

    private static let apiKey = "rapidfix.duty.api"
    private static let tokenKey = "rapidfix.duty.key"
    private static let askedAlwaysKey = "rapidfix.duty.askedAlways"
    private static let idleInterval: TimeInterval = 30
    private static let travelInterval: TimeInterval = 5

    private let manager = CLLocationManager()
    private var travelling = false
    private var lastSent = Date.distantPast
    private var sending = false

    private override init() {
        super.init()
        manager.delegate = self
    }

    /** On duty right now (survives the app being closed). */
    var isOnDuty: Bool { UserDefaults.standard.string(forKey: Self.tokenKey) != nil }

    func start(api: String, key: String) {
        UserDefaults.standard.set(api, forKey: Self.apiKey)
        UserDefaults.standard.set(key, forKey: Self.tokenKey)
        begin()
    }

    func stop() {
        UserDefaults.standard.removeObject(forKey: Self.apiKey)
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        travelling = false
    }

    /** App launched (also by iOS in the background after a location change): carry on if online. */
    func resumeIfOnDuty() {
        if isOnDuty { begin() }
    }

    private func begin() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization() // continues in locationManagerDidChangeAuthorization
            return
        case .denied, .restricted:
            return
        case .authorizedWhenInUse:
            // Sharing while the app is closed needs "Always": iOS offers the upgrade once.
            if !UserDefaults.standard.bool(forKey: Self.askedAlwaysKey) {
                UserDefaults.standard.set(true, forKey: Self.askedAlwaysKey)
                manager.requestAlwaysAuthorization()
            }
        default:
            break
        }
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        manager.showsBackgroundLocationIndicator = true
        manager.activityType = .otherNavigation
        manager.distanceFilter = kCLDistanceFilterNone // keep reporting while parked, so job offers still find the partner
        manager.desiredAccuracy = travelling ? kCLLocationAccuracyBest : kCLLocationAccuracyNearestTenMeters
        manager.startUpdatingLocation()
        if manager.authorizationStatus == .authorizedAlways { manager.startMonitoringSignificantLocationChanges() }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if isOnDuty { begin() }
        WebViewController.current?.didBecomeActive() // the page shows the new permission
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0, isOnDuty else { return }
        let interval = travelling ? Self.travelInterval : Self.idleInterval
        guard !sending, Date().timeIntervalSince(lastSent) >= interval - 0.5 else { return }
        lastSent = Date()
        send(loc.coordinate)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // No fix right now: the next one tries again.
    }

    /** POST /technician/device/location — the reply says whether we're travelling (faster pings) or offline (stop). */
    private func send(_ c: CLLocationCoordinate2D) {
        guard let api = UserDefaults.standard.string(forKey: Self.apiKey),
              let key = UserDefaults.standard.string(forKey: Self.tokenKey),
              let url = URL(string: api + "/technician/device/location")
        else { return }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["lat": c.latitude, "lng": c.longitude])

        sending = true
        // Finish the request even if iOS suspends the app right after this update.
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "rapidfix.location") {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                defer {
                    self?.sending = false
                    if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
                }
                guard let self, let http = response as? HTTPURLResponse else { return }
                if http.statusCode == 401 || http.statusCode == 403 { return self.stop() }
                guard http.statusCode == 200, let data,
                      let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let d = body["data"] as? [String: Any]
                else { return }
                if (d["online"] as? Bool) == false { return self.stop() }
                let nowTravelling = (d["travelling"] as? Bool) ?? false
                if (d["accepted"] as? Bool) == true, nowTravelling != self.travelling {
                    self.travelling = nowTravelling
                    self.manager.desiredAccuracy = nowTravelling ? kCLLocationAccuracyBest : kCLLocationAccuracyNearestTenMeters
                }
            }
        }.resume()
    }
}
