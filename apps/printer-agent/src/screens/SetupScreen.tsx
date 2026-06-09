import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { saveConfig, AgentConfig } from '../store/config';

interface Props {
  onComplete: (config: AgentConfig) => void;
}

function parseSetupUrl(url: string): Partial<AgentConfig> | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'printagent:' || parsed.hostname !== 'setup') return null;
    const get = (key: string) => parsed.searchParams.get(key) ?? '';
    return {
      serverUrl: get('serverUrl'),
      agentToken: get('token'),
      printerIp: get('printerIp'),
      printerPort: parseInt(get('printerPort'), 10) || 9100,
      stationName: get('stationName') || 'Kitchen',
    };
  } catch {
    return null;
  }
}

export default function SetupScreen({ onComplete }: Props) {
  const [serverUrl, setServerUrl] = useState('https://');
  const [agentToken, setAgentToken] = useState('');
  const [printerIp, setPrinterIp] = useState('');
  const [printerPort, setPrinterPort] = useState('9100');
  const [stationName, setStationName] = useState('Kitchen');

  const applyConfig = (cfg: Partial<AgentConfig>) => {
    if (cfg.serverUrl) setServerUrl(cfg.serverUrl);
    if (cfg.agentToken) setAgentToken(cfg.agentToken);
    if (cfg.printerIp) setPrinterIp(cfg.printerIp);
    if (cfg.printerPort) setPrinterPort(String(cfg.printerPort));
    if (cfg.stationName) setStationName(cfg.stationName);
  };

  useEffect(() => {
    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const cfg = parseSetupUrl(url);
      if (cfg) applyConfig(cfg);
    });

    // Handle deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => {
      const cfg = parseSetupUrl(url);
      if (cfg) {
        applyConfig(cfg);
        Alert.alert('QR scanned', 'All fields filled from QR code. Tap Save to continue.');
      }
    });

    return () => sub.remove();
  }, []);

  const handleSave = async () => {
    if (!agentToken.trim() || !printerIp.trim()) {
      Alert.alert('Missing fields', 'Agent token and printer IP are required.');
      return;
    }

    const performSave = async () => {
      const config: AgentConfig = {
        serverUrl: serverUrl.replace(/\/$/, ''),
        agentToken: agentToken.trim(),
        printerIp: printerIp.trim(),
        printerPort: parseInt(printerPort, 10) || 9100,
        stationName: stationName.trim() || 'Kitchen',
      };
      await saveConfig(config);
      onComplete(config);
    };

    // M-8: warn when http:// is used on a non-local address (token sent unencrypted)
    const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(serverUrl);
    if (!serverUrl.startsWith('https://') && !isLocalUrl) {
      Alert.alert(
        'Security Warning',
        'Server URL uses http:// on a non-local address. Your agent token will be transmitted unencrypted. Use https:// in production.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue anyway', onPress: () => { void performSave(); } },
        ],
      );
      return;
    }

    await performSave();
  };

  const fields = [
    { label: 'Server URL', value: serverUrl, onChange: setServerUrl, placeholder: 'https://your-app.run.app', keyboard: 'url' as const },
    { label: 'Agent Token', value: agentToken, onChange: setAgentToken, placeholder: 'cuid...', keyboard: 'default' as const },
    { label: 'Printer IP', value: printerIp, onChange: setPrinterIp, placeholder: '192.168.1.50', keyboard: 'numeric' as const },
    { label: 'Printer Port', value: printerPort, onChange: setPrinterPort, placeholder: '9100', keyboard: 'numeric' as const },
    { label: 'Station Name', value: stationName, onChange: setStationName, placeholder: 'Kitchen / Bar', keyboard: 'default' as const },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Print Agent Setup</Text>
      <Text style={styles.subtitle}>
        Scan the QR code from the dashboard with your phone camera — it will open this app and fill all fields automatically.
      </Text>

      {fields.map(({ label, value, onChange, placeholder, keyboard }) => (
        <View key={label}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType={keyboard}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save & Start Agent</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#0f0f23', minHeight: '100%' },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 32 },
  label: { fontSize: 13, color: '#aaa', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#1e1e3a',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
