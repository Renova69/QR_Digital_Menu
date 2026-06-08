import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import ForegroundService from '@supersami/rn-foreground-service';
import { AgentConfig, clearConfig } from '../store/config';
import { startSocketService, stopSocketService, StatusUpdate } from '../services/socket';

interface Props {
  config: AgentConfig;
  onReset: () => void;
}

interface LogEntry {
  id: number;
  ts: number;
  text: string;
}

export default function StatusScreen({ config, onReset }: Props) {
  const [statusUpdate, setStatusUpdate] = useState<StatusUpdate>({ status: 'connecting', message: 'Connecting…' });
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<LogEntry[]>([]);
  const logSeqRef = useRef(0);

  const addLog = (text: string) => {
    const entry: LogEntry = { id: logSeqRef.current++, ts: Date.now(), text };
    logRef.current = [entry, ...logRef.current].slice(0, 50);
    setLog([...logRef.current]);
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      ForegroundService.start({
        id: 1001,
        title: 'Print Agent',
        message: `Connected to ${config.stationName}`,
        icon: 'ic_launcher',
        importance: 'min',
      }).catch(() => {});
    }

    startSocketService(config, (update) => {
      setStatusUpdate(update);
      addLog(`[${update.status}] ${update.message}${update.hint ? ' — ' + update.hint : ''}`);
    });

    return () => {
      stopSocketService();
      if (Platform.OS === 'android') {
        ForegroundService.stop().catch(() => {});
      }
    };
  }, [config]);

  const handleReset = async () => {
    stopSocketService();
    if (Platform.OS === 'android') {
      await ForegroundService.stop().catch(() => {});
    }
    await clearConfig();
    onReset();
  };

  const { status, message, hint } = statusUpdate;
  const statusColor = {
    connected: '#22c55e',
    connecting: '#f59e0b',
    printing: '#6366f1',
    disconnected: '#f59e0b',
    error: '#ef4444',
  }[status] ?? '#888';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{config.stationName}</Text>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
      </View>

      <View style={styles.card}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={[styles.statusValue, { color: statusColor }]}>
          {message}
        </Text>
        {hint ? (
          <Text style={[styles.hint, status === 'error' ? styles.hintError : null]}>
            {hint}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.statusLabel}>Printer</Text>
        <Text style={styles.detailMono}>
          {config.printerIp}:{config.printerPort}
        </Text>
        <Text style={styles.statusLabel} numberOfLines={1}>
          {config.serverUrl}
        </Text>
      </View>

      <Text style={styles.logTitle}>Event Log</Text>
      <ScrollView style={styles.logBox}>
        {log.map((entry) => (
          <Text key={entry.id} style={styles.logLine}>
            {new Date(entry.ts).toLocaleTimeString()} {entry.text}
          </Text>
        ))}
        {log.length === 0 && (
          <Text style={styles.logLine}>Waiting for events…</Text>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <Text style={styles.resetText}>Reset & Reconfigure</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 20,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#fff' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  card: {
    backgroundColor: '#1e1e3a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
  },
  statusLabel: { fontSize: 11, color: '#666', marginBottom: 4 },
  statusValue: { fontSize: 24, fontWeight: '700' },
  hint: { fontSize: 13, color: '#aaa', marginTop: 6, lineHeight: 18 },
  hintError: { color: '#fca5a5' },
  detailMono: { fontSize: 14, color: '#e2e8f0', fontFamily: 'monospace' },
  logTitle: { fontSize: 12, color: '#666', marginBottom: 8, marginTop: 4 },
  logBox: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  logLine: {
    fontSize: 11,
    color: '#5eead4',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  resetButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  resetText: { color: '#ef4444', fontWeight: '600' },
});
