import UIKit

/** Taptic Engine feedback for the page ("haptic" command): tab switches, confirmations, errors. */
enum Haptics {
    private static let selection = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    static func play(_ kind: String) {
        DispatchQueue.main.async {
            switch kind {
            case "selection": selection.selectionChanged()
            case "success": notification.notificationOccurred(.success)
            case "warning": notification.notificationOccurred(.warning)
            case "error": notification.notificationOccurred(.error)
            case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }
}
