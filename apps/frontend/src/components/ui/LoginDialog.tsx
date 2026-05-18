import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

interface LoginDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  defaultIsLogin?: boolean;
}

export const LoginDialog: React.FC<LoginDialogProps> = ({
  open,
  onOpenChange,
  children,
  defaultIsLogin = true,
}) => {
  const [isLogin, setIsLogin] = useState(defaultIsLogin);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, register, isLoading, errorMessage } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch {
      // Error already handled by AuthContext
    }
  };

  const handleToggle = () => {
    if (isLogin) {
      if (onOpenChange) onOpenChange(false);
      navigate("/register");
    } else {
      if (onOpenChange) onOpenChange(false);
      navigate("/login");
    }
  };

  const handleGoogleLogin = () => {
    const backendBase = import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/v1`
      : "http://localhost:3000/api/v1";
    window.location.href = `${backendBase}/auth/google`;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children && <Dialog.Trigger asChild>{children}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="bg-black/50 backdrop-blur-sm fixed inset-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-background p-6 rounded-2xl shadow-2xl border border-border/60">
          <Dialog.Title className="text-lg font-bold text-foreground">
            {isLogin ? "Login" : "Create an account"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {isLogin
              ? "Access your dashboard."
              : "Get started with your own QR menu."}
          </Dialog.Description>

          <div className="mt-4">
            <button
              onClick={handleGoogleLogin}
              className="w-full inline-flex justify-center py-2.5 px-4 border border-border rounded-xl shadow-sm bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
            >
              Sign in with Google
            </button>
          </div>

          <div className="mt-4 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-background text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 p-4 bg-destructive/10 border-2 border-destructive/30 rounded-xl animate-pulse">
              <div className="flex items-center gap-2 text-destructive">
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-semibold">{errorMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full px-3 py-2.5 border border-border rounded-xl shadow-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={8}
                className="w-full px-3 py-2.5 border border-border rounded-xl shadow-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-accent-foreground bg-accent hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-colors"
            >
              {isLoading ? "..." : isLogin ? "Login" : "Create account"}
            </button>
          </form>

          <div className="mt-4 text-sm text-center">
            <button
              type="button"
              onClick={handleToggle}
              className="font-medium text-accent hover:text-accent/80 transition-colors"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Login"}
            </button>
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground hover:bg-secondary transition-colors"
              aria-label="Close"
            >
              <Cross2Icon />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
