import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import api from "../../lib/api";

interface CustomerLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnTo: string;
}

export const CustomerLoginModal: React.FC<CustomerLoginModalProps> = ({
  isOpen,
  onClose,
  returnTo,
}) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await api.post("/auth/magic-link", { email, returnTo });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send magic link");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    const apiUrl =
      (import.meta as any).env.VITE_API_URL || "http://localhost:3000/api";
    const baseUrl = apiUrl.replace("/api", "");
    window.location.href = `${baseUrl}/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background w-full max-w-sm p-6 rounded-2xl shadow-xl relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <svg
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="text-2xl font-bold mb-6 text-center">Sign In</h2>

        {success ? (
          <div className="text-center p-4 bg-green-500/10 text-green-600 rounded-xl">
            <p className="font-semibold">Magic link generated!</p>
            <p className="text-sm mt-2">
              Check the backend console in this dev environment.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <Button
              type="button"
              onClick={handleGoogleAuth}
              variant="outline"
              className="w-full flex items-center justify-center gap-3 h-12 rounded-xl"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>

            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="sr-only">Email address</label>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl"
              >
                {isLoading ? "Sending..." : "Send Magic Link"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
