import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";

interface CustomerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnTo: string;
}

type Step = "entry" | "otp" | "welcome";
type Channel = "email" | "phone";

const COUNTRIES = [
  { code: "+359", flag: "🇧🇬", label: "BG" },
  { code: "+40",  flag: "🇷🇴", label: "RO" },
  { code: "+30",  flag: "🇬🇷", label: "GR" },
  { code: "+90",  flag: "🇹🇷", label: "TR" },
  { code: "+49",  flag: "🇩🇪", label: "DE" },
  { code: "+44",  flag: "🇬🇧", label: "UK" },
  { code: "+33",  flag: "🇫🇷", label: "FR" },
  { code: "+39",  flag: "🇮🇹", label: "IT" },
  { code: "+34",  flag: "🇪🇸", label: "ES" },
  { code: "+1",   flag: "🇺🇸", label: "US" },
];

export const CustomerLoginModal: React.FC<CustomerLoginModalProps> = ({
  isOpen,
  onClose,
  returnTo,
}) => {
  const { loginWithToken } = useAuth();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("entry");
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+359");
  const [localPhone, setLocalPhone] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [deliveryChannel, setDeliveryChannel] = useState<string>("email");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fullPhone = countryCode + localPhone.replace(/^0+/, "").replace(/\D/g, "");

  useEffect(() => {
    if (!isOpen) {
      setStep("entry");
      setChannel("email");
      setEmail("");
      setName("");
      setCountryCode("+359");
      setLocalPhone("");
      setCode("");
      setError("");
      setDevCode("");
      setCountdown(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const validatePhone = (p: string) => /^\+[1-9]\d{6,14}$/.test(p);
  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (channel === "email") {
      if (!validateEmail(email)) { setError(t("auth.otp.invalidEmail", "Enter a valid email address.")); return; }
    } else {
      if (!validatePhone(fullPhone)) { setError(t("auth.otp.invalidPhone", "Enter your phone number.")); return; }
    }
    setIsLoading(true);
    try {
      const payload: any = channel === "email" ? { email: email.trim() } : { phone: fullPhone };
      const res = await api.post("/auth/otp/send", payload);
      if (res.data.devCode) setDevCode(res.data.devCode);
      setDeliveryChannel(res.data.channel || channel);
      setStep("otp");
      startCountdown();
    } catch (err: any) {
      setError(err.response?.data?.message || t("auth.otp.tooManyRequests"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const trimmedName = name.trim() || undefined;
      const payload: any = channel === "email"
        ? { email: email.trim(), code, name: trimmedName }
        : { phone: fullPhone, code, name: trimmedName };

      const res = await api.post("/auth/otp/verify", payload);
      // Store menu URL so customer logout can return here
      if (res.data.user?.role === "CUSTOMER" && returnTo) {
        localStorage.setItem("customerMenuUrl", returnTo);
      }
      loginWithToken(res.data.user);
      if (res.data.isNew) { setStep("welcome"); } else { onClose(); }
    } catch (err: any) {
      setError(err.response?.data?.message || t("auth.otp.invalidCode"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setIsLoading(true);
    setError("");
    try {
      const payload: any = channel === "email" ? { email: email.trim() } : { phone: fullPhone };
      const res = await api.post("/auth/otp/send", payload);
      if (res.data.devCode) setDevCode(res.data.devCode);
      startCountdown();
    } catch (err: any) {
      setError(err.response?.data?.message || t("auth.otp.tooManyRequests"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    const backendBase = (import.meta as any).env.VITE_API_URL
      ? `${(import.meta as any).env.VITE_API_URL}/v1`
      : "http://localhost:3000/api/v1";
    window.location.href = `${backendBase}/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const deliveryDescription = deliveryChannel === "whatsapp"
    ? t("auth.otp.sentViaWhatsApp", "Sent via WhatsApp to") + ` ${fullPhone}`
    : deliveryChannel === "sms"
    ? t("auth.otp.sentViaSms", "Sent via SMS to") + ` ${fullPhone}`
    : t("auth.otp.sentTo", { email });

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background w-full max-w-sm p-6 rounded-2xl shadow-xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ── Entry step ── */}
        {step === "entry" && (
          <>
            <h2 className="text-2xl font-bold mb-1 text-center">{t("auth.otp.title")}</h2>
            <p className="text-sm text-muted-foreground text-center mb-5">{t("auth.otp.subtitle")}</p>

            <Button type="button" onClick={handleGoogleAuth} variant="outline"
              className="w-full flex items-center justify-center gap-3 h-12 rounded-xl mb-4">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t("auth.otp.continueWithGoogle")}
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("auth.otp.orDivider")}</span>
              </div>
            </div>

            <div className="flex rounded-xl border border-border overflow-hidden mb-4">
              <button type="button"
                onClick={() => { setChannel("email"); setError(""); }}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${channel === "email" ? "bg-foreground text-background" : "hover:bg-secondary/60 text-muted-foreground"}`}>
                {t("auth.otp.tabEmail", "Email")}
              </button>
              <button type="button"
                onClick={() => { setChannel("phone"); setError(""); }}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${channel === "phone" ? "bg-foreground text-background" : "hover:bg-secondary/60 text-muted-foreground"}`}>
                {t("auth.otp.tabPhone", "Phone")}
              </button>
            </div>

            <form onSubmit={handleSendCode} className="space-y-3">
              {channel === "email" ? (
                <>
                  <Input type="email" placeholder={t("auth.otp.emailPlaceholder")}
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    required className="h-12 rounded-xl" autoFocus />
                  <Input type="text" placeholder={t("auth.otp.namePlaceholder", "Your name (optional)")}
                    value={name} onChange={(e) => setName(e.target.value)}
                    className="h-12 rounded-xl" />
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="h-12 rounded-xl border border-input bg-background px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label="Country code"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                      ))}
                    </select>
                    <Input
                      type="tel"
                      placeholder="888 123 456"
                      value={localPhone}
                      onChange={(e) => setLocalPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                      required
                      className="h-12 rounded-xl flex-1"
                      autoFocus
                    />
                  </div>
                  <Input type="text" placeholder={t("auth.otp.namePlaceholder", "Your name (optional)")}
                    value={name} onChange={(e) => setName(e.target.value)}
                    className="h-12 rounded-xl" />
                </>
              )}

              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl">
                {isLoading ? t("auth.otp.sending") : t("auth.otp.sendCode")}
              </Button>
            </form>
          </>
        )}

        {/* ── OTP step ── */}
        {step === "otp" && (
          <>
            <h2 className="text-2xl font-bold mb-1 text-center">{t("auth.otp.enterCode")}</h2>
            <p className="text-sm text-muted-foreground text-center mb-4">{deliveryDescription}</p>

            {devCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                <p className="text-xs font-mono font-bold text-yellow-600 dark:text-yellow-400">
                  {t("auth.otp.devCodeBanner", { code: devCode })}
                </p>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <Input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required className="h-14 rounded-xl text-center text-2xl font-black tracking-[0.5em]"
                autoFocus />

              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              <Button type="submit" disabled={isLoading || code.length !== 6} className="w-full h-12 rounded-xl">
                {isLoading ? t("auth.otp.verifying") : t("auth.otp.verify")}
              </Button>

              <div className="flex justify-between items-center text-sm">
                <button type="button"
                  onClick={() => { setStep("entry"); setCode(""); setError(""); }}
                  className="text-muted-foreground hover:text-foreground">
                  {channel === "email" ? t("auth.otp.changeEmail") : t("auth.otp.changePhone", "Change number")}
                </button>
                <button type="button" onClick={handleResend} disabled={countdown > 0}
                  className="text-primary hover:opacity-70 disabled:opacity-40">
                  {countdown > 0 ? t("auth.otp.resendIn", { seconds: countdown }) : t("auth.otp.resend")}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Welcome step ── */}
        {step === "welcome" && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">{t("auth.otp.welcomeTitle")}</h2>
            <p className="text-sm text-muted-foreground mb-6">{t("auth.otp.welcomeBody")}</p>
            <Button onClick={onClose} className="w-full h-12 rounded-xl">{t("auth.otp.letsOrder")}</Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
