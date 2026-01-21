package com.encore.candleapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    
    // Create notification channels for Android 8.0+ (Oreo)
    createNotificationChannels()
  }
  
  private fun createNotificationChannels() {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      
      // Default channel
      val defaultChannel = android.app.NotificationChannel(
        "candle_default_channel",
        "Default Notifications",
        android.app.NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Default notifications for Candle"
      }
      
      // Messages channel
      val messagesChannel = android.app.NotificationChannel(
        "candle_messages",
        "Messages",
        android.app.NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Notifications for new messages"
        enableVibration(true)
      }
      
      // Streaks channel
      val streaksChannel = android.app.NotificationChannel(
        "candle_streaks",
        "Streak Reminders",
        android.app.NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Notifications for streak reminders"
        enableVibration(true)
      }
      
      // Daily prompts channel
      val dailyPromptsChannel = android.app.NotificationChannel(
        "candle_daily_prompts",
        "Daily Question Reminders",
        android.app.NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Notifications for daily question reminders"
      }
      
      // Photos channel
      val photosChannel = android.app.NotificationChannel(
        "candle_photos",
        "Photo Notifications",
        android.app.NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Notifications when partner shares photos"
      }
      
      // Games channel
      val gamesChannel = android.app.NotificationChannel(
        "candle_games",
        "Game Challenges",
        android.app.NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Notifications for game challenges"
      }
      
      notificationManager.createNotificationChannels(
        listOf(
          defaultChannel,
          messagesChannel,
          streaksChannel,
          dailyPromptsChannel,
          photosChannel,
          gamesChannel
        )
      )
    }
  }
}
