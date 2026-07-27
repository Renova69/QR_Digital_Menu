import { NativeModules } from "react-native";

const nativeModules = NativeModules as Record<string, unknown>;
const originalWakeLockModule = nativeModules.WakeLockModule;
const mockWakeLockModule: {
  acquire: jest.Mock;
  release: jest.Mock;
  isIgnoringBatteryOptimizations?: jest.Mock<Promise<boolean>, []>;
  requestBatteryOptimizationExemption: jest.Mock;
} = {
  acquire: jest.fn(),
  release: jest.fn(),
  isIgnoringBatteryOptimizations: jest.fn(),
  requestBatteryOptimizationExemption: jest.fn(),
};

nativeModules.WakeLockModule = mockWakeLockModule;
const {
  acquireWakeLock,
  isIgnoringBatteryOptimizations,
  releaseWakeLock,
  requestBatteryOptimizationExemption,
} = require("./wakeLock") as typeof import("./wakeLock");

describe("wakeLock native boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWakeLockModule.isIgnoringBatteryOptimizations = jest
      .fn<Promise<boolean>, []>()
      .mockResolvedValue(true);
  });

  afterAll(() => {
    nativeModules.WakeLockModule = originalWakeLockModule;
  });

  it("delegates lock lifecycle operations to the native module", () => {
    acquireWakeLock();
    releaseWakeLock();
    requestBatteryOptimizationExemption();

    expect(mockWakeLockModule.acquire).toHaveBeenCalledTimes(1);
    expect(mockWakeLockModule.release).toHaveBeenCalledTimes(1);
    expect(
      mockWakeLockModule.requestBatteryOptimizationExemption,
    ).toHaveBeenCalledTimes(1);
  });

  it("returns the native battery optimization state", async () => {
    await expect(isIgnoringBatteryOptimizations()).resolves.toBe(true);
  });

  it("returns null when the native battery optimization API is unavailable", async () => {
    delete mockWakeLockModule.isIgnoringBatteryOptimizations;

    await expect(isIgnoringBatteryOptimizations()).resolves.toBeNull();
  });
});
