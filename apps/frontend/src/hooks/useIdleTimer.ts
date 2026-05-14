import { useEffect, useRef } from "react";

export function useIdleTimer(
  onIdle: () => void,
  timeoutMs: number = 5 * 60 * 1000
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onIdle, timeoutMs);
    };

    const events = ["pointerdown", "keydown", "touchstart"] as const;

    resetTimer();

    for (const event of events) {
      document.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of events) {
        document.removeEventListener(event, resetTimer);
      }
    };
  }, [onIdle, timeoutMs]);
}
