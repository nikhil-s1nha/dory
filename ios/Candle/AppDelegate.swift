import UIKit
import React
import React_RCTAppDelegate
// ARCHIVED: Push notification imports - uncomment to re-enable
// import FirebaseCore
// import FirebaseMessaging
// import UserNotifications

// ARCHIVED: Push notifications disabled - removed UNUserNotificationCenterDelegate
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  var rootViewFactory: RCTRootViewFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // React Native Firebase auto-initializes from GoogleService-Info.plist
    // No manual FirebaseApp.configure() needed
    
    // ARCHIVED: Push notifications disabled
    // Set up notification delegate
    // UNUserNotificationCenter.current().delegate = self
    
    // Set FCM messaging delegate
    // Messaging.messaging().delegate = self
    
    // Create bundle URL block
    let bundleURLBlock: RCTBundleURLBlock = {
#if DEBUG
      return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
      return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
    }
    
    // Create root view factory configuration
    let configuration = RCTRootViewFactoryConfiguration(
      bundleURLBlock: bundleURLBlock,
      newArchEnabled: false,
      turboModuleEnabled: false,
      bridgelessEnabled: false
    )
    
    // Create root view factory
    rootViewFactory = RCTRootViewFactory(configuration: configuration)

    window = UIWindow(frame: UIScreen.main.bounds)
    
    // Create root view
    guard let rootViewFactory = rootViewFactory else {
      return false
    }
    
    // Convert launchOptions to NSDictionary format
    var launchOptionsDict: [String: Any]? = nil
    if let launchOptions = launchOptions {
      launchOptionsDict = launchOptions.reduce(into: [String: Any]()) { dict, pair in
        dict[pair.key.rawValue] = pair.value
      }
    }
    
    let rootView = rootViewFactory.view(
      withModuleName: "Candle",
      initialProperties: nil,
      launchOptions: launchOptionsDict
    )
    
    // Create root view controller
    let rootViewController = UIViewController()
    rootViewController.view = rootView
    
    window?.rootViewController = rootViewController
    window?.makeKeyAndVisible()

    return true
  }

  // ARCHIVED: Push notifications disabled
  // Handle device token registration
  // func application(
  //   _ application: UIApplication,
  //   didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  // ) {
  //   Messaging.messaging().apnsToken = deviceToken
  // }

  // Handle registration failure
  // func application(
  //   _ application: UIApplication,
  //   didFailToRegisterForRemoteNotificationsWithError error: Error
  // ) {
  //   print("Failed to register for remote notifications: \(error)")
  // }

  // Handle foreground notifications
  // func userNotificationCenter(
  //   _ center: UNUserNotificationCenter,
  //   willPresent notification: UNNotification,
  //   withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  // ) {
  //   // Show notification even when app is in foreground
  //   completionHandler([.alert, .badge, .sound])
  // }

  // Handle notification taps
  // func userNotificationCenter(
  //   _ center: UNUserNotificationCenter,
  //   didReceive response: UNNotificationResponse,
  //   withCompletionHandler completionHandler: @escaping () -> Void
  // ) {
  //   completionHandler()
  // }
}

// ARCHIVED: Push notifications disabled
// FCM Messaging Delegate
// extension AppDelegate: MessagingDelegate {
//   func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
//     print("FCM registration token: \(fcmToken ?? "nil")")
//     // Token is automatically handled by React Native Firebase
//   }
// }
