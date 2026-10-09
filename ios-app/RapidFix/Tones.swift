import AVFoundation

/**
 * Job-alert ringtone pack (the .caf files in Resources/Sounds, the same tones as the Android
 * app, cut to 29 s — Apple's limit for notification sounds). The technician picks
 * one in the app; it rings for new job requests:
 *
 *  - app closed: the server sends sound "rapidfix_alert.caf", and iOS plays the
 *    copy of the chosen tone kept under Library/Sounds with that name;
 *  - app open: it rings here, looping, until the job is answered.
 */
enum Tones {
    static let defaultId = "rapidfix"
    private static let prefKey = "rapidfix.alertTone"
    private static let notificationSound = "rapidfix_alert.caf"

    /** id, display name, file in Resources/Sounds. */
    private static let all: [(id: String, name: String, file: String)] = [
        (defaultId, "RapidFix (default)", "job_alert"),
        ("marimba", "Marimba Rise", "alert_marimba"),
        ("bells", "Temple Bells", "alert_bells"),
        ("crystal", "Crystal Chime", "alert_crystal"),
        ("classic", "Classic Phone Ring", "alert_classic"),
        ("digital", "Digital Pulse", "alert_digital"),
        ("harp", "Harp Glide", "alert_harp"),
        ("guitar", "Acoustic Guitar", "alert_guitar"),
        ("urgent", "Urgent Alarm", "alert_urgent"),
        ("kalimba", "Kalimba Drops", "alert_kalimba"),
        ("piano", "Soft Piano", "alert_piano"),
        ("sitar", "Sitar Raga", "alert_sitar"),
        ("flute", "Bansuri Flute", "alert_flute"),
    ]

    private static var player: AVAudioPlayer?
    private static var previewTimer: Timer?
    private static var vibrateTimer: Timer?

    static var selected: String {
        let id = UserDefaults.standard.string(forKey: prefKey) ?? defaultId
        return url(of: id) != nil ? id : defaultId
    }

    static func list() -> [String: Any] {
        ["tones": all.filter { url(of: $0.id) != nil }.map { ["id": $0.id, "name": $0.name] }, "selected": selected]
    }

    static func select(_ id: String) {
        guard url(of: id) != nil else { return }
        UserDefaults.standard.set(id, forKey: prefKey)
        installSelected(force: true)
    }

    /** Put the chosen tone where iOS looks for notification sounds (Library/Sounds). */
    static func installSelected(force: Bool = false) {
        guard let src = url(of: selected),
              let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first
        else { return }
        let dir = lib.appendingPathComponent("Sounds", isDirectory: true)
        let dest = dir.appendingPathComponent(notificationSound)
        if !force && FileManager.default.fileExists(atPath: dest.path) { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: dest)
        try? FileManager.default.copyItem(at: src, to: dest)
    }

    /** A short preview, or looping (the in-app ring for a new job) until stop(). */
    static func play(_ id: String?, loop: Bool, previewSeconds: TimeInterval) {
        DispatchQueue.main.async {
            stop()
            guard let u = url(of: id ?? selected), let p = try? AVAudioPlayer(contentsOf: u) else { return }
            // Rings even with the silent switch on, like a phone call.
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.duckOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
            p.numberOfLoops = loop ? -1 : 0
            p.play()
            player = p
            if loop {
                // A new job rings like a call: vibrate along with the tone.
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
                vibrateTimer = Timer.scheduledTimer(withTimeInterval: 1.6, repeats: true) { _ in AudioServicesPlaySystemSound(kSystemSoundID_Vibrate) }
            }
            if !loop && previewSeconds > 0 {
                previewTimer = Timer.scheduledTimer(withTimeInterval: previewSeconds, repeats: false) { _ in stop() }
            }
        }
    }

    static func stop() {
        previewTimer?.invalidate()
        previewTimer = nil
        vibrateTimer?.invalidate()
        vibrateTimer = nil
        guard let p = player else { return }
        p.stop()
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    private static func url(of id: String) -> URL? {
        guard let t = all.first(where: { $0.id == id }) else { return nil }
        return Bundle.main.url(forResource: t.file, withExtension: "caf", subdirectory: "Sounds")
    }
}
