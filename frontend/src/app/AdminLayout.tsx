import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FilterSidebar } from "../components/ui/FilterSidebar";
import { useAuth } from "../hooks/useAuth";

const NAV = [
  { to: "dashboard", label: "Dashboard" },
  { to: "suppliers", label: "Suppliers" },
  { to: "contracts", label: "Contracts" },
  { to: "vehicles", label: "Vehicles" },
  { to: "certificates", label: "Environmental Certificates" },
  { to: "energy", label: "Energy & Fuel" },
  { to: "risk", label: "Risk & Prediction" },
  { to: "alerts", label: "Alerts" },
  { to: "reports", label: "Reports" },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-4">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user?.name}</span>
          <button onClick={handleLogout} className="underline">
            Log out
          </button>
        </div>
      </header>
      <div className="flex flex-1">
        <FilterSidebar />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}