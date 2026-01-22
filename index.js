/**
 * @format
 */

import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
// ARCHIVED: Push notification imports - uncomment to re-enable
// import messaging from '@react-native-firebase/messaging';
import App from './src/App';
import {name as appName} from './app.json';

// ARCHIVED: Push notifications disabled
// Background message handler
// messaging().setBackgroundMessageHandler(async remoteMessage => {
//   console.log('Message handled in background:', remoteMessage);
//   // Process notification data
//   // Update badge count, local storage, etc.
// });

AppRegistry.registerComponent(appName, () => App);
