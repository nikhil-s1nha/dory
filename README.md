# Candle

A React Native app for couples to connect, play games, share date ideas, and create memories together.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Xcode** (v14.0 or higher) for iOS development
- **Android Studio** (latest version) for Android development
- **CocoaPods** for iOS dependencies (`sudo gem install cocoapods`)

## Getting Started

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd dory
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install iOS dependencies:
   ```bash
   cd ios
   pod install
   cd ..
   ```

### iOS Build Configuration (M1/M2 Macs)

If you're using an Apple Silicon (M1/M2) Mac, you need to configure Xcode build settings to exclude arm64 architecture for the iOS Simulator. This prevents architecture conflicts with React Native.

**Quick Setup:**
1. Open `ios/Candle.xcworkspace` in Xcode
2. For each target (Candle + 3 widgets), set Build Settings → Excluded Architectures → Any iOS Simulator SDK to `arm64`
3. See [XCODE_BUILD_SETTINGS.md](./XCODE_BUILD_SETTINGS.md) for detailed step-by-step instructions

**Verification:**
```bash
npm run verify:ios
```

This is a one-time setup required after cloning the repository.

### Personal Team Configuration

This project is configured for **Personal Teams** (free Apple Developer accounts). The following features have been disabled as they require a paid Apple Developer account:

- **Push Notifications** - Disabled (code archived, can be re-enabled with paid account)
- **App Groups** - Removed (widgets cannot share data with main app)

**Note:** Widgets will still build and run, but they won't receive data from the main app without App Groups. To enable full widget functionality, you'll need a paid Apple Developer account ($99/year) and can then add the App Groups capability in Xcode.

See [IOS_BUILD_FIXES.md](./IOS_BUILD_FIXES.md) for more details.

### Running the App

#### iOS

```bash
npm run ios
```

Or open `ios/Candle.xcworkspace` in Xcode and run from there.

**Note for M1/M2 Macs:** First-time setup requires Xcode build settings configuration. See [XCODE_BUILD_SETTINGS.md](./XCODE_BUILD_SETTINGS.md).

**Requirements:**
- iOS 15.1 or higher
- Xcode 14.0 or higher

#### Android

```bash
npm run android
```

**Requirements:**
- Android API 24 (Android 7.0) or higher
- Android Studio with Android SDK installed

### Development

- **Start Metro bundler:** `npm start`
- **Run iOS:** `npm run ios`
- **Run Android:** `npm run android`
- **Lint code:** `npm run lint`
- **Format code:** `npm run format`

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Shared components (buttons, inputs, cards)
│   └── index.ts        # Barrel exports
├── screens/            # Screen components
│   ├── auth/          # Authentication screens
│   ├── games/         # Game screens
│   └── index.ts
├── services/           # Business logic and API services
│   └── index.ts
├── utils/              # Helper functions and utilities
│   ├── constants.ts   # App-wide constants
│   ├── types.ts       # TypeScript type definitions
│   └── index.ts
├── assets/             # Static assets
│   ├── images/        # Image files
│   ├── fonts/         # Custom fonts
│   └── icons/         # Icon files
├── navigation/         # Navigation configuration
│   └── index.tsx
├── store/              # State management (Zustand)
│   ├── authSlice.ts
│   ├── partnershipSlice.ts
│   ├── appSlice.ts
│   └── index.ts
├── theme/              # Design system
│   ├── colors.ts      # Color palette
│   ├── typography.ts  # Font styles
│   ├── spacing.ts     # Spacing system
│   └── index.ts
└── App.tsx             # Root component
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```
API_BASE_URL=your_api_url_here
ENVIRONMENT=development
```

See `.env.example` for reference.

### Bundle Identifiers

- **iOS:** `com.nikhilsinha.candleapp`
- **Android:** `com.nikhilsinha.candleapp`

## Architecture

- **Framework:** React Native 0.76+
- **Language:** TypeScript
- **Navigation:** React Navigation (Stack + Bottom Tabs)
- **State Management:** Zustand
- **Styling:** React Native StyleSheet with theme system

## Features

- ✅ Bottom tab navigation (Connect, Games, Date Ideas, Photos, Profile)
- ✅ TypeScript support with path aliases
- ✅ Theme system (colors, typography, spacing)
- ✅ State management with Zustand and AsyncStorage persistence
- ✅ ESLint and Prettier configuration
- ✅ iOS 15.1+ support
- ✅ Android API 24+ support

## Troubleshooting

### iOS Issues

**Architecture errors on M1/M2 Mac:**
See [XCODE_BUILD_SETTINGS.md](./XCODE_BUILD_SETTINGS.md) for configuring Excluded Architectures.

**Pod install fails:**
```bash
cd ios
pod deintegrate
pod repo update
pod install
cd ..
```

**Build fails with module errors:**
- Ensure `use_modular_headers!` is commented out in `ios/Podfile`
- See [IOS_BUILD_FIXES.md](./IOS_BUILD_FIXES.md) for complete troubleshooting
- Clean build: Product → Clean Build Folder in Xcode
- Delete DerivedData: `rm -rf ~/Library/Developer/Xcode/DerivedData`

### Android Issues

**Build fails:**
- Clean project: `cd android && ./gradlew clean && cd ..`
- Invalidate caches in Android Studio (File → Invalidate Caches)
- Ensure Android SDK is properly configured

**Metro bundler issues:**
```bash
npm start --reset-cache
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to this project.

## License

[Add your license here]
