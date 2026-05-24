import { Outlet } from "react-router-dom";

export default function PosLayout() {
  return (
    <div className="h-dvh flex flex-col text-foreground" style={{ background: 'hsl(245 40% 7%)' }}>
      <Outlet />
    </div>
  );
}
