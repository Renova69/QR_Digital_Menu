import { NativeModules } from 'react-native';

const { WakeLockModule } = NativeModules;

export function acquireWakeLock(): void {
  WakeLockModule?.acquire();
}

export function releaseWakeLock(): void {
  WakeLockModule?.release();
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean | null> {
  if (!WakeLockModule?.isIgnoringBatteryOptimizations) return null;
  return WakeLockModule.isIgnoringBatteryOptimizations();
}

export function requestBatteryOptimizationExemption(): void {
  WakeLockModule?.requestBatteryOptimizationExemption();
}
