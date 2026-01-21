import Foundation
import WidgetKit

@objc(WidgetDataBridge)
class WidgetDataBridge: NSObject {
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc func updateCanvasWidget(_ imageBase64: String, partnershipId: String) {
        let sharedDefaults = UserDefaults(suiteName: "group.com.encore.candleapp.widgets")
        sharedDefaults?.set(imageBase64, forKey: "canvasImageData")
        sharedDefaults?.set(partnershipId, forKey: "partnershipId")
        sharedDefaults?.synchronize()
        
        WidgetCenter.shared.reloadTimelines(ofKind: "CandleCanvasWidget")
    }
    
    @objc func updateCountdownWidget(_ countdownsJSON: String) {
        let sharedDefaults = UserDefaults(suiteName: "group.com.encore.candleapp.widgets")
        sharedDefaults?.set(countdownsJSON, forKey: "countdowns")
        sharedDefaults?.synchronize()
        
        WidgetCenter.shared.reloadTimelines(ofKind: "CandleCountdownWidget")
    }
    
    @objc func updateDailyPhotoWidget(_ photoURL: String, promptText: String, partnerName: String) {
        let sharedDefaults = UserDefaults(suiteName: "group.com.encore.candleapp.widgets")
        sharedDefaults?.set(photoURL, forKey: "partnerPhotoURL")
        sharedDefaults?.set(promptText, forKey: "dailyPhotoPrompt")
        sharedDefaults?.set(partnerName, forKey: "partnerName")
        sharedDefaults?.synchronize()
        
        WidgetCenter.shared.reloadTimelines(ofKind: "CandleDailyPhotoWidget")
    }
    
    @objc func reloadAllWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
