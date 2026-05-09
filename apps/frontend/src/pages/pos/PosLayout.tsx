import { Outlet } from "react-router-dom";

export default function PosLayout() {
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      <Outlet />
    </div>
  );
}
