import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import ForegroundService from '@supersami/rn-foreground-service';
import { AgentConfig, clearConfig } from '../store/config';
import { startSocketService, stopSocketService, StatusUpdate } from '../services/socket';
import { isIgnoringBatteryOptimizations, requestBatteryOptimizationExemption } from '../services/wakeLock';

interface Props {
  config: AgentConfig;
  onReset: () => void;
}

interface LogEntry {
  id: number;
  ts: number;
  text: string;
}

function getAndroidApiVersion() {
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
}

async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android' || getAndroidApiVersion() < 33) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'unknown Android service error';
}

export default function StatusScreen({ config, onReset }: Props) {
  const [statusUpdate, setStatusUpdate] = useState<StatusUpdate>({ status: 'connecting', message: 'Connecting…' });
  const [log, setLog] = useState<LogEntry[]>([]);
  const logRef = useRef<LogEntry[]>([]);
  const logSeqRef = useRef(0);
  const [batteryOptDisabled, setBatteryOptDisabled] = useState<boolean | null>(null);

  const addLog = (text: string) => {
    const entry: LogEntry = { id: logSeqRef.current++, ts: Date.now(), text };
    logRef.current = [entry, ...logRef.current].slice(0, 50);
    setLog([...logRef.current]);
  };

  useEffect(() => {
    isIgnoringBatteryOptimizations()
      .then(setBatteryOptDisabled)
      .catch(() => setBatteryOptDisabled(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startForegroundService = async () => {
      if (Platform.OS !== 'android') {
        return;
      }

      const androidApi = getAndroidApiVersion();
      const foregroundServiceType = androidApi >= 34 ? 'specialUse' : 'dataSync';
      const notificationPermissionGranted = await requestAndroidNotificationPermission();
      if (cancelled) {
        return;
      }

      if (!notificationPermissionGranted) {
        addLog('[warning] Notification permission was not granted. Android may limit background printing.');
      }

      const notificationConfig = {
        id: 1001,
        title: 'Print Agent',
        message: `Connected to ${config.stationName}`,
        ServiceType: foregroundServiceType,
        icon: 'ic_notification',
        largeIcon: 'ic_launcher',
        importance: 'low',
        visibility: 'public',
        ongoing: true,
      };

      try {
        await ForegroundService.start(notificationConfig);
      } catch (error) {
        addLog(`[warning] Foreground service failed: ${getErrorMessage(error)}`);
      }
    };

    void startForegroundService();

    startSocketService(config, (update) => {
      setStatusUpdate(update);
      addLog(`[${update.status}] ${update.message}${update.hint ? ' — ' + update.hint : ''}`);
    });

    return () => {
      cancelled = true;
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

      {batteryOptDisabled === false && (
        <TouchableOpacity
          style={styles.batteryWarning}
          onPress={() => {
            requestBatteryOptimizationExemption();
            // Recheck after a delay (user may have granted it)
            setTimeout(() => {
              isIgnoringBatteryOptimizations()
                .then(setBatteryOptDisabled)
                .catch(() => setBatteryOptDisabled(null));
            }, 3000);
          }}
        >
          <Text style={styles.batteryWarningTitle}>Battery exemption not confirmed</Text>
          <Text style={styles.batteryWarningText}>
            Android has not confirmed this app is exempt from Doze battery optimization.{' '}
            Tap here to request the exemption.
          </Text>
        </TouchableOpacity>
      )}

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
  batteryWarning: {
    backgroundColor: '#422006',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f59e0b',
    padding: 14,
    marginBottom: 14,
  },
  batteryWarningTitle: {
    color: '#fbbf24',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  batteryWarningText: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 18,
  },
});
