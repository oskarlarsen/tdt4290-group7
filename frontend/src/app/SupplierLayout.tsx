import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Truck,
  BadgeCheck,
  Zap,
  Scale,
  ShieldAlert,
  Bell,
  AlertTriangle,
  ClipboardList,
  Users,
} from "lucide-react";
import { ProfileMenu } from "../components/ui/ProfileMenu";
import { NotificationBell } from "../components/ui/NotificationBell";

const NAV = [
  { to: "dashboard", label: "Dashbord", icon: LayoutDashboard },
  { to: "onboarding", label: "Registrering", icon: ClipboardList },
  { to: "company", label: "Mitt selskap", icon: Building2 },
  { to: "contracts", label: "Mine avtaler", icon: FileText },
  { to: "vehicles", label: "Mine kjøretøy", icon: Truck },
  { to: "certificates", label: "Mine sertifikater", icon: BadgeCheck },
  { to: "energy", label: "Energi", icon: Zap },
  { to: "compliance", label: "Min miljøoppfølging", icon: Scale },
  { to: "risk", label: "Min risiko og prediksjon", icon: ShieldAlert },
  { to: "alerts", label: "Mine varsler", icon: Bell },
  { to: "team", label: "Mine kollegaer", icon: Users },
  { to: "required-actions", label: "Påkrevde tiltak", icon: AlertTriangle },
];

export function SupplierLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-900 focus:shadow-card">Hopp til hovedinnhold</a>
      <aside className="flex w-14 shrink-0 flex-col md:w-60 border-r border-neutral-100 bg-white">
        <div className="flex items-center justify-center gap-2 px-2 py-4 md:justify-start md:px-4">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <div className="hidden md:block">
            <div className="font-headline text-sm font-semibold leading-tight text-neutral-900">
              Miljø &amp; Kontrakt
            </div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-neutral-500">
              Leverandørportal
            </div>
          </div>
        </div>

        <div className="hidden px-4 pb-1 pt-3 text-[10px] md:block font-mono uppercase tracking-wide text-neutral-500">
          Leverandørvalg
        </div>

        <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) =>
                  `flex items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-sm md:justify-start font-medium transition-colors ${
                    isActive ? "bg-primary-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden flex-1 break-words leading-tight md:block">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="hidden border-t border-neutral-100 p-3 md:block">
          <ProfileMenu variant="full" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toppfelt for leverandør */}
        <div className="flex items-center justify-end gap-4 border-b border-neutral-100 bg-white px-6 py-3 h-14">
          <div className="flex items-center gap-2">
            {/* The bell lists this supplier's own notifications only; the supplier search stays admin-only. */}
            <NotificationBell />
            <ProfileMenu variant="compact" />
          </div>
        </div>
        <main id="main" tabIndex={-1} className="flex-1 p-6 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}