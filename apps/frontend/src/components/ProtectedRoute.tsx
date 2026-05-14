import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DASHBOARD_BLOCKED_ROLES = ["WAITER", "KITCHEN"];

export default function ProtectedRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = user.role?.toUpperCase();

  if (role === "CUSTOMER" && !location.pathname.startsWith("/profile")) {
    return <Navigate to="/profile" replace />;
  }

  if (
    DASHBOARD_BLOCKED_ROLES.includes(role) &&
    location.pathname.startsWith("/dashboard")
  ) {
    const redirect =
      role === "WAITER" ? "/staff/pos" : "/staff/kitchen";
    return <Navigate to={redirect} replace />;
  }

  return children;
}
