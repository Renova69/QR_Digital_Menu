import { type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRestaurantContext } from "../context/RestaurantContext";
import { useFeature } from "../hooks/useFeature";

const ALLOWED_ROLES = ["OWNER", "MANAGER", "WAITER", "KITCHEN", "STAFF"];

const ROLE_DEFAULT_PATH: Record<string, string> = {
  WAITER: "/staff/pos",
  KITCHEN: "/staff/kitchen",
};

export default function StaffRoute({ children }: { children: ReactElement }) {
  const { user, isLoading } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const location = useLocation();
  const canPos = useFeature("pos");
  const canKds = useFeature("kds");

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

  if (activeRestaurant?.isActive === false) {
    return <Navigate to="/login" replace />;
  }

  // Device roles must retain the entitlement for their own workspace.
  if (
    activeRestaurant &&
    ((role === "WAITER" && !canPos) || (role === "KITCHEN" && !canKds))
  ) {
    return <Navigate to="/login" replace />;
  }

  const defaultPath = ROLE_DEFAULT_PATH[role];
  if (defaultPath && location.pathname !== defaultPath) {
    return <Navigate to={defaultPath} replace />;
  }

  return children;
}
