import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { AgentConfig, loadConfig } from './src/store/config';
import SetupScreen from './src/screens/SetupScreen';
import StatusScreen from './src/screens/StatusScreen';

export default function App() {
  const [config, setConfig] = useState<AgentConfig | null | undefined>(
    undefined,
  );

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  if (config === undefined) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f23" />
      {config === null ? (
        <SetupScreen onComplete={setConfig} />
      ) : (
        <StatusScreen config={config} onReset={() => setConfig(null)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f23' },
});
