import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { exchangeImpersonation } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function ImpersonationExchangePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (!code || ran.current) return;
    ran.current = true;

    exchangeImpersonation(code)
      .then(() => refreshUser())
      .then(() => navigate("/dashboard", { replace: true }))
      .catch(() =>
        navigate("/login?error=impersonation_failed", { replace: true }),
      );
  }, [code, navigate, refreshUser]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent mx-auto" />
        <p className="text-sm text-slate-400">Opening tenant session…</p>
      </div>
    </div>
  );
}
