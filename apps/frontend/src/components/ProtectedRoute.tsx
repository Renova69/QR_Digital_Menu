import { type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DASHBOARD_BLOCKED_ROLES = ["WAITER", "KITCHEN"];

export default function ProtectedRoute({
  children,
}: {
  children: ReactElement;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = user.role?.toUpperCase();

  if (role === "CUSTOMER" && !location.pathname.startsWith("/profile")) {
    return <Navigate to="/profile" replace />;
  }

  if (role === "OWNER" && !user.onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  if (
    DASHBOARD_BLOCKED_ROLES.includes(role) &&
    location.pathname.startsWith("/dashboard")
  ) {
    const redirect = role === "WAITER" ? "/staff/pos" : "/staff/kitchen";
    return <Navigate to={redirect} replace />;
  }

  return children;
}
