import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { saveConfig, AgentConfig } from "../store/config";

interface Props {
  onComplete: (config: AgentConfig) => void;
  initialSetupConfig?: Partial<AgentConfig> | null;
}

interface SetupQrScannerProps {
  onCancel: () => void;
  onScanned: (data: string) => boolean;
}

export function parseSetupUrl(url: string): Partial<AgentConfig> | null {
  try {
    const parsed = new URL(url.trim());
    const isSetupProtocol =
      parsed.protocol === "printagent:" ||
      parsed.protocol === "qrmenuprintagent:";
    if (!isSetupProtocol || parsed.hostname !== "setup") return null;
    const get = (key: string) => parsed.searchParams.get(key) ?? "";
    return {
      serverUrl: get("serverUrl"),
      agentToken: get("token"),
      printerIp: get("printerIp"),
      printerPort: parseInt(get("printerPort"), 10) || 9100,
      stationName: get("stationName") || "Kitchen",
    };
  } catch {
    return null;
  }
}

function SetupQrScanner({ onCancel, onScanned }: SetupQrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);

  useEffect(() => {
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    const accepted = onScanned(data);
    if (!accepted) {
      setTimeout(() => setScanLocked(false), 1600);
    }
  };

  if (!permission) {
    return (
      <View style={styles.scannerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.scannerHint}>Opening camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.scannerContainer}>
        <Text style={styles.scannerTitle}>Camera permission needed</Text>
        <Text style={styles.scannerHint}>
          Allow camera access to scan the print-agent setup QR code.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            void requestPermission();
          }}
        >
          <Text style={styles.buttonText}>Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Back to Manual Setup</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.scannerContainer}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
      />
      <View style={styles.scannerShade}>
        <View style={styles.scannerHeader}>
          <Text style={styles.scannerTitle}>Scan Setup QR</Text>
          <TouchableOpacity
            style={styles.scannerCloseButton}
            onPress={onCancel}
          >
            <Text style={styles.scannerCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <Text style={styles.scannerHint}>
          Point the camera at the setup QR from Print Stations.
        </Text>
      </View>
    </View>
  );
}

export default function SetupScreen({ onComplete, initialSetupConfig }: Props) {
  const [serverUrl, setServerUrl] = useState("https://");
  const [agentToken, setAgentToken] = useState("");
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState("9100");
  const [stationName, setStationName] = useState("Kitchen");
  const [scannerOpen, setScannerOpen] = useState(false);

  const applyConfig = (cfg: Partial<AgentConfig>) => {
    if (cfg.serverUrl) setServerUrl(cfg.serverUrl);
    if (cfg.agentToken) setAgentToken(cfg.agentToken);
    if (cfg.printerIp) setPrinterIp(cfg.printerIp);
    if (cfg.printerPort) setPrinterPort(String(cfg.printerPort));
    if (cfg.stationName) setStationName(cfg.stationName);
  };

  useEffect(() => {
    if (initialSetupConfig) {
      applyConfig(initialSetupConfig);
    }
  }, [initialSetupConfig]);

  useEffect(() => {
    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const cfg = parseSetupUrl(url);
      if (cfg) applyConfig(cfg);
    });

    // Handle deep link while app is already open
    const sub = Linking.addEventListener("url", ({ url }) => {
      const cfg = parseSetupUrl(url);
      if (cfg) {
        applyConfig(cfg);
        Alert.alert(
          "QR scanned",
          "All fields filled from QR code. Tap Save to continue.",
        );
      }
    });

    return () => sub.remove();
  }, []);

  const handleScannedSetup = (data: string): boolean => {
    const cfg = parseSetupUrl(data);
    if (!cfg) {
      Alert.alert(
        "Wrong QR code",
        "Scan the setup QR generated in Dashboard > Print Stations.",
      );
      return false;
    }

    applyConfig(cfg);
    setScannerOpen(false);
    Alert.alert(
      "QR scanned",
      "All fields filled from QR code. Tap Save to continue.",
    );
    return true;
  };

  const handleSave = async () => {
    if (!agentToken.trim() || !printerIp.trim()) {
      Alert.alert("Missing fields", "Agent token and printer IP are required.");
      return;
    }

    const performSave = async () => {
      const config: AgentConfig = {
        serverUrl: serverUrl.replace(/\/$/, ""),
        agentToken: agentToken.trim(),
        printerIp: printerIp.trim(),
        printerPort: parseInt(printerPort, 10) || 9100,
        stationName: stationName.trim() || "Kitchen",
      };
      await saveConfig(config);
      onComplete(config);
    };

    // M-8: warn when http:// is used on a non-local address (token sent unencrypted)
    const isLocalUrl =
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        serverUrl,
      );
    if (!serverUrl.startsWith("https://") && !isLocalUrl) {
      Alert.alert(
        "Security Warning",
        "Server URL uses http:// on a non-local address. Your agent token will be transmitted unencrypted. Use https:// in production.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue anyway",
            onPress: () => {
              void performSave();
            },
          },
        ],
      );
      return;
    }

    await performSave();
  };

  const fields = [
    {
      label: "Server URL",
      value: serverUrl,
      onChange: setServerUrl,
      placeholder: "https://your-app.run.app",
      keyboard: "url" as const,
    },
    {
      label: "Agent Token",
      value: agentToken,
      onChange: setAgentToken,
      placeholder: "cuid...",
      keyboard: "default" as const,
    },
    {
      label: "Printer IP",
      value: printerIp,
      onChange: setPrinterIp,
      placeholder: "192.168.1.50",
      keyboard: "numeric" as const,
    },
    {
      label: "Printer Port",
      value: printerPort,
      onChange: setPrinterPort,
      placeholder: "9100",
      keyboard: "numeric" as const,
    },
    {
      label: "Station Name",
      value: stationName,
      onChange: setStationName,
      placeholder: "Kitchen / Bar",
      keyboard: "default" as const,
    },
  ];

  if (scannerOpen) {
    return (
      <SetupQrScanner
        onCancel={() => setScannerOpen(false)}
        onScanned={handleScannedSetup}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Print Agent Setup</Text>
      <Text style={styles.subtitle}>
        Scan the QR code from the dashboard or enter the station details
        manually.
      </Text>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => setScannerOpen(true)}
      >
        <Text style={styles.scanButtonText}>Scan Setup QR</Text>
      </TouchableOpacity>

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
  container: {
    padding: 24,
    paddingBottom: 96,
    backgroundColor: "#0f0f23",
    minHeight: "100%",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#888", marginBottom: 20 },
  label: { fontSize: 13, color: "#aaa", marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: "#1e1e3a",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#333",
  },
  scanButton: {
    backgroundColor: "#14b8a6",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  scanButtonText: { color: "#061214", fontWeight: "800", fontSize: 16 },
  button: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 32,
    marginBottom: 24,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: { color: "#cbd5e1", fontWeight: "700", fontSize: 15 },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#050816",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scannerShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    paddingTop: 48,
    paddingBottom: 40,
    backgroundColor: "rgba(5, 8, 22, 0.22)",
  },
  scannerHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scannerTitle: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  scannerHint: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 290,
  },
  scannerCloseButton: {
    borderRadius: 8,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  scannerCloseText: { color: "#fff", fontWeight: "700" },
  scanFrame: {
    width: 240,
    height: 240,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 44,
    height: 44,
    borderColor: "#14b8a6",
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 5,
    borderRightWidth: 5,
  },
});
