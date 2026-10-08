import CoreLocation

/**
 * One precise position for the page ("getLocation"), like delivery apps: asks
 * for permission the first time only, asks for Precise Location if the user
 * chose Approximate, then keeps the most accurate reading for a few seconds.
 *
 * Answers {latitude, longitude, accuracy} or {error: "denied" | "unavailable"}.
 */
final class LocationFix: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var callbacks: [([String: Any]) -> Void] = []
    private var best: CLLocation?
    private var timer: Timer?
    private static let goodEnough: CLLocationAccuracy = 15
    private static let maxWait: TimeInterval = 12

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func fetch(_ done: @escaping ([String: Any]) -> Void) {
        callbacks.append(done)
        guard callbacks.count == 1 else { return } // already fetching: answer everyone together
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization() // continues in locationManagerDidChangeAuthorization
        case .denied, .restricted:
            finish(["error": "denied"])
        default:
            start()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !callbacks.isEmpty else { return }
        switch manager.authorizationStatus {
        case .notDetermined: return
        case .denied, .restricted: finish(["error": "denied"])
        default: start()
        }
    }

    private func start() {
        guard timer == nil else { return }
        best = nil
        let begin = { [weak self] in
            guard let self else { return }
            self.manager.startUpdatingLocation()
            self.timer = Timer.scheduledTimer(withTimeInterval: Self.maxWait, repeats: false) { [weak self] _ in self?.done() }
        }
        if manager.accuracyAuthorization == .reducedAccuracy {
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "PreciseAddress") { _ in begin() }
        } else {
            begin()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations where loc.horizontalAccuracy >= 0 {
            if best == nil || loc.horizontalAccuracy < best!.horizontalAccuracy { best = loc }
        }
        if let b = best, b.horizontalAccuracy <= Self.goodEnough { done() }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { done(error: "denied") }
        // Other errors (no fix yet) are temporary: keep listening until the timer runs out.
    }

    private func done(error: String = "unavailable") {
        manager.stopUpdatingLocation()
        timer?.invalidate()
        timer = nil
        if let b = best ?? manager.location {
            finish(["latitude": b.coordinate.latitude, "longitude": b.coordinate.longitude, "accuracy": Int(b.horizontalAccuracy.rounded())])
        } else {
            finish(["error": error])
        }
    }

    private func finish(_ result: [String: Any]) {
        let cbs = callbacks
        callbacks = []
        cbs.forEach { $0(result) }
    }
}
