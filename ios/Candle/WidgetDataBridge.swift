import Foundation
import WidgetKit

@objc(WidgetDataBridge)
class WidgetDataBridge: NSObject {
    
    // NOTE: App Groups removed for Personal Team compatibility
    // Widgets will not be able to share data with the main app without App Groups
    // This requires a paid Apple Developer account to enable App Groups capability
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc func updateCanvasWidget(_ imageBase64: String, partnershipId: String) {
        // ARCHIVED: App Groups removed - using standard UserDefaults (won't share with widgets)
        // For Personal Teams, widgets cannot share data with the main app
        // To re-enable: Add App Groups capability in Xcode and use:
        // let sharedDefaults = UserDefaults(suiteName: "group.com.nikhilsinha.candleapp.widgets")
        let standardDefaults = UserDefaults.standard
        standardDefaults.set(imageBase64, forKey: "canvasImageData")
        standardDefaults.set(partnershipId, forKey: "partnershipId")
        standardDefaults.synchronize()
        
        WidgetCenter.shared.reloadTimelines(ofKind: "CandleCanvasWidget")
    }
    
    @objc func updateCountdownWidget(_ countdownsJSON: String) {
        // ARCHIVED: App Groups removed - using standard UserDefaults (won't share with widgets)
        let standardDefaults = UserDefaults.standard
        standardDefaults.set(countdownsJSON, forKey: "countdowns")
        standardDefaults.synchronize()
        
        WidgetCenter.shared.reloadTimelines(ofKind: "CandleCountdownWidget")
    }
    
    @objc func updateDailyPhotoWidget(_ photoURL: String, promptText: String, partnerName: String) {
        // ARCHIVED: App Groups removed - using standard UserDefaults (won't share with widgets)
        let standardDefaults = UserDefaults.standard
        standardDefaults.set(photoURL, forKey: "partnerPhotoURL")
        standardDefaults.set(promptText, forKey: "dailyPhotoPrompt")
        standardDefaults.set(partnerName, forKey: "partnerName")
        standardDefaults.synchronize()
        
        WidgetCenter.shared.reloadTimelines(ofKind: "CandleDailyPhotoWidget")
    }
    
    @objc func reloadAllWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
