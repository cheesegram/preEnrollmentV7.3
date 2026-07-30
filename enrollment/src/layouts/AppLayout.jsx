import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";

function AppLayout() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-900">
      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />

      <div className="min-h-screen md:pl-[18rem]">
        <AppHeader onOpenNavigation={() => setNavigationOpen(true)} />
        <main className="relative min-h-[calc(100vh-4.75rem)] overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(15,118,110,0.06),transparent_28%)]" />
          <div className="pointer-events-none absolute right-[-7rem] top-20 h-96 w-96 rounded-full border-[4rem] border-emerald-900/[0.025]" />
          <div className="relative">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
