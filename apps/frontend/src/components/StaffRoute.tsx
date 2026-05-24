import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ALLOWED_ROLES = ["OWNER", "MANAGER", "WAITER", "KITCHEN", "STAFF"];

const ROLE_DEFAULT_PATH: Record<string, string> = {
  WAITER: "/staff/pos",
  KITCHEN: "/staff/kitchen",
};

export default function StaffRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = user.role?.toUpperCase();

  if (!ALLOWED_ROLES.includes(role)) {
    return <Navigate to="/profile" replace />;
  }

  const defaultPath = ROLE_DEFAULT_PATH[role];
  if (defaultPath && location.pathname !== defaultPath) {
    return <Navigate to={defaultPath} replace />;
  }

  return children;
}
