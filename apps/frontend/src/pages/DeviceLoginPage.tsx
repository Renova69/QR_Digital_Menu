import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;

const ROLE_REDIRECT: Record<string, string> = {
  WAITER: "/staff/pos",
  KITCHEN: "/staff/kitchen",
};

export default function DeviceLoginPage() {
  const navigate = useNavigate();
  const { loginWithToken, logout } = useAuth();
  const clearedExistingSession = useRef(false);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(true);
  const [restaurantName, setRestaurantName] = useState("");

  const deviceConfig = useMemo(() => {
    try {
      const raw = localStorage.getItem("sharedDevice");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

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
      if (!deviceConfig?.restaurantId) return;
      setIsSubmitting(true);
      setError("");

      try {
        const res = await api.post("/auth/pin-login", {
          restaurantId: deviceConfig.restaurantId,
          pin: pinCode,
        });
        const user = res.data.user;
        const role = user?.role?.toUpperCase();
        loginWithToken(user);
        const target = ROLE_REDIRECT[role] || "/dashboard";
        navigate(target, { replace: true });
      } catch (err: any) {
        const msg = err.response?.data?.message || "Invalid PIN";
        setError(msg);

        const match = msg.match(/(\d+)\s+attempts?\s+remaining/i);
        if (match) {
          setAttemptsLeft(parseInt(match[1], 10));
        } else {
          setAttemptsLeft((prev) => Math.max(0, prev - 1));
        }

        const lockoutMatch = msg.match(/try again in (\d+)\s+minutes/i);
        if (lockoutMatch) {
          const minutes = parseInt(lockoutMatch[1], 10);
          setLockedUntil(Date.now() + minutes * 60 * 1000);
        }

        setPin("");
      } finally {
        setIsSubmitting(false);
      }
    },
    [deviceConfig, loginWithToken, navigate]
  );

  const handleKeyPress = useCallback(
    (digit: string) => {
      if (isPreparing || isSubmitting || lockedUntil) return;
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
    [pin, isPreparing, isSubmitting, lockedUntil, submitPin]
  );

  if (!deviceConfig?.restaurantId) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f172a] p-6">
        <div className="text-center">
          <div className="text-5xl mb-4">🍽</div>
          <h1 className="text-white text-lg font-semibold mb-2">No Device Configured</h1>
          <p className="text-slate-400 text-sm">
            Ask a manager to generate a Staff Device QR from Settings, then scan it on this device.
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
          <h1 className="text-white text-lg font-semibold mb-2">Too Many Attempts</h1>
          <p className="text-slate-400 text-sm">
            Try again in {remainingMin} minute{remainingMin !== 1 ? "s" : ""}.
          </p>
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
          Shared Device
        </div>
        <div className="text-slate-100 text-lg font-semibold">
          {restaurantName || "Restaurant"}
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
              backgroundColor: error ? "#ef4444" : filled ? "#6366f1" : "transparent",
            }}
          />
        ))}
      </div>

      {error && (
        <div className="text-red-500 text-sm mb-6 text-center">
          {error}
        </div>
      )}

      {(isPreparing || isSubmitting) && (
        <div className="text-slate-400 text-sm mb-6">
          {isPreparing ? "Preparing device..." : "Verifying..."}
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
