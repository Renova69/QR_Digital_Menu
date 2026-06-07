import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { saveConfig, AgentConfig } from '../store/config';

interface Props {
  onComplete: (config: AgentConfig) => void;
}

export default function SetupScreen({ onComplete }: Props) {
  const [serverUrl, setServerUrl] = useState('https://');
  const [agentToken, setAgentToken] = useState('');
  const [printerIp, setPrinterIp] = useState('');
  const [printerPort, setPrinterPort] = useState('9100');
  const [stationName, setStationName] = useState('Kitchen');

  const handleSave = async () => {
    if (!agentToken.trim() || !printerIp.trim()) {
      Alert.alert('Missing fields', 'Agent token and printer IP are required.');
      return;
    }
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

  const fields = [
    { label: 'Server URL', value: serverUrl, onChange: setServerUrl, placeholder: 'https://your-app.run.app', keyboard: 'url' as const },
    { label: 'Agent Token (paste from dashboard)', value: agentToken, onChange: setAgentToken, placeholder: 'cuid...', keyboard: 'default' as const },
    { label: 'Printer IP', value: printerIp, onChange: setPrinterIp, placeholder: '192.168.1.50', keyboard: 'numeric' as const },
    { label: 'Printer Port', value: printerPort, onChange: setPrinterPort, placeholder: '9100', keyboard: 'numeric' as const },
    { label: 'Station Name', value: stationName, onChange: setStationName, placeholder: 'Kitchen / Bar', keyboard: 'default' as const },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Print Agent Setup</Text>
      <Text style={styles.subtitle}>Configure once — runs silently in background 24/7</Text>

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
