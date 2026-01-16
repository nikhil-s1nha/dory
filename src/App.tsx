/**
 * Root App Component
 * Sets up navigation, theme provider, and safe area handling
 */

import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider as PaperProvider} from 'react-native-paper';
import {Navigation} from '@navigation';

const App = (): React.JSX.Element => {
  return (
    <PaperProvider>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </PaperProvider>
  );
};

export default App;
