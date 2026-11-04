import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Truck,
  BadgeCheck,
  Zap,
  CheckCircle2,
  ShieldAlert,
  Bell,
  AlertTriangle
} from "lucide-react";
import { ProfileMenu } from "../components/ui/ProfileMenu";

const NAV = [
  { to: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "company", label: "My Company", icon: Building2 },
  { to: "contracts", label: "My Contracts", icon: FileText },
  { to: "vehicles", label: "My Vehicles", icon: Truck },
  { to: "certificates", label: "My Certificates", icon: BadgeCheck },
  { to: "energy", label: "Energy & Fuel", icon: Zap },
  { to: "compliance", label: "My Compliance", icon: CheckCircle2 },
  { to: "risk", label: "My Risk & Prediction", icon: ShieldAlert },
  { to: "alerts", label: "My Alerts", icon: Bell },
  { to: "required-actions", label: "Required Actions", icon: AlertTriangle },
];

export function SupplierLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-100 bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <div>
            <div className="font-headline text-sm font-semibold leading-tight text-neutral-900">
              Miljø &amp; Kontrakt
            </div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-neutral-400">
              Supplier Portal
            </div>
          </div>
        </div>

        <div className="px-4 pb-1 pt-3 text-[10px] font-mono uppercase tracking-wide text-neutral-400">
          Supplier Actions
        </div>

        <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-primary-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-neutral-100 p-3">
          <ProfileMenu variant="full" />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Supplier-safe Top Bar */}
        <div className="flex items-center justify-end gap-4 border-b border-neutral-100 bg-white px-6 py-3 h-14">
          <div className="flex items-center gap-2">
            {/* Omitted SearchSuppliers and NotificationBell as per constraints */}
            <ProfileMenu variant="compact" />
          </div>
        </div>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}