import { useLocation } from "react-router-dom";
import logo from "../assets/iitilogo.png";
import { getNavigationItem } from "../config/navigation";

function AppHeader({ onOpenNavigation }) {
  const { pathname } = useLocation();
  const current = getNavigationItem(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="flex min-h-[4.75rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenNavigation}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800 md:hidden"
          aria-label="Open navigation"
        >
          <i className="fa-solid fa-bars" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-emerald-700/70">
            IITI Enrollment System
          </p>
          <h1 className="mt-0.5 truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            {current.label}
          </h1>
        </div>

        <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 sm:flex">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-800">Institute of Information Technology</p>
            <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">and Innovation</p>
          </div>
          <img src={logo} alt="IITI logo" className="h-10 w-10 object-contain" />
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
