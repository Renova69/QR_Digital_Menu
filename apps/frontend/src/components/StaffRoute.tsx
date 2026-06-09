import { type ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRestaurantContext } from "../context/RestaurantContext";
import { useFeature } from "../hooks/useFeature";

const ALLOWED_ROLES = ["OWNER", "MANAGER", "WAITER", "KITCHEN", "STAFF"];

/** Device roles that require the POS feature to be enabled. OWNER/MANAGER/STAFF
 *  reach the dashboard via a different layout and are not POS-gated here. */
const POS_REQUIRED_ROLES = ["WAITER", "KITCHEN"];

const ROLE_DEFAULT_PATH: Record<string, string> = {
  WAITER: "/staff/pos",
  KITCHEN: "/staff/kitchen",
};

export default function StaffRoute({ children }: { children: ReactElement }) {
  const { user, isLoading } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const location = useLocation();
  const canPos = useFeature('pos');

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

  // L2.5 — If the restaurant's effective tier no longer includes POS, device
  // roles (WAITER/KITCHEN) should not reach the POS/KDS pages. The backend
  // already blocks pinLogin on downgrade (H2.2); this prevents a stale session
  // from landing on the POS page with all API calls failing silently.
  if (POS_REQUIRED_ROLES.includes(role) && activeRestaurant && !canPos) {
    return <Navigate to="/login" replace />;
  }

  const defaultPath = ROLE_DEFAULT_PATH[role];
  if (defaultPath && location.pathname !== defaultPath) {
    return <Navigate to={defaultPath} replace />;
  }

  return children;
}
