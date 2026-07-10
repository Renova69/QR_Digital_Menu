import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyDeviceEnrollment } from "../lib/api";
import { useTranslation } from "react-i18next";

type EnrollState = "verifying" | "ready" | "error" | "shared-device-off";

type SharedDeviceConfig = {
  restaurantId?: string;
  restaurantName?: string;
  deviceToken?: string;
};

type DeviceEnrollmentResult = Awaited<
  ReturnType<typeof verifyDeviceEnrollment>
>;

const verificationRequests = new Map<string, Promise<DeviceEnrollmentResult>>();

function verifyDeviceEnrollmentOnce(token: string) {
  let request = verificationRequests.get(token);
  if (!request) {
    request = verifyDeviceEnrollment(token).finally(() => {
      verificationRequests.delete(token);
    });
    verificationRequests.set(token, request);
  }
  return request;
}

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

function isAlreadyUsedEnrollmentError(error: any) {
  const status = error?.response?.status;
  const message = getApiMessage(error).toLowerCase();
  return (
    status === 410 && message.includes("already") && message.includes("used")
  );
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

export default function DeviceEnrollPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const [state, setState] = useState<EnrollState>("verifying");
  const [message, setMessage] = useState("Verifying device link...");
  const [restaurantName, setRestaurantName] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This device enrollment link is missing its token.");
      return;
    }

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const verify = async () => {
      try {
        const result = await verifyDeviceEnrollmentOnce(token);
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
        redirectTimer = setTimeout(
          () => navigate("/device-login", { replace: true }),
          1000,
        );
      } catch (err: any) {
        if (cancelled) return;
        const existingDevice = readSharedDeviceConfig();
        const alreadyUsed = isAlreadyUsedEnrollmentError(err);
        const hasUsableDeviceBond =
          !!existingDevice?.restaurantId && !!existingDevice?.deviceToken;

        if (isSharedDeviceDisabledError(err)) {
          setState("shared-device-off");
          setMessage(
            getApiMessage(err) ||
              "Shared Device Mode is off. Ask a manager to enable it before enrolling this device.",
          );
          return;
        }

        if (alreadyUsed && existingDevice?.deviceToken === token) {
          setRestaurantName(existingDevice.restaurantName || "");
          setState("ready");
          setMessage(
            "This device is already linked. Opening staff PIN login...",
          );
          redirectTimer = setTimeout(
            () => navigate("/device-login", { replace: true }),
            1000,
          );
          return;
        }

        if (alreadyUsed && !hasUsableDeviceBond) {
          setState("error");
          setMessage(
            "This QR link has already been used, and this device is not linked. Ask a manager to generate a fresh Staff Device QR, then scan it once on this device.",
          );
          return;
        }

        setState("error");
        setMessage(
          getApiMessage(err) ||
            "This device enrollment link is invalid or expired.",
        );
      }
    };

    void verify();

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [navigate, token]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0f172a] p-6 text-slate-100">
      <div className="w-full max-w-sm text-center">
        <div
          className={`mx-auto mb-5 h-14 w-14 rounded-xl flex items-center justify-center text-2xl ${
            state === "error" || state === "shared-device-off"
              ? "bg-red-500/20 text-red-300"
              : "bg-indigo-600 text-white"
          }`}
        >
          {state === "error" || state === "shared-device-off" ? "!" : "OK"}
        </div>

        <h1 className="text-xl font-semibold mb-2">
          {state === "shared-device-off"
            ? "Shared Device Mode Off"
            : state === "error"
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

        {(state === "error" || state === "shared-device-off") && (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-slate-500">
              {state === "shared-device-off"
                ? t(
                    "auto.enableSharedDeviceModeFirst",
                    "Ask a manager to enable Shared Device Mode in Staff settings, then generate a fresh Staff Device QR for this device.",
                  )
                : t(
                    "auto.askAManagerToGenerateAFreshStaff",
                    "Ask a manager to generate a fresh staff device QR from Settings.",
                  )}
            </p>
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {t("auto.managerLogin", "Manager Login")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
