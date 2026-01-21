#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetDataBridge, NSObject)

RCT_EXTERN_METHOD(updateCanvasWidget:(NSString *)imageBase64 partnershipId:(NSString *)partnershipId)
RCT_EXTERN_METHOD(updateCountdownWidget:(NSString *)countdownsJSON)
RCT_EXTERN_METHOD(updateDailyPhotoWidget:(NSString *)photoURL promptText:(NSString *)promptText partnerName:(NSString *)partnerName)
RCT_EXTERN_METHOD(reloadAllWidgets)

@end
