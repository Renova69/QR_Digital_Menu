import { registerRootComponent } from 'expo';
import ForegroundService from '@supersami/rn-foreground-service';

import App from './App';

// Register the Android headless task handler before the root component.
// Without this, ForegroundService.start() silently fails on some Android
// versions because the native task is never wired to AppRegistry.
ForegroundService.register({
  config: {
    alert: false,
    onServiceErrorCallBack: () => {},
  },
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
