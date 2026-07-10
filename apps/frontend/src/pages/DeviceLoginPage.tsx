import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { getDeviceEnrollmentStatus } from "../lib/api";
import { useTranslation } from "react-i18next";

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;

const ROLE_REDIRECT: Record<string, string> = {
  WAITER: "/staff/pos",
  KITCHEN: "/staff/kitchen",
};

type SharedDeviceConfig = {
  restaurantId?: string;
  restaurantName?: string;
  deviceToken?: string;
};

function readSharedDeviceConfig(): SharedDeviceConfig | null {
  try {
    const raw = localStorage.getItem("sharedDevice");
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem("sharedDevice");
    return null;
  }
}

function getApiMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(" ");
  if (typeof message === "string") return message;
  if (typeof error?.message === "string") return error.message;
  return "";
}

function isSharedDeviceDisabledError(error: any) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  const message = getApiMessage(error).toLowerCase();
  return (
    status === 403 &&
    (code === "SHARED_DEVICE_MODE_DISABLED" ||
      message.includes("shared device mode"))
  );
}

function isDeviceBondInvalidError(error: any) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  const message = getApiMessage(error).toLowerCase();
  return (
    code === "DEVICE_REVOKED" ||
    message.includes("device is not enrolled") ||
    message.includes("device enrollment link has been revoked") ||
    (status === 401 && message.includes("device"))
  );
}

