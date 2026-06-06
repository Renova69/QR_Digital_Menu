import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyDeviceEnrollment } from "../lib/api";
import { useTranslation } from "react-i18next";

type EnrollState = "verifying" | "ready" | "error";

export default function DeviceEnrollPage() {
    const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<EnrollState>("verifying");
  const [message, setMessage] = useState("Verifying device link...");
  const [restaurantName, setRestaurantName] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      setMessage("This device enrollment link is missing its token.");
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const result = await verifyDeviceEnrollment(token);
        if (cancelled) return;

        localStorage.setItem(
          "sharedDevice",
          JSON.stringify({
            restaurantId: result.restaurantId,
            restaurantName: result.restaurantName,
            allowedModes: result.allowedModes,
            deviceToken: token,
            bondedAt: new Date().toISOString(),
          }),
        );

        setRestaurantName(result.restaurantName);
        setState("ready");
        setMessage("Device linked. Opening staff PIN login...");
        setTimeout(() => navigate("/device-login", { replace: true }), 1000);
      } catch (err: any) {
        if (cancelled) return;
        setState("error");
        setMessage(
          err.response?.data?.message ||
            "This device enrollment link is invalid or expired.",
        );
      }
    };

    void verify();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0f172a] p-6 text-slate-100">
      <div className="w-full max-w-sm text-center">
        <div
          className={`mx-auto mb-5 h-14 w-14 rounded-xl flex items-center justify-center text-2xl ${
            state === "error"
              ? "bg-red-500/20 text-red-300"
              : "bg-indigo-600 text-white"
          }`}
        >
          {state === "error" ? "!" : "OK"}
        </div>

        <h1 className="text-xl font-semibold mb-2">
          {state === "error"
            ? "Device Link Failed"
            : state === "ready"
              ? "Device Linked"
              : "Linking Device"}
        </h1>

        {restaurantName && (
          <p className="text-sm text-indigo-200 font-medium mb-2">
            {restaurantName}
          </p>
        )}

        <p className="text-sm text-slate-400">{message}</p>

        {state === "error" && (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-slate-500">
              {t('auto.askAManagerToGenerateAFreshStaff', 'Ask a manager to generate a fresh staff device QR from Settings.')}</p>
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {t('auto.managerLogin', 'Manager Login')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
