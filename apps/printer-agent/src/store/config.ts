import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AgentConfig {
  serverUrl: string;
  agentToken: string;
  printerIp: string;
  printerPort: number;
  stationName: string;
}

const KEY = "agent_config_v1";

export async function loadConfig(): Promise<AgentConfig | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
