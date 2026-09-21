import Foundation
import UserNotifications

@MainActor
final class HubNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    var onOpenNavigation: ((UUID, String) -> Void)?

    func requestAuthorizationIfNeeded() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let serverRaw = info["serverID"] as? String,
              let serverID = UUID(uuidString: serverRaw),
              let path = info["path"] as? String
        else { return }
        onOpenNavigation?(serverID, path)
    }
}
