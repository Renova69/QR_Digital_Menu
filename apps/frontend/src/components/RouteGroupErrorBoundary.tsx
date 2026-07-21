import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";

interface RouteGroupErrorBoundaryProps {
  children?: ReactNode;
}

export default function RouteGroupErrorBoundary({
  children,
}: RouteGroupErrorBoundaryProps) {
  const location = useLocation();

  return (
    <ErrorBoundary key={location.pathname}>
      {children ?? <Outlet />}
    </ErrorBoundary>
  );
}
