import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ALLOWED_ROLES = ["OWNER", "STAFF"];

export default function StaffRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!ALLOWED_ROLES.includes(user.role?.toUpperCase())) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}