export default function DeviceLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginWithToken, logout } = useAuth();
  const clearedExistingSession = useRef(false);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isCheckingDeviceStatus, setIsCheckingDeviceStatus] = useState(false);
  const [sharedDeviceModeDisabled, setSharedDeviceModeDisabled] =
    useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [deviceConfig, setDeviceConfig] = useState<SharedDeviceConfig | null>(
    () => readSharedDeviceConfig(),
  );

  const clearDeviceConfig = useCallback(() => {
    localStorage.removeItem("sharedDevice");
    setDeviceConfig(null);
    setRestaurantName("");
  }, []);

  const refreshDeviceStatus = useCallback(async () => {
    if (!deviceConfig?.deviceToken) {
      setSharedDeviceModeDisabled(false);
      return;
    }

    setIsCheckingDeviceStatus(true);
    try {
      const status = await getDeviceEnrollmentStatus(deviceConfig.deviceToken);
      if (
        status.restaurantId &&
        deviceConfig.restaurantId &&
        status.restaurantId !== deviceConfig.restaurantId
      ) {
        clearDeviceConfig();
        setError(
          t(
            "auto.deviceNotLinked",
            "This device is not linked to this restaurant anymore.",
          ),
        );
        return;
      }

      setRestaurantName(
        status.restaurantName || deviceConfig.restaurantName || "",
      );
      setSharedDeviceModeDisabled(status.sharedDeviceModeEnabled === false);
      if (status.sharedDeviceModeEnabled) {
        setError("");
      }
    } catch (err: any) {
      if (isSharedDeviceDisabledError(err)) {
        setSharedDeviceModeDisabled(true);
        setError("");
        return;
      }
      if (isDeviceBondInvalidError(err)) {
        clearDeviceConfig();
        setError(getApiMessage(err));
      }
    } finally {
      setIsCheckingDeviceStatus(false);
    }
  }, [clearDeviceConfig, deviceConfig, t]);

  useEffect(() => {
    if (clearedExistingSession.current) return;
    clearedExistingSession.current = true;
    logout().finally(() => setIsPreparing(false));
  }, [logout]);

  useEffect(() => {
    if (deviceConfig?.restaurantName) {
      setRestaurantName(deviceConfig.restaurantName);
    }
  }, [deviceConfig]);

  useEffect(() => {
    if (!deviceConfig?.deviceToken) {
      setSharedDeviceModeDisabled(false);
      return;
    }

    void refreshDeviceStatus();
    const interval = setInterval(
      // Skip the poll while the tab is backgrounded — saves battery/network on
      // an always-on POS tablet (L3). refreshDeviceStatus runs again on resume.
      () => {
        if (!document.hidden) void refreshDeviceStatus();
      },
      sharedDeviceModeDisabled ? 5000 : 30000,
    );
    const onVisible = () => {
      if (!document.hidden) void refreshDeviceStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [
    deviceConfig?.deviceToken,
    refreshDeviceStatus,
    sharedDeviceModeDisabled,
  ]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "sharedDevice") return;
      const nextConfig = readSharedDeviceConfig();
      setDeviceConfig(nextConfig);
      setRestaurantName(nextConfig?.restaurantName || "");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setAttemptsLeft(MAX_ATTEMPTS);
        setError("");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const submitPin = useCallback(
    async (pinCode: string) => {
      if (!deviceConfig?.restaurantId || !deviceConfig?.deviceToken) return;
      if (sharedDeviceModeDisabled) return;
      setIsSubmitting(true);
      setError("");

      try {
        const res = await api.post("/auth/pin-login", {
          restaurantId: deviceConfig.restaurantId,
          deviceToken: deviceConfig.deviceToken,
          pin: pinCode,
        });
        const user = res.data.user;
        const role = user?.role?.toUpperCase();
        // pin-login sets the httpOnly cookie server-side (#F1) — no token to carry.
        loginWithToken(user);
        const target = ROLE_REDIRECT[role] || "/dashboard";
        navigate(target, { replace: true });
      } catch (err: any) {
        const responseData = err.response?.data;
        const msg = getApiMessage(err) || t("auto.invalidPin", "Invalid PIN");
        if (isSharedDeviceDisabledError(err)) {
          setSharedDeviceModeDisabled(true);
          setError(msg);
          setPin("");
          return;
        }
        if (isDeviceBondInvalidError(err)) {
          clearDeviceConfig();
          setError(msg);
          setPin("");
          return;
        }

        setError(msg);

        if (typeof responseData?.attemptsRemaining === "number") {
          setAttemptsLeft(responseData.attemptsRemaining);
        } else {
          const match = msg.match(/(\d+)\s+attempts?\s+remaining/i);
          if (match) {
            setAttemptsLeft(parseInt(match[1], 10));
          } else {
            setAttemptsLeft((prev) => Math.max(0, prev - 1));
          }
        }

        if (responseData?.lockedUntil) {
          const lockoutTime = new Date(responseData.lockedUntil).getTime();
          if (!Number.isNaN(lockoutTime)) {
            setLockedUntil(lockoutTime);
          }
        } else {
          const lockoutMatch = msg.match(/try again in (\d+)\s+minutes/i);
          if (lockoutMatch) {
            const minutes = parseInt(lockoutMatch[1], 10);
            setLockedUntil(Date.now() + minutes * 60 * 1000);
          }
        }

        setPin("");
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      clearDeviceConfig,
      deviceConfig,
      loginWithToken,
      navigate,
      sharedDeviceModeDisabled,
      t,
    ],
  );

  const handleKeyPress = useCallback(
    (digit: string) => {
      if (
        isPreparing ||
        isSubmitting ||
        lockedUntil ||
        sharedDeviceModeDisabled
      )
        return;
      setError("");

      if (digit === "backspace") {
        setPin((prev) => prev.slice(0, -1));
        return;
      }

      const newPin = pin + digit;
      setPin(newPin);

      if (newPin.length === PIN_LENGTH) {
        submitPin(newPin);
      }
    },
    [
      pin,
      isPreparing,
      isSubmitting,
      lockedUntil,
      sharedDeviceModeDisabled,
      submitPin,
    ],
  );

  if (!deviceConfig?.restaurantId || !deviceConfig?.deviceToken) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f172a] p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">🍽</div>
          <h1 className="text-white text-lg font-semibold mb-2">
            {t("auto.noDeviceConfigured", "No Device Configured")}
          </h1>
          <p className="text-slate-400 text-sm">
            {t(
              "auto.askManagerStaffDevice",
              "Ask a manager to generate a Staff Device QR from Settings, then scan it on this device.",
            )}
          </p>
        </div>
      </div>
    );
  }

  if (lockedUntil) {
    const remainingMin = Math.ceil((lockedUntil - Date.now()) / 60000);
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f172a] p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-white text-lg font-semibold mb-2">
            {t("auto.tooManyAttempts", "Too Many Attempts")}
          </h1>
          <p className="text-slate-400 text-sm">
            {t("auto.tryAgainInMinutes", "Try again in {{count}} minutes.", {
              count: remainingMin,
            })}
          </p>
        </div>
      </div>
    );
  }

  if (sharedDeviceModeDisabled) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f172a] p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-800 mx-auto mb-4 flex items-center justify-center text-xl text-slate-200">
            ||
          </div>
          <h1 className="text-white text-lg font-semibold mb-2">
            {t("auto.staffPinLoginPaused", "Staff PIN Login Paused")}
          </h1>
          <p className="text-slate-300 text-sm font-medium mb-2">
            {restaurantName || t("auto.restaurant", "Restaurant")}
          </p>
          <p className="text-slate-400 text-sm">
            {t(
              "auto.sharedDeviceModePaused",
              "Shared Device Mode is off. This device will return to PIN login when a manager enables it again.",
            )}
          </p>
          <button
            type="button"
            onClick={() => void refreshDeviceStatus()}
            disabled={isCheckingDeviceStatus}
            className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {isCheckingDeviceStatus
              ? t("auto.checking", "Checking...")
              : t("auto.checkAgain", "Check again")}
          </button>
        </div>
      </div>
    );
  }

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center bg-[#0f172a] px-6 py-12"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <div className="text-center mb-12">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 mx-auto mb-4 flex items-center justify-center text-xl text-white">
          🍽
        </div>
        <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">
          {t("auto.sharedDevice", "Shared Device")}
        </div>
        <div className="text-slate-100 text-lg font-semibold">
          {restaurantName || t("auto.restaurant", "Restaurant")}
        </div>
      </div>

      <div
        className={`flex gap-4 justify-center mb-10 ${error ? "animate-[shake_0.4s_ease-in-out]" : ""}`}
      >
        {dots.map((filled, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full border-2 transition-colors duration-200"
            style={{
              borderColor: error ? "#ef4444" : filled ? "#6366f1" : "#475569",
              backgroundColor: error
                ? "#ef4444"
                : filled
                  ? "#6366f1"
                  : "transparent",
            }}
          />
        ))}
      </div>

      {error && (
        <div className="text-red-500 text-sm mb-6 text-center">{error}</div>
      )}

      {(isPreparing || isSubmitting) && (
        <div className="text-slate-400 text-sm mb-6">
          {isPreparing
            ? t("auto.preparingDevice", "Preparing device...")
            : t("auto.verifying", "Verifying...")}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button
            key={digit}
            onClick={() => handleKeyPress(digit.toString())}
            disabled={isPreparing || isSubmitting}
            className="aspect-square bg-[#1e293b] rounded-2xl flex items-center justify-center text-slate-100 text-2xl font-semibold active:bg-[#334155] transition-colors disabled:opacity-50"
          >
            {digit}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleKeyPress("0")}
          disabled={isPreparing || isSubmitting}
          className="aspect-square bg-[#1e293b] rounded-2xl flex items-center justify-center text-slate-100 text-2xl font-semibold active:bg-[#334155] transition-colors disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => handleKeyPress("backspace")}
          disabled={isPreparing || isSubmitting || pin.length === 0}
          className="aspect-square bg-[#1e293b] rounded-2xl flex items-center justify-center text-red-500 text-xl active:bg-[#334155] transition-colors disabled:opacity-30"
        >
          ⌫
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-4px); }
        }
      `}</style>
    </div>
  );
}
