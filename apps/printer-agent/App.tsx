import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, ActivityIndicator, View, Linking } from 'react-native';
import { AgentConfig, loadConfig } from './src/store/config';
import SetupScreen, { parseSetupUrl } from './src/screens/SetupScreen';
import StatusScreen from './src/screens/StatusScreen';

export default function App() {
  const [config, setConfig] = useState<AgentConfig | null | undefined>(
    undefined,
  );
  const [setupConfig, setSetupConfig] = useState<Partial<AgentConfig> | null>(null);

  useEffect(() => {
    let mounted = true;

    const applySetupUrl = (url: string | null): boolean => {
      if (!url) return false;
      const parsedConfig = parseSetupUrl(url);
      if (!parsedConfig) return false;
      setSetupConfig(parsedConfig);
      setConfig(null);
      return true;
    };

    void (async () => {
      const [storedConfig, initialUrl] = await Promise.all([
        loadConfig(),
        Linking.getInitialURL(),
      ]);
      if (!mounted) return;
      if (!applySetupUrl(initialUrl)) {
        setConfig(storedConfig);
      }
    })();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      applySetupUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  if (config === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f23" />
      {config === null ? (
        <SetupScreen
          onComplete={(nextConfig) => {
            setSetupConfig(null);
            setConfig(nextConfig);
          }}
          initialSetupConfig={setupConfig}
        />
      ) : (
        <StatusScreen
          config={config}
          onReset={() => {
            setSetupConfig(null);
            setConfig(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f23' },
});
